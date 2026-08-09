package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
)

var (
	ErrInvalidPrivacyField       = errors.New("invalid privacy field")
	ErrInvalidPrivacyVisibility  = errors.New("invalid privacy visibility")
	ErrPrivacyExceptionNotFriend = errors.New("you can only exclude accepted connections")
)

var validPrivacyVisibilities = map[string]struct{}{
	models.PrivacyVisibilityEveryone:          {},
	models.PrivacyVisibilityConnections:       {},
	models.PrivacyVisibilityConnectionsExcept: {},
	models.PrivacyVisibilityNobody:            {},
}

var validPrivacyFields = map[string]struct{}{
	models.PrivacyFieldLastSeen:     {},
	models.PrivacyFieldOnlineStatus: {},
	models.PrivacyFieldProfilePhoto: {},
	models.PrivacyFieldBio:          {},
	models.PrivacyFieldStatus:       {},
}

type PrivacyChecker interface {
	CanView(ctx context.Context, viewerID, targetID uuid.UUID, field string) (bool, error)
}

func validatePrivacyField(field string) error {
	if _, ok := validPrivacyFields[field]; !ok {
		return ErrInvalidPrivacyField
	}

	return nil
}

func ValidatePrivacyField(field string) error {
	return validatePrivacyField(field)
}

func validatePrivacyVisibility(visibility string) error {
	if _, ok := validPrivacyVisibilities[visibility]; !ok {
		return ErrInvalidPrivacyVisibility
	}

	return nil
}

func (s *AuthService) GetMyPrivacySettings(
	ctx context.Context,
	userID uuid.UUID,
) (*models.PrivacySettings, error) {
	settings, err := s.users.GetPrivacySettings(ctx, userID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("auth: failed to get privacy settings: %w", err)
	}

	return settings, nil
}

func (s *AuthService) UpdatePrivacySetting(
	ctx context.Context,
	userID uuid.UUID,
	field, visibility string,
) error {
	if err := validatePrivacyField(field); err != nil {
		return err
	}
	if err := validatePrivacyVisibility(visibility); err != nil {
		return err
	}

	err := s.users.UpdatePrivacySetting(ctx, userID, field, visibility)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrUserNotFound
	}
	if errors.Is(err, repository.ErrInvalidPrivacyField) {
		return ErrInvalidPrivacyField
	}
	if err != nil {
		return fmt.Errorf("auth: failed to update privacy setting: %w", err)
	}

	return nil
}

func (s *AuthService) GetExceptionsList(
	ctx context.Context,
	userID uuid.UUID,
	field string,
) ([]models.PrivacyExceptionUser, error) {
	if err := validatePrivacyField(field); err != nil {
		return nil, err
	}

	excludedIDs, err := s.users.GetExceptions(ctx, userID, field)
	if err != nil {
		return nil, fmt.Errorf("auth: failed to list privacy exceptions: %w", err)
	}

	results := make([]models.PrivacyExceptionUser, 0, len(excludedIDs))
	for _, excludedID := range excludedIDs {
		user, userErr := s.users.GetUserByID(ctx, excludedID.String())
		if errors.Is(userErr, repository.ErrNotFound) {
			continue
		}
		if userErr != nil {
			return nil, fmt.Errorf("auth: failed to load excluded user: %w", userErr)
		}

		results = append(results, models.PrivacyExceptionUser{
			ID:        user.ID,
			FullName:  user.FullName,
			Username:  user.Username,
			AvatarURL: user.AvatarURL,
		})
	}

	return results, nil
}

func (s *AuthService) AddPrivacyException(
	ctx context.Context,
	userID uuid.UUID,
	field string,
	excludedUserID uuid.UUID,
) error {
	if err := validatePrivacyField(field); err != nil {
		return err
	}

	if userID == excludedUserID {
		return ErrPrivacyExceptionNotFriend
	}

	connected, err := s.conversations.AreUsersConnected(ctx, userID, excludedUserID)
	if err != nil {
		return fmt.Errorf("auth: failed to check connection: %w", err)
	}
	if !connected {
		return ErrPrivacyExceptionNotFriend
	}

	if err := s.users.AddException(ctx, userID, field, excludedUserID); err != nil {
		return fmt.Errorf("auth: failed to add privacy exception: %w", err)
	}

	return nil
}

func (s *AuthService) RemovePrivacyException(
	ctx context.Context,
	userID uuid.UUID,
	field string,
	excludedUserID uuid.UUID,
) error {
	if err := validatePrivacyField(field); err != nil {
		return err
	}

	if err := s.users.RemoveException(ctx, userID, field, excludedUserID); err != nil {
		return fmt.Errorf("auth: failed to remove privacy exception: %w", err)
	}

	return nil
}

func (s *AuthService) CanView(
	ctx context.Context,
	viewerID, targetID uuid.UUID,
	field string,
) (bool, error) {
	if viewerID == targetID {
		return true, nil
	}

	if err := validatePrivacyField(field); err != nil {
		return false, err
	}

	visibility, err := s.users.GetPrivacySettingForField(ctx, targetID, field)
	if errors.Is(err, repository.ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("auth: failed to get privacy setting: %w", err)
	}

	switch visibility {
	case models.PrivacyVisibilityEveryone:
		return true, nil
	case models.PrivacyVisibilityNobody:
		return false, nil
	case models.PrivacyVisibilityConnections:
		return s.conversations.AreUsersConnected(ctx, viewerID, targetID)
	case models.PrivacyVisibilityConnectionsExcept:
		connected, err := s.conversations.AreUsersConnected(ctx, viewerID, targetID)
		if err != nil {
			return false, err
		}
		if !connected {
			return false, nil
		}

		isExcluded, err := s.users.IsPrivacyException(ctx, targetID, field, viewerID)
		if err != nil {
			return false, fmt.Errorf("auth: failed to check privacy exception: %w", err)
		}

		return !isExcluded, nil
	default:
		return false, ErrInvalidPrivacyVisibility
	}
}

func (s *AuthService) FilterPresenceRecipients(
	ctx context.Context,
	targetUserID uuid.UUID,
	connectedUserIDs []uuid.UUID,
) ([]uuid.UUID, error) {
	recipients := make([]uuid.UUID, 0, len(connectedUserIDs))

	for _, viewerID := range connectedUserIDs {
		if viewerID == targetUserID {
			continue
		}

		canView, err := s.CanView(ctx, viewerID, targetUserID, models.PrivacyFieldOnlineStatus)
		if err != nil {
			return nil, err
		}
		if canView {
			recipients = append(recipients, viewerID)
		}
	}

	return recipients, nil
}

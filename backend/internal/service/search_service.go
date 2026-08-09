package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
)

const defaultUserSearchLimit = 20

func (s *AuthService) SearchUsers(
	ctx context.Context,
	currentUserID uuid.UUID,
	query string,
) ([]models.UserSearchResult, error) {
	trimmedQuery := strings.TrimSpace(query)
	if trimmedQuery == "" || utf8.RuneCountInString(trimmedQuery) < 1 {
		return nil, ErrInvalidSearchQuery
	}

	users, err := s.users.SearchByUsername(ctx, trimmedQuery, currentUserID, defaultUserSearchLimit)
	if err != nil {
		return nil, fmt.Errorf("auth: failed to search users: %w", err)
	}

	results := make([]models.UserSearchResult, 0, len(users))
	for _, user := range users {
		result := models.UserSearchResult{
			ID:       user.ID,
			FullName: user.FullName,
			Username: user.Username,
		}

		targetID, parseErr := uuid.Parse(user.ID)
		if parseErr != nil {
			return nil, fmt.Errorf("auth: invalid user id in search results: %w", parseErr)
		}

		canViewPhoto, privacyErr := s.CanView(ctx, currentUserID, targetID, models.PrivacyFieldProfilePhoto)
		if privacyErr != nil {
			return nil, fmt.Errorf("auth: failed to check profile photo privacy: %w", privacyErr)
		}
		if canViewPhoto {
			result.AvatarURL = user.AvatarURL
		}

		results = append(results, result)
	}

	return results, nil
}

func (s *AuthService) GetPublicProfile(
	ctx context.Context,
	viewerID uuid.UUID,
	username string,
) (*models.PublicProfile, error) {
	trimmedUsername := strings.TrimSpace(username)
	if trimmedUsername == "" {
		return nil, ErrPublicProfileNotFound
	}

	user, relationshipStatus, conversationID, err := s.users.GetPublicProfileByUsername(ctx, viewerID, trimmedUsername)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrPublicProfileNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("auth: failed to get public profile: %w", err)
	}

	if user.IsDeleted {
		return nil, ErrUserNoLongerExists
	}

	targetID, err := uuid.Parse(user.ID)
	if err != nil {
		return nil, fmt.Errorf("auth: invalid user id on public profile: %w", err)
	}

	canViewBio, err := s.CanView(ctx, viewerID, targetID, models.PrivacyFieldBio)
	if err != nil {
		return nil, fmt.Errorf("auth: failed to check bio privacy: %w", err)
	}

	canViewPhoto, err := s.CanView(ctx, viewerID, targetID, models.PrivacyFieldProfilePhoto)
	if err != nil {
		return nil, fmt.Errorf("auth: failed to check profile photo privacy: %w", err)
	}

	profile := &models.PublicProfile{
		ID:                 user.ID,
		FullName:           user.FullName,
		Username:           user.Username,
		RelationshipStatus: relationshipStatus,
		ConversationID:     conversationID,
	}

	if canViewBio {
		profile.Bio = user.Bio
	}

	if canViewPhoto {
		profile.AvatarURL = user.AvatarURL
	}

	return profile, nil
}

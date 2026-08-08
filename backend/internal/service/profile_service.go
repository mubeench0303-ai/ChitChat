package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
	"github.com/mubeench0303-ai/ChitChat/backend/pkg/cloudinary"
)

const (
	maxBioLength             = 160
	minProfileUsernameLength = 3
	maxProfileUsernameLength = 20
	maxAvatarSizeBytes       = 2 << 20
)

var (
	profileUsernamePattern   = regexp.MustCompile(`^[a-zA-Z0-9_]+$`)
	passwordUppercasePattern = regexp.MustCompile(`[A-Z]`)
	passwordLowercasePattern = regexp.MustCompile(`[a-z]`)
	passwordNumberPattern    = regexp.MustCompile(`[0-9]`)
)

func (s *AuthService) ChangePassword(
	ctx context.Context,
	userID uuid.UUID,
	currentPassword, newPassword string,
) error {
	user, err := s.users.GetUserByID(ctx, userID.String())
	if errors.Is(err, repository.ErrNotFound) {
		return ErrUserNotFound
	}
	if err != nil {
		return fmt.Errorf("auth: failed to fetch user: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(currentPassword)); err != nil {
		return ErrIncorrectCurrentPassword
	}

	if currentPassword == newPassword {
		return ErrNewPasswordSameAsCurrent
	}

	if err := validatePasswordStrength(newPassword); err != nil {
		return err
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcryptCost)
	if err != nil {
		return fmt.Errorf("auth: failed to hash password: %w", err)
	}

	if err := s.users.UpdatePassword(ctx, userID, string(passwordHash)); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrUserNotFound
		}
		return fmt.Errorf("auth: failed to update password: %w", err)
	}

	return nil
}

func validatePasswordStrength(password string) error {
	if utf8.RuneCountInString(password) < 8 {
		return ErrInvalidPasswordStrength
	}
	if !passwordUppercasePattern.MatchString(password) {
		return ErrInvalidPasswordStrength
	}
	if !passwordLowercasePattern.MatchString(password) {
		return ErrInvalidPasswordStrength
	}
	if !passwordNumberPattern.MatchString(password) {
		return ErrInvalidPasswordStrength
	}

	return nil
}

func (s *AuthService) UpdateProfile(
	ctx context.Context,
	userID uuid.UUID,
	fullName, username, bio string,
) (*models.User, error) {
	fullName = strings.TrimSpace(fullName)
	if fullName == "" {
		return nil, ErrInvalidFullName
	}

	username = strings.ToLower(strings.TrimSpace(username))
	if len(username) < minProfileUsernameLength ||
		len(username) > maxProfileUsernameLength ||
		!profileUsernamePattern.MatchString(username) {
		return nil, ErrInvalidUsername
	}

	if utf8.RuneCountInString(bio) > maxBioLength {
		return nil, ErrBioTooLong
	}

	taken, err := s.users.UsernameExists(ctx, username, userID)
	if err != nil {
		return nil, fmt.Errorf("auth: failed to check username availability: %w", err)
	}
	if taken {
		return nil, ErrUsernameAlreadyExists
	}

	user, err := s.users.UpdateProfile(ctx, userID, fullName, username, bio)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("auth: failed to update profile: %w", err)
	}

	return user, nil
}

func (s *AuthService) CheckUsernameAvailability(
	ctx context.Context,
	userID uuid.UUID,
	username string,
) (bool, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	if len(username) < minProfileUsernameLength ||
		len(username) > maxProfileUsernameLength ||
		!profileUsernamePattern.MatchString(username) {
		return false, ErrInvalidUsername
	}

	currentUser, err := s.users.GetUserByID(ctx, userID.String())
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return false, ErrUserNotFound
		}
		return false, fmt.Errorf("auth: failed to find user: %w", err)
	}

	if currentUser.Username == username {
		return true, nil
	}

	taken, err := s.users.UsernameExists(ctx, username, userID)
	if err != nil {
		return false, fmt.Errorf("auth: failed to check username availability: %w", err)
	}

	return !taken, nil
}

func (s *AuthService) UpdateAvatar(
	ctx context.Context,
	userID uuid.UUID,
	file multipart.File,
	filename string,
) (*models.User, error) {
	user, err := s.users.GetUserByID(ctx, userID.String())
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("auth: failed to load user: %w", err)
	}

	var oldAvatarURL string
	if user.AvatarURL != nil {
		oldAvatarURL = strings.TrimSpace(*user.AvatarURL)
	}

	if err := validateAvatarFile(file); err != nil {
		return nil, err
	}

	imageURL, err := s.cloudinary.UploadImage(ctx, file, filename, cloudinary.AvatarUploadFolder)
	if err != nil {
		return nil, fmt.Errorf("auth: failed to upload avatar: %w", err)
	}

	updatedUser, err := s.users.UpdateAvatarURL(ctx, userID, imageURL)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("auth: failed to update avatar URL: %w", err)
	}

	if oldAvatarURL != "" && oldAvatarURL != imageURL {
		if err := s.cloudinary.DeleteImage(ctx, oldAvatarURL); err != nil {
			return nil, fmt.Errorf("auth: failed to delete previous avatar: %w", err)
		}
	}

	return updatedUser, nil
}

func (s *AuthService) RemoveAvatar(
	ctx context.Context,
	userID uuid.UUID,
) (*models.User, error) {
	user, err := s.users.GetUserByID(ctx, userID.String())
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("auth: failed to load user: %w", err)
	}

	if user.AvatarURL == nil || strings.TrimSpace(*user.AvatarURL) == "" {
		return nil, ErrNoAvatar
	}

	if err := s.cloudinary.DeleteImage(ctx, *user.AvatarURL); err != nil {
		return nil, fmt.Errorf("auth: failed to delete avatar from cloudinary: %w", err)
	}

	updatedUser, err := s.users.ClearAvatarURL(ctx, userID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("auth: failed to remove avatar: %w", err)
	}

	return updatedUser, nil
}

func (s *AuthService) DeleteAccount(
	ctx context.Context,
	userID uuid.UUID,
	password string,
) error {
	user, err := s.users.GetUserByID(ctx, userID.String())
	if errors.Is(err, repository.ErrNotFound) {
		return ErrUserNotFound
	}
	if err != nil {
		return fmt.Errorf("auth: failed to load user: %w", err)
	}

	if user.IsDeleted {
		return ErrUserNotFound
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return ErrIncorrectCurrentPassword
	}

	if user.AvatarURL != nil && strings.TrimSpace(*user.AvatarURL) != "" {
		if err := s.cloudinary.DeleteImage(ctx, strings.TrimSpace(*user.AvatarURL)); err != nil {
			return fmt.Errorf("auth: failed to delete avatar from cloudinary: %w", err)
		}
	}

	groupIDs, err := s.conversations.GetGroupsCreatedBy(ctx, userID)
	if err != nil {
		return fmt.Errorf("auth: failed to list owned groups: %w", err)
	}

	for _, groupID := range groupIDs {
		otherMembers, err := s.conversations.GetOtherMembers(ctx, groupID, userID)
		if err != nil {
			return fmt.Errorf("auth: failed to list group members: %w", err)
		}

		if len(otherMembers) == 0 {
			continue
		}

		newOwnerID, err := s.conversations.GetOldestMember(ctx, groupID, userID)
		if err != nil {
			return fmt.Errorf("auth: failed to find group successor: %w", err)
		}

		if err := s.conversations.TransferGroupOwnership(ctx, groupID, newOwnerID); err != nil {
			return fmt.Errorf("auth: failed to transfer group ownership: %w", err)
		}

		isAdmin, err := s.conversations.IsAdmin(ctx, groupID, newOwnerID)
		if err != nil {
			return fmt.Errorf("auth: failed to check successor role: %w", err)
		}

		if !isAdmin {
			if err := s.conversations.UpdateMemberRole(
				ctx,
				groupID,
				newOwnerID,
				models.ConversationMemberRoleAdmin,
			); err != nil {
				return fmt.Errorf("auth: failed to promote group successor: %w", err)
			}
		}
	}

	randomSecret := make([]byte, 32)
	if _, err := rand.Read(randomSecret); err != nil {
		return fmt.Errorf("auth: failed to generate anonymized password: %w", err)
	}

	passwordHash, err := bcrypt.GenerateFromPassword(randomSecret, bcryptCost)
	if err != nil {
		return fmt.Errorf("auth: failed to hash anonymized password: %w", err)
	}

	if err := s.users.AnonymizeUser(ctx, userID, string(passwordHash)); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrUserNotFound
		}
		return fmt.Errorf("auth: failed to anonymize user: %w", err)
	}

	return nil
}

func validateAvatarFile(file multipart.File) error {
	header := make([]byte, 512)
	n, err := file.Read(header)
	if err != nil && !errors.Is(err, io.EOF) {
		return fmt.Errorf("auth: failed to read avatar file: %w", err)
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("auth: failed to reset avatar file reader: %w", err)
	}

	contentType := http.DetectContentType(header[:n])
	switch contentType {
	case "image/jpeg", "image/png", "image/webp":
	default:
		return ErrInvalidAvatarContentType
	}

	size, err := file.Seek(0, io.SeekEnd)
	if err != nil {
		return fmt.Errorf("auth: failed to determine avatar file size: %w", err)
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("auth: failed to reset avatar file reader: %w", err)
	}

	if size > maxAvatarSizeBytes {
		return ErrInvalidAvatarFileSize
	}

	return nil
}

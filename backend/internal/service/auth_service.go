package service

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
	"github.com/mubeench0303-ai/ChitChat/backend/pkg/cloudinary"
	"github.com/mubeench0303-ai/ChitChat/backend/pkg/email"
	jwthelper "github.com/mubeench0303-ai/ChitChat/backend/pkg/jwt"
)

const (
	verificationTypeEmailVerify    = "email_verify"
	verificationTypePasswordReset  = "password_reset"
	verificationCodeTTL            = 10 * time.Minute
	bcryptCost                     = 12
	maxBioLength                   = 160
	minProfileUsernameLength       = 3
	maxProfileUsernameLength       = 20
	maxAvatarSizeBytes             = 2 << 20
	defaultUserSearchLimit         = 20
)

var (
	profileUsernamePattern = regexp.MustCompile(`^[a-zA-Z0-9_]+$`)
	passwordUppercasePattern = regexp.MustCompile(`[A-Z]`)
	passwordLowercasePattern = regexp.MustCompile(`[a-z]`)
	passwordNumberPattern    = regexp.MustCompile(`[0-9]`)
)

var (
	ErrEmailAlreadyExists      = errors.New("email is already registered")
	ErrUsernameAlreadyExists   = errors.New("username is already taken")
	ErrInvalidVerificationCode = errors.New("invalid verification code")
	ErrExpiredVerificationCode = errors.New("verification code has expired")
	ErrAlreadyVerified         = errors.New("email is already verified")
	ErrInvalidCredentials      = errors.New("invalid email or password")
	ErrEmailNotVerified        = errors.New("email is not verified")
	ErrUserNotFound            = errors.New("user not found")
	ErrInvalidFullName         = errors.New("full name is required")
	ErrInvalidUsername         = errors.New("username must be 3-20 characters and contain only letters, numbers, and underscores")
	ErrBioTooLong               = errors.New("bio must be at most 160 characters")
	ErrInvalidAvatarFileSize    = errors.New("avatar must be at most 2MB")
	ErrInvalidAvatarContentType = errors.New("avatar must be a JPEG, PNG, or WebP image")
	ErrNoAvatar                 = errors.New("no profile photo to remove")
	ErrInvalidSearchQuery       = errors.New("search query is required")
	ErrPublicProfileNotFound    = errors.New("user not found")
	ErrUserNoLongerExists       = errors.New("this user no longer exists")
	ErrIncorrectCurrentPassword = errors.New("current password is incorrect")
	ErrNewPasswordSameAsCurrent = errors.New("new password must be different from your current password")
	ErrInvalidPasswordStrength  = errors.New("password must be at least 8 characters and contain uppercase, lowercase, and a number")
	ErrAccountNoLongerExists    = errors.New("this account no longer exists")
)

type LoginResult struct {
	Token string
	User  *models.User
}

type SignupResult struct {
	User               *models.User
	VerificationResent bool
}

type AuthService struct {
	db            *pgxpool.Pool
	users         *repository.UserRepository
	conversations *repository.ConversationRepository
	verifications *repository.VerificationRepository
	mailer        *email.Client
	cloudinary    *cloudinary.Client
	jwt           *jwthelper.Helper
}

func NewAuthService(
	db *pgxpool.Pool,
	users *repository.UserRepository,
	conversations *repository.ConversationRepository,
	verifications *repository.VerificationRepository,
	mailer *email.Client,
	cloudinaryClient *cloudinary.Client,
	jwt *jwthelper.Helper,
) *AuthService {
	return &AuthService{
		db:            db,
		users:         users,
		conversations: conversations,
		verifications: verifications,
		mailer:        mailer,
		cloudinary:    cloudinaryClient,
		jwt:           jwt,
	}
}

func (s *AuthService) Signup(ctx context.Context, fullName, username, email, password string) (*SignupResult, error) {
	existingUser, err := s.users.GetUserByEmail(ctx, email)
	if err == nil {
		if existingUser.IsVerified {
			return nil, ErrEmailAlreadyExists
		}

		if err := s.ResendVerificationCode(ctx, email); err != nil {
			return nil, err
		}

		return &SignupResult{
			User:               existingUser,
			VerificationResent: true,
		}, nil
	}
	if !errors.Is(err, repository.ErrNotFound) {
		return nil, fmt.Errorf("auth: failed to check email availability: %w", err)
	}

	if err := s.ensureUsernameAvailable(ctx, username); err != nil {
		return nil, err
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return nil, fmt.Errorf("auth: failed to hash password: %w", err)
	}

	verificationCode, err := generateVerificationCode()
	if err != nil {
		return nil, fmt.Errorf("auth: failed to generate verification code: %w", err)
	}

	user := &models.User{
		Username:     username,
		FullName:     fullName,
		Email:        email,
		PasswordHash: string(passwordHash),
		IsVerified:   false,
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("auth: failed to start transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := s.users.CreateUserTx(ctx, tx, user); err != nil {
		return nil, fmt.Errorf("auth: failed to create user: %w", err)
	}

	expiresAt := time.Now().Add(verificationCodeTTL)
	if err := s.verifications.CreateVerificationCodeTx(
		ctx,
		tx,
		user.ID,
		verificationCode,
		verificationTypeEmailVerify,
		expiresAt,
	); err != nil {
		return nil, fmt.Errorf("auth: failed to save verification code: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("auth: failed to commit transaction: %w", err)
	}

	if err := s.mailer.SendVerificationEmail(user.Email, verificationCode); err != nil {
		return nil, fmt.Errorf("auth: failed to send verification email: %w", err)
	}

	return &SignupResult{
		User:               user,
		VerificationResent: false,
	}, nil
}

func (s *AuthService) VerifyEmail(ctx context.Context, email, code string) error {
	user, err := s.users.GetUserByEmail(ctx, email)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrInvalidVerificationCode
	}
	if err != nil {
		return fmt.Errorf("auth: failed to find user: %w", err)
	}

	if user.IsVerified {
		return ErrAlreadyVerified
	}

	verificationCode, err := s.validateVerificationCode(ctx, user.ID, code, verificationTypeEmailVerify)
	if err != nil {
		return err
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("auth: failed to start transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := s.verifications.MarkAsUsedTx(ctx, tx, verificationCode.ID); err != nil {
		return fmt.Errorf("auth: failed to mark verification code as used: %w", err)
	}

	if err := s.users.MarkUserVerifiedTx(ctx, tx, user.ID); err != nil {
		return fmt.Errorf("auth: failed to verify user email: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("auth: failed to commit transaction: %w", err)
	}

	return nil
}

func (s *AuthService) Login(ctx context.Context, email, password string) (*LoginResult, error) {
	user, err := s.users.GetUserByEmail(ctx, email)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, fmt.Errorf("auth: failed to find user: %w", err)
	}

	if user.IsDeleted {
		return nil, ErrAccountNoLongerExists
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	if !user.IsVerified {
		return nil, ErrEmailNotVerified
	}

	token, err := s.jwt.GenerateToken(user.ID, user.Email)
	if err != nil {
		return nil, fmt.Errorf("auth: failed to generate token: %w", err)
	}

	return &LoginResult{
		Token: token,
		User:  user,
	}, nil
}

func (s *AuthService) ResendVerificationCode(ctx context.Context, email string) error {
	user, err := s.users.GetUserByEmail(ctx, email)
	if errors.Is(err, repository.ErrNotFound) {
		log.Printf("resend verification failed: step=user lookup email=%q err=%v", email, err)
		return ErrUserNotFound
	}
	if err != nil {
		log.Printf("resend verification failed: step=user lookup email=%q err=%v", email, err)
		return fmt.Errorf("auth: failed to find user: %w", err)
	}

	if user.IsVerified {
		log.Printf("resend verification failed: step=user lookup email=%q err=%v", email, ErrAlreadyVerified)
		return ErrAlreadyVerified
	}

	verificationCode, err := generateVerificationCode()
	if err != nil {
		log.Printf("resend verification failed: step=generate verification code email=%q err=%v", email, err)
		return fmt.Errorf("auth: failed to generate verification code: %w", err)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		log.Printf("resend verification failed: step=begin transaction email=%q err=%v", email, err)
		return fmt.Errorf("auth: failed to start transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := s.verifications.MarkUnusedEmailVerificationCodesAsUsedTx(ctx, tx, user.ID); err != nil {
		log.Printf("resend verification failed: step=invalidate old codes email=%q user_id=%q err=%v", email, user.ID, err)
		return fmt.Errorf("auth: failed to invalidate verification codes: %w", err)
	}

	expiresAt := time.Now().Add(verificationCodeTTL)
	if err := s.verifications.CreateVerificationCodeTx(
		ctx,
		tx,
		user.ID,
		verificationCode,
		verificationTypeEmailVerify,
		expiresAt,
	); err != nil {
		log.Printf("resend verification failed: step=save verification code email=%q user_id=%q err=%v", email, user.ID, err)
		return fmt.Errorf("auth: failed to save verification code: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("resend verification failed: step=commit transaction email=%q user_id=%q err=%v", email, user.ID, err)
		return fmt.Errorf("auth: failed to commit transaction: %w", err)
	}

	if err := s.mailer.SendVerificationEmail(user.Email, verificationCode); err != nil {
		log.Printf("resend verification failed: step=send email email=%q user_id=%q err=%v", email, user.ID, err)
		return fmt.Errorf("auth: failed to send verification email: %w", err)
	}

	return nil
}

func (s *AuthService) ForgotPassword(ctx context.Context, email string) error {
	user, err := s.users.GetUserByEmail(ctx, email)
	if errors.Is(err, repository.ErrNotFound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("auth: failed to find user: %w", err)
	}

	resetCode, err := generateVerificationCode()
	if err != nil {
		return fmt.Errorf("auth: failed to generate verification code: %w", err)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("auth: failed to start transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := s.verifications.MarkUnusedCodesAsUsedTx(ctx, tx, user.ID, verificationTypePasswordReset); err != nil {
		return fmt.Errorf("auth: failed to invalidate password reset codes: %w", err)
	}

	expiresAt := time.Now().Add(verificationCodeTTL)
	if err := s.verifications.CreateVerificationCodeTx(
		ctx,
		tx,
		user.ID,
		resetCode,
		verificationTypePasswordReset,
		expiresAt,
	); err != nil {
		return fmt.Errorf("auth: failed to save password reset code: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("auth: failed to commit transaction: %w", err)
	}

	if err := s.mailer.SendPasswordResetEmail(user.Email, resetCode); err != nil {
		return fmt.Errorf("auth: failed to send password reset email: %w", err)
	}

	return nil
}

func (s *AuthService) ResetPassword(ctx context.Context, email, code, newPassword string) error {
	user, err := s.users.GetUserByEmail(ctx, email)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrInvalidVerificationCode
	}
	if err != nil {
		return fmt.Errorf("auth: failed to find user: %w", err)
	}

	verificationCode, err := s.validateVerificationCode(ctx, user.ID, code, verificationTypePasswordReset)
	if err != nil {
		return err
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcryptCost)
	if err != nil {
		return fmt.Errorf("auth: failed to hash password: %w", err)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("auth: failed to start transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := s.users.UpdatePasswordHashTx(ctx, tx, user.ID, string(passwordHash)); err != nil {
		return fmt.Errorf("auth: failed to update password: %w", err)
	}

	if err := s.verifications.MarkAsUsedTx(ctx, tx, verificationCode.ID); err != nil {
		return fmt.Errorf("auth: failed to mark verification code as used: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("auth: failed to commit transaction: %w", err)
	}

	return nil
}

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

func (s *AuthService) validateVerificationCode(
	ctx context.Context,
	userID string,
	code string,
	verificationType string,
) (*models.VerificationCode, error) {
	verificationCode, err := s.verifications.GetVerificationCode(ctx, userID, code, verificationType)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrInvalidVerificationCode
	}
	if err != nil {
		return nil, fmt.Errorf("auth: failed to find verification code: %w", err)
	}

	if verificationCode.UsedAt != nil {
		return nil, ErrInvalidVerificationCode
	}

	if time.Now().After(verificationCode.ExpiresAt) {
		return nil, ErrExpiredVerificationCode
	}

	return verificationCode, nil
}

func (s *AuthService) ensureUsernameAvailable(ctx context.Context, username string) error {
	_, err := s.users.GetUserByUsername(ctx, username)
	if err == nil {
		return ErrUsernameAlreadyExists
	}
	if !errors.Is(err, repository.ErrNotFound) {
		return fmt.Errorf("auth: failed to check username availability: %w", err)
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
		results = append(results, models.UserSearchResult{
			ID:        user.ID,
			FullName:  user.FullName,
			Username:  user.Username,
			AvatarURL: user.AvatarURL,
		})
	}

	return results, nil
}

func (s *AuthService) GetPublicProfile(
	ctx context.Context,
	username string,
) (*models.PublicProfile, error) {
	trimmedUsername := strings.TrimSpace(username)
	if trimmedUsername == "" {
		return nil, ErrPublicProfileNotFound
	}

	user, err := s.users.GetPublicProfileByUsername(ctx, trimmedUsername)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrPublicProfileNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("auth: failed to get public profile: %w", err)
	}

	if user.IsDeleted {
		return nil, ErrUserNoLongerExists
	}

	return &models.PublicProfile{
		ID:        user.ID,
		FullName:  user.FullName,
		Username:  user.Username,
		Bio:       user.Bio,
		AvatarURL: user.AvatarURL,
	}, nil
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

func generateVerificationCode() (string, error) {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}

	code := binary.BigEndian.Uint32(b[:]) % 1_000_000
	return fmt.Sprintf("%06d", code), nil
}

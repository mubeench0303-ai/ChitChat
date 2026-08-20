package service

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/google/uuid"

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
	assistant     *AssistantService
}

func NewAuthService(
	db *pgxpool.Pool,
	users *repository.UserRepository,
	conversations *repository.ConversationRepository,
	verifications *repository.VerificationRepository,
	mailer *email.Client,
	cloudinaryClient *cloudinary.Client,
	jwt *jwthelper.Helper,
	assistant *AssistantService,
) *AuthService {
	return &AuthService{
		db:            db,
		users:         users,
		conversations: conversations,
		verifications: verifications,
		mailer:        mailer,
		cloudinary:    cloudinaryClient,
		jwt:           jwt,
		assistant:     assistant,
	}
}

func (s *AuthService) Signup(ctx context.Context, fullName, username, email, password string) (*SignupResult, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	email = strings.TrimSpace(email)
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

	s.ensureAIConversationBestEffort(user.ID)

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

	if user.IsSystem {
		return nil, ErrInvalidCredentials
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

	s.ensureAIConversationBestEffort(user.ID)

	return &LoginResult{
		Token: token,
		User:  user,
	}, nil
}

func (s *AuthService) ensureAIConversationBestEffort(userID string) {
	if s.assistant == nil {
		return
	}

	userUUID, err := uuid.Parse(userID)
	if err != nil {
		log.Printf("auth: invalid user id for AI assistant conversation: %v", err)
		return
	}

	go func() {
		if err := s.assistant.EnsureAIConversation(context.Background(), userUUID); err != nil {
			log.Printf(
				"auth: failed to ensure AI assistant conversation for user %s: %v",
				userID,
				err,
			)
		}
	}()
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

func (s *AuthService) VerifyResetCode(ctx context.Context, email, code string) error {
	user, err := s.users.GetUserByEmail(ctx, email)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrInvalidVerificationCode
	}
	if err != nil {
		return fmt.Errorf("auth: failed to find user: %w", err)
	}

	_, err = s.validateVerificationCode(ctx, user.ID, code, verificationTypePasswordReset)
	return err
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
	username = strings.ToLower(strings.TrimSpace(username))
	_, err := s.users.GetUserByUsername(ctx, username)
	if err == nil {
		return ErrUsernameAlreadyExists
	}
	if !errors.Is(err, repository.ErrNotFound) {
		return fmt.Errorf("auth: failed to check username availability: %w", err)
	}
	return nil
}

func (s *AuthService) CheckSignupUsernameAvailability(
	ctx context.Context,
	username string,
) (bool, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	if len(username) < 3 || len(username) > 30 || !profileUsernamePattern.MatchString(username) {
		return false, ErrInvalidUsername
	}

	_, err := s.users.GetUserByUsername(ctx, username)
	if err == nil {
		return false, nil
	}
	if errors.Is(err, repository.ErrNotFound) {
		return true, nil
	}

	return false, fmt.Errorf("auth: failed to check username availability: %w", err)
}

func generateVerificationCode() (string, error) {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}

	code := binary.BigEndian.Uint32(b[:]) % 1_000_000
	return fmt.Sprintf("%06d", code), nil
}

package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
)

type UserRepository struct {
	db *pgxpool.Pool
}

func NewUserRepository(db *pgxpool.Pool) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) CreateUser(ctx context.Context, user *models.User) error {
	const query = `
		INSERT INTO users (username, full_name, email, password_hash, is_verified, avatar_url)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at, updated_at`

	return r.db.QueryRow(
		ctx,
		query,
		user.Username,
		user.FullName,
		user.Email,
		user.PasswordHash,
		user.IsVerified,
		user.AvatarURL,
	).Scan(&user.ID, &user.CreatedAt, &user.UpdatedAt)
}

func (r *UserRepository) CreateUserTx(ctx context.Context, tx pgx.Tx, user *models.User) error {
	const query = `
		INSERT INTO users (username, full_name, email, password_hash, is_verified, avatar_url)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at, updated_at`

	return tx.QueryRow(
		ctx,
		query,
		user.Username,
		user.FullName,
		user.Email,
		user.PasswordHash,
		user.IsVerified,
		user.AvatarURL,
	).Scan(&user.ID, &user.CreatedAt, &user.UpdatedAt)
}

func (r *UserRepository) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	const query = `
		SELECT id, username, full_name, email, password_hash, is_verified, avatar_url, bio, is_online, last_seen, notification_sound_enabled, is_deleted, deleted_at, created_at, updated_at
		FROM users
		WHERE id = $1`

	return r.scanUser(ctx, query, id)
}

func (r *UserRepository) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	const query = `
		SELECT id, username, full_name, email, password_hash, is_verified, avatar_url, bio, is_online, last_seen, notification_sound_enabled, is_deleted, deleted_at, created_at, updated_at
		FROM users
		WHERE email = $1`

	return r.scanUser(ctx, query, email)
}

func (r *UserRepository) GetUserByUsername(ctx context.Context, username string) (*models.User, error) {
	const query = `
		SELECT id, username, full_name, email, password_hash, is_verified, avatar_url, bio, is_online, last_seen, notification_sound_enabled, is_deleted, deleted_at, created_at, updated_at
		FROM users
		WHERE username = $1`

	return r.scanUser(ctx, query, username)
}

func (r *UserRepository) scanUser(ctx context.Context, query string, arg string) (*models.User, error) {
	var user models.User

	err := r.db.QueryRow(ctx, query, arg).Scan(
		&user.ID,
		&user.Username,
		&user.FullName,
		&user.Email,
		&user.PasswordHash,
		&user.IsVerified,
		&user.AvatarURL,
		&user.Bio,
		&user.IsOnline,
		&user.LastSeen,
		&user.NotificationSoundEnabled,
		&user.IsDeleted,
		&user.DeletedAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *UserRepository) MarkUserVerifiedTx(ctx context.Context, tx pgx.Tx, userID string) error {
	const query = `
		UPDATE users
		SET is_verified = TRUE, updated_at = NOW()
		WHERE id = $1 AND is_verified = FALSE`

	tag, err := tx.Exec(ctx, query, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *UserRepository) UpdatePasswordHashTx(ctx context.Context, tx pgx.Tx, userID, passwordHash string) error {
	const query = `
		UPDATE users
		SET password_hash = $2, updated_at = NOW()
		WHERE id = $1`

	tag, err := tx.Exec(ctx, query, userID, passwordHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *UserRepository) SetOnlineStatus(
	ctx context.Context,
	userID uuid.UUID,
	isOnline bool,
) error {
	const query = `
		UPDATE users
		SET is_online = $2, updated_at = NOW()
		WHERE id = $1`

	tag, err := r.db.Exec(ctx, query, userID.String(), isOnline)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *UserRepository) SetLastSeen(
	ctx context.Context,
	userID uuid.UUID,
	lastSeen time.Time,
) error {
	const query = `
		UPDATE users
		SET last_seen = $2
		WHERE id = $1`

	tag, err := r.db.Exec(ctx, query, userID.String(), lastSeen)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *UserRepository) UpdateNotificationSoundSetting(
	ctx context.Context,
	userID uuid.UUID,
	enabled bool,
) error {
	const query = `
		UPDATE users
		SET notification_sound_enabled = $2, updated_at = NOW()
		WHERE id = $1`

	tag, err := r.db.Exec(ctx, query, userID.String(), enabled)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

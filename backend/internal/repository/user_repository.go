package repository

import (
	"context"
	"errors"
	"strings"
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
		SELECT id, username, full_name, email, password_hash, is_verified, avatar_url, bio, is_online, last_seen, created_at, updated_at
		FROM users
		WHERE id = $1`

	return r.scanUser(ctx, query, id)
}

func (r *UserRepository) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	const query = `
		SELECT id, username, full_name, email, password_hash, is_verified, avatar_url, bio, is_online, last_seen, created_at, updated_at
		FROM users
		WHERE email = $1`

	return r.scanUser(ctx, query, email)
}

func (r *UserRepository) GetUserByUsername(ctx context.Context, username string) (*models.User, error) {
	const query = `
		SELECT id, username, full_name, email, password_hash, is_verified, avatar_url, bio, is_online, last_seen, created_at, updated_at
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

func (r *UserRepository) UpdateProfile(
	ctx context.Context,
	userID uuid.UUID,
	fullName, username, bio string,
) (*models.User, error) {
	const query = `
		UPDATE users
		SET full_name = $2, username = $3, bio = $4, updated_at = NOW()
		WHERE id = $1`

	tag, err := r.db.Exec(ctx, query, userID.String(), fullName, username, bio)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}

	return r.GetUserByID(ctx, userID.String())
}

func (r *UserRepository) UpdateAvatarURL(
	ctx context.Context,
	userID uuid.UUID,
	avatarURL string,
) (*models.User, error) {
	const query = `
		UPDATE users
		SET avatar_url = $2, updated_at = NOW()
		WHERE id = $1`

	tag, err := r.db.Exec(ctx, query, userID.String(), avatarURL)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}

	return r.GetUserByID(ctx, userID.String())
}

func (r *UserRepository) ClearAvatarURL(
	ctx context.Context,
	userID uuid.UUID,
) (*models.User, error) {
	const query = `
		UPDATE users
		SET avatar_url = NULL, updated_at = NOW()
		WHERE id = $1`

	tag, err := r.db.Exec(ctx, query, userID.String())
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}

	return r.GetUserByID(ctx, userID.String())
}

func (r *UserRepository) UsernameExists(
	ctx context.Context,
	username string,
	excludeUserID uuid.UUID,
) (bool, error) {
	const query = `
		SELECT EXISTS (
			SELECT 1
			FROM users
			WHERE username = $1 AND id <> $2
		)`

	var exists bool
	err := r.db.QueryRow(ctx, query, username, excludeUserID.String()).Scan(&exists)
	if err != nil {
		return false, err
	}

	return exists, nil
}

func (r *UserRepository) SearchByUsername(
	ctx context.Context,
	query string,
	excludeUserID uuid.UUID,
	limit int,
) ([]models.User, error) {
	if limit <= 0 {
		limit = 20
	}

	trimmedQuery := strings.TrimSpace(query)
	escapedQuery := escapeLikePattern(trimmedQuery)

	const sqlQuery = `
		SELECT id, username, full_name, email, password_hash, is_verified, avatar_url, bio, is_online, last_seen, created_at, updated_at
		FROM users
		WHERE id <> $1
		  AND (
		    username ILIKE '%' || $2 || '%' ESCAPE '\'
		    OR full_name ILIKE '%' || $2 || '%' ESCAPE '\'
		  )
		ORDER BY
			CASE
				WHEN LOWER(username) = LOWER($3) THEN 0
				WHEN LOWER(full_name) = LOWER($3) THEN 1
				WHEN username ILIKE $2 || '%' ESCAPE '\' THEN 2
				WHEN full_name ILIKE $2 || '%' ESCAPE '\' THEN 3
				ELSE 4
			END,
			username ASC
		LIMIT $4`

	rows, err := r.db.Query(
		ctx,
		sqlQuery,
		excludeUserID.String(),
		escapedQuery,
		trimmedQuery,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]models.User, 0)
	for rows.Next() {
		var user models.User

		if err := rows.Scan(
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
			&user.CreatedAt,
			&user.UpdatedAt,
		); err != nil {
			return nil, err
		}

		users = append(users, user)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return users, nil
}

func (r *UserRepository) GetPublicProfileByUsername(
	ctx context.Context,
	username string,
) (*models.User, error) {
	const query = `
		SELECT id, full_name, username, bio, avatar_url
		FROM users
		WHERE LOWER(username) = LOWER($1)`

	var user models.User

	err := r.db.QueryRow(ctx, query, strings.TrimSpace(username)).Scan(
		&user.ID,
		&user.FullName,
		&user.Username,
		&user.Bio,
		&user.AvatarURL,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	return &user, nil
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

func escapeLikePattern(value string) string {
	replacer := strings.NewReplacer(
		`\`, `\\`,
		`%`, `\%`,
		`_`, `\_`,
	)

	return replacer.Replace(value)
}

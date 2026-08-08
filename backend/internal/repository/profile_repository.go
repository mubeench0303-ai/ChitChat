package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
)

func (r *UserRepository) UpdatePassword(
	ctx context.Context,
	userID uuid.UUID,
	passwordHash string,
) error {
	const query = `
		UPDATE users
		SET password_hash = $2, updated_at = NOW()
		WHERE id = $1`

	tag, err := r.db.Exec(ctx, query, userID.String(), passwordHash)
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

func (r *UserRepository) AnonymizeUser(
	ctx context.Context,
	userID uuid.UUID,
	passwordHash string,
) error {
	userIDStr := userID.String()
	placeholderUsername := "deleted_" + userIDStr
	placeholderEmail := "deleted_" + userIDStr + "@deleted.chitchat"

	const query = `
		UPDATE users
		SET
			full_name = $2,
			username = $3,
			email = $4,
			bio = NULL,
			avatar_url = NULL,
			password_hash = $5,
			is_deleted = TRUE,
			deleted_at = NOW(),
			is_online = FALSE,
			updated_at = NOW()
		WHERE id = $1
		  AND is_deleted = FALSE`

	tag, err := r.db.Exec(
		ctx,
		query,
		userIDStr,
		models.DeletedUserDisplayName,
		placeholderUsername,
		placeholderEmail,
		passwordHash,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

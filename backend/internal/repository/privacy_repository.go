package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
)

var ErrInvalidPrivacyField = errors.New("invalid privacy field")

var privacyColumnByField = map[string]string{
	models.PrivacyFieldLastSeenAndOnline: "privacy_last_seen_and_online",
	models.PrivacyFieldProfilePhoto:      "privacy_profile_photo",
	models.PrivacyFieldBio:               "privacy_bio",
	models.PrivacyFieldStatus:            "privacy_status",
}

func privacyColumnForField(field string) (string, error) {
	column, ok := privacyColumnByField[field]
	if !ok {
		return "", ErrInvalidPrivacyField
	}

	return column, nil
}

func (r *UserRepository) GetPrivacySettings(
	ctx context.Context,
	userID uuid.UUID,
) (*models.PrivacySettings, error) {
	const query = `
		SELECT privacy_last_seen_and_online, privacy_profile_photo, privacy_bio, privacy_status
		FROM users
		WHERE id = $1`

	var settings models.PrivacySettings

	err := r.db.QueryRow(ctx, query, userID.String()).Scan(
		&settings.LastSeenAndOnline,
		&settings.ProfilePhoto,
		&settings.Bio,
		&settings.Status,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	return &settings, nil
}

func (r *UserRepository) GetPrivacySettingForField(
	ctx context.Context,
	userID uuid.UUID,
	field string,
) (string, error) {
	column, err := privacyColumnForField(field)
	if err != nil {
		return "", err
	}

	query := fmt.Sprintf(`
		SELECT %s
		FROM users
		WHERE id = $1`, column)

	var visibility string

	err = r.db.QueryRow(ctx, query, userID.String()).Scan(&visibility)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}

	return visibility, nil
}

func (r *UserRepository) UpdatePrivacySetting(
	ctx context.Context,
	userID uuid.UUID,
	field, visibility string,
) error {
	column, err := privacyColumnForField(field)
	if err != nil {
		return err
	}

	query := fmt.Sprintf(`
		UPDATE users
		SET %s = $2, updated_at = NOW()
		WHERE id = $1`, column)

	tag, err := r.db.Exec(ctx, query, userID.String(), visibility)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *UserRepository) GetExceptions(
	ctx context.Context,
	userID uuid.UUID,
	field string,
) ([]uuid.UUID, error) {
	if _, err := privacyColumnForField(field); err != nil {
		return nil, err
	}

	const query = `
		SELECT excluded_user_id
		FROM privacy_exceptions
		WHERE user_id = $1 AND field = $2
		ORDER BY created_at ASC`

	rows, err := r.db.Query(ctx, query, userID.String(), field)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	excludedIDs := make([]uuid.UUID, 0)
	for rows.Next() {
		var excludedIDStr string
		if err := rows.Scan(&excludedIDStr); err != nil {
			return nil, err
		}

		excludedID, err := uuid.Parse(excludedIDStr)
		if err != nil {
			return nil, fmt.Errorf("privacy: invalid excluded user id: %w", err)
		}

		excludedIDs = append(excludedIDs, excludedID)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return excludedIDs, nil
}

func (r *UserRepository) IsPrivacyException(
	ctx context.Context,
	userID uuid.UUID,
	field string,
	excludedUserID uuid.UUID,
) (bool, error) {
	if _, err := privacyColumnForField(field); err != nil {
		return false, err
	}

	const query = `
		SELECT EXISTS (
			SELECT 1
			FROM privacy_exceptions
			WHERE user_id = $1 AND field = $2 AND excluded_user_id = $3
		)`

	var exists bool

	err := r.db.QueryRow(
		ctx,
		query,
		userID.String(),
		field,
		excludedUserID.String(),
	).Scan(&exists)
	if err != nil {
		return false, err
	}

	return exists, nil
}

func (r *UserRepository) AddException(
	ctx context.Context,
	userID uuid.UUID,
	field string,
	excludedUserID uuid.UUID,
) error {
	if _, err := privacyColumnForField(field); err != nil {
		return err
	}

	const query = `
		INSERT INTO privacy_exceptions (user_id, field, excluded_user_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, field, excluded_user_id) DO NOTHING`

	_, err := r.db.Exec(ctx, query, userID.String(), field, excludedUserID.String())
	return err
}

func (r *UserRepository) RemoveException(
	ctx context.Context,
	userID uuid.UUID,
	field string,
	excludedUserID uuid.UUID,
) error {
	if _, err := privacyColumnForField(field); err != nil {
		return err
	}

	const query = `
		DELETE FROM privacy_exceptions
		WHERE user_id = $1 AND field = $2 AND excluded_user_id = $3`

	_, err := r.db.Exec(ctx, query, userID.String(), field, excludedUserID.String())
	return err
}

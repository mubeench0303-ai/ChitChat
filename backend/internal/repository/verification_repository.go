package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
)

type VerificationRepository struct {
	db *pgxpool.Pool
}

func NewVerificationRepository(db *pgxpool.Pool) *VerificationRepository {
	return &VerificationRepository{db: db}
}

func (r *VerificationRepository) CreateVerificationCode(
	ctx context.Context,
	userID string,
	code string,
	verificationType string,
	expiresAt time.Time,
) error {
	const query = `
		INSERT INTO verification_codes (user_id, code, type, expires_at)
		VALUES ($1, $2, $3, $4)`

	_, err := r.db.Exec(ctx, query, userID, code, verificationType, expiresAt)
	return err
}

func (r *VerificationRepository) CreateVerificationCodeTx(
	ctx context.Context,
	tx pgx.Tx,
	userID string,
	code string,
	verificationType string,
	expiresAt time.Time,
) error {
	const query = `
		INSERT INTO verification_codes (user_id, code, type, expires_at)
		VALUES ($1, $2, $3, $4)`

	_, err := tx.Exec(ctx, query, userID, code, verificationType, expiresAt)
	return err
}

func (r *VerificationRepository) GetVerificationCode(
	ctx context.Context,
	userID string,
	code string,
	verificationType string,
) (*models.VerificationCode, error) {
	const query = `
		SELECT id, user_id, code, type, expires_at, used_at, created_at
		FROM verification_codes
		WHERE user_id = $1 AND code = $2 AND type = $3
		ORDER BY created_at DESC
		LIMIT 1`

	var vc models.VerificationCode
	err := r.db.QueryRow(ctx, query, userID, code, verificationType).Scan(
		&vc.ID,
		&vc.UserID,
		&vc.Code,
		&vc.Type,
		&vc.ExpiresAt,
		&vc.UsedAt,
		&vc.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	return &vc, nil
}

func (r *VerificationRepository) MarkAsUsedTx(ctx context.Context, tx pgx.Tx, id string) error {
	const query = `
		UPDATE verification_codes
		SET used_at = NOW()
		WHERE id = $1 AND used_at IS NULL`

	tag, err := tx.Exec(ctx, query, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *VerificationRepository) MarkUnusedCodesAsUsedTx(
	ctx context.Context,
	tx pgx.Tx,
	userID string,
	verificationType string,
) error {
	const query = `
		UPDATE verification_codes
		SET used_at = NOW()
		WHERE user_id = $1 AND type = $2 AND used_at IS NULL`

	_, err := tx.Exec(ctx, query, userID, verificationType)
	return err
}

func (r *VerificationRepository) MarkUnusedEmailVerificationCodesAsUsedTx(
	ctx context.Context,
	tx pgx.Tx,
	userID string,
) error {
	return r.MarkUnusedCodesAsUsedTx(ctx, tx, userID, "email_verify")
}

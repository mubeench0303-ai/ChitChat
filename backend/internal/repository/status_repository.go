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

type StatusRepository struct {
	db *pgxpool.Pool
}

func NewStatusRepository(db *pgxpool.Pool) *StatusRepository {
	return &StatusRepository{db: db}
}

const statusSelectColumns = `
	id, user_id, type, content, image_url, background_color, created_at`

func scanStatus(scanner interface {
	Scan(dest ...any) error
}, status *models.Status) error {
	return scanner.Scan(
		&status.ID,
		&status.UserID,
		&status.Type,
		&status.Content,
		&status.ImageURL,
		&status.BackgroundColor,
		&status.CreatedAt,
	)
}

func (r *StatusRepository) CreateStatus(
	ctx context.Context,
	userID uuid.UUID,
	statusType string,
	content, imageURL, backgroundColor *string,
) (*models.Status, error) {
	const query = `
		INSERT INTO statuses (user_id, type, content, image_url, background_color)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING` + statusSelectColumns

	var status models.Status

	err := r.db.QueryRow(
		ctx,
		query,
		userID.String(),
		statusType,
		content,
		imageURL,
		backgroundColor,
	).Scan(
		&status.ID,
		&status.UserID,
		&status.Type,
		&status.Content,
		&status.ImageURL,
		&status.BackgroundColor,
		&status.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &status, nil
}

func (r *StatusRepository) GetStatusByID(
	ctx context.Context,
	statusID uuid.UUID,
) (*models.Status, error) {
	const query = `
		SELECT` + statusSelectColumns + `
		FROM statuses
		WHERE id = $1`

	var status models.Status

	err := r.db.QueryRow(ctx, query, statusID.String()).Scan(
		&status.ID,
		&status.UserID,
		&status.Type,
		&status.Content,
		&status.ImageURL,
		&status.BackgroundColor,
		&status.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	return &status, nil
}

func (r *StatusRepository) GetActiveStatusCount(
	ctx context.Context,
	userID uuid.UUID,
) (int, error) {
	const query = `
		SELECT COUNT(*)
		FROM statuses
		WHERE user_id = $1`

	var count int

	err := r.db.QueryRow(ctx, query, userID.String()).Scan(&count)
	if err != nil {
		return 0, err
	}

	return count, nil
}

func (r *StatusRepository) GetOldestStatus(
	ctx context.Context,
	userID uuid.UUID,
) (*models.Status, error) {
	const query = `
		SELECT` + statusSelectColumns + `
		FROM statuses
		WHERE user_id = $1
		ORDER BY created_at ASC
		LIMIT 1`

	var status models.Status

	err := r.db.QueryRow(ctx, query, userID.String()).Scan(
		&status.ID,
		&status.UserID,
		&status.Type,
		&status.Content,
		&status.ImageURL,
		&status.BackgroundColor,
		&status.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	return &status, nil
}

func (r *StatusRepository) DeleteStatus(
	ctx context.Context,
	statusID uuid.UUID,
) error {
	const query = `DELETE FROM statuses WHERE id = $1`

	tag, err := r.db.Exec(ctx, query, statusID.String())
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *StatusRepository) GetStatusesForUser(
	ctx context.Context,
	userID uuid.UUID,
	since time.Time,
) ([]models.Status, error) {
	const query = `
		SELECT` + statusSelectColumns + `
		FROM statuses
		WHERE user_id = $1
		  AND created_at > $2
		ORDER BY created_at ASC`

	rows, err := r.db.Query(ctx, query, userID.String(), since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanStatuses(rows)
}

func (r *StatusRepository) GetStatusesFromConnections(
	ctx context.Context,
	viewerID uuid.UUID,
	since time.Time,
) ([]models.Status, error) {
	const query = `
		SELECT s.id, s.user_id, s.type, s.content, s.image_url, s.background_color, s.created_at
		FROM statuses s
		JOIN users u ON u.id = s.user_id
		WHERE s.created_at > $2
		  AND u.is_deleted = FALSE
		  AND s.user_id IN (
			SELECT cm_other.user_id
			FROM conversations c
			JOIN conversation_members cm_self
				ON cm_self.conversation_id = c.id
				AND cm_self.user_id = $1
			JOIN conversation_members cm_other
				ON cm_other.conversation_id = c.id
				AND cm_other.user_id <> $1
			JOIN users owner ON owner.id = cm_other.user_id
			WHERE c.type = $3
			  AND c.status = $4
			  AND owner.is_deleted = FALSE
		)
		ORDER BY s.user_id, s.created_at ASC`

	rows, err := r.db.Query(
		ctx,
		query,
		viewerID.String(),
		since,
		models.ConversationTypeDirect,
		models.ConversationStatusAccepted,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanStatuses(rows)
}

func (r *StatusRepository) AddStatusView(
	ctx context.Context,
	statusID, viewerID uuid.UUID,
) error {
	const query = `
		INSERT INTO status_views (status_id, viewer_id)
		VALUES ($1, $2)
		ON CONFLICT (status_id, viewer_id) DO NOTHING`

	_, err := r.db.Exec(ctx, query, statusID.String(), viewerID.String())
	return err
}

func (r *StatusRepository) GetStatusViewers(
	ctx context.Context,
	statusID uuid.UUID,
) ([]models.StatusViewer, error) {
	const query = `
		SELECT
			sv.id,
			sv.viewer_id,
			u.full_name,
			u.username,
			u.avatar_url,
			sv.viewed_at
		FROM status_views sv
		JOIN users u ON u.id = sv.viewer_id
		WHERE sv.status_id = $1
		ORDER BY sv.viewed_at DESC`

	rows, err := r.db.Query(ctx, query, statusID.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	viewers := make([]models.StatusViewer, 0)
	for rows.Next() {
		var viewer models.StatusViewer

		if err := rows.Scan(
			&viewer.ID,
			&viewer.ViewerID,
			&viewer.FullName,
			&viewer.Username,
			&viewer.AvatarURL,
			&viewer.ViewedAt,
		); err != nil {
			return nil, err
		}

		viewers = append(viewers, viewer)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return viewers, nil
}

func (r *StatusRepository) DeleteExpiredStatuses(
	ctx context.Context,
	olderThan time.Time,
) (int, error) {
	const query = `DELETE FROM statuses WHERE created_at < $1`

	tag, err := r.db.Exec(ctx, query, olderThan)
	if err != nil {
		return 0, err
	}

	return int(tag.RowsAffected()), nil
}

func scanStatuses(rows pgx.Rows) ([]models.Status, error) {
	statuses := make([]models.Status, 0)

	for rows.Next() {
		var status models.Status

		if err := scanStatus(rows, &status); err != nil {
			return nil, err
		}

		statuses = append(statuses, status)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return statuses, nil
}

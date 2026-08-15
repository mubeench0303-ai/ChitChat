package repository

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
)

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
		SELECT id, username, full_name, email, password_hash, is_verified, avatar_url, bio, is_online, last_seen, is_deleted, deleted_at, created_at, updated_at
		FROM users
		WHERE id <> $1
		  AND is_deleted = FALSE
		  AND is_system = FALSE
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
			&user.IsDeleted,
			&user.DeletedAt,
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
	viewerID uuid.UUID,
	username string,
) (*models.User, string, *string, error) {
	const query = `
		SELECT
			u.id,
			u.full_name,
			u.username,
			u.bio,
			u.avatar_url,
			u.is_deleted,
			u.is_system,
			c.id,
			c.status
		FROM users u
		LEFT JOIN conversations c
			ON c.type = $3
			AND c.direct_pair_key = (
				CASE
					WHEN u.id::text < $2::text THEN u.id::text || '_' || $2::text
					ELSE $2::text || '_' || u.id::text
				END
			)
		WHERE LOWER(u.username) = LOWER($1)`

	var user models.User
	var conversationID *string
	var conversationStatus *string

	err := r.db.QueryRow(
		ctx,
		query,
		strings.TrimSpace(username),
		viewerID.String(),
		models.ConversationTypeDirect,
	).Scan(
		&user.ID,
		&user.FullName,
		&user.Username,
		&user.Bio,
		&user.AvatarURL,
		&user.IsDeleted,
		&user.IsSystem,
		&conversationID,
		&conversationStatus,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", nil, ErrNotFound
	}
	if err != nil {
		return nil, "", nil, err
	}

	relationshipStatus := models.RelationshipStatusNone
	if conversationID != nil && *conversationID != "" {
		if conversationStatus != nil {
			switch *conversationStatus {
			case models.ConversationStatusPending:
				relationshipStatus = models.RelationshipStatusPending
			case models.ConversationStatusAccepted:
				relationshipStatus = models.RelationshipStatusAccepted
			case models.ConversationStatusBlocked:
				relationshipStatus = models.RelationshipStatusBlocked
			}
		}
	} else {
		conversationID = nil
	}

	return &user, relationshipStatus, conversationID, nil
}

func escapeLikePattern(value string) string {
	replacer := strings.NewReplacer(
		`\`, `\\`,
		`%`, `\%`,
		`_`, `\_`,
	)

	return replacer.Replace(value)
}

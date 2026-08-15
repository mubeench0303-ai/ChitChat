package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
)

func (r *ConversationRepository) FindBetweenUsers(
	ctx context.Context,
	userA, userB uuid.UUID,
) (*models.Conversation, error) {
	const query = `
		SELECT` + conversationSelectColumns + `
		FROM conversations
		WHERE type = $1 AND direct_pair_key = $2`

	var conversation models.Conversation

	err := r.db.QueryRow(
		ctx,
		query,
		models.ConversationTypeDirect,
		directPairKey(userA, userB),
	).Scan(
		&conversation.ID,
		&conversation.Type,
		&conversation.Name,
		&conversation.AvatarURL,
		&conversation.CreatedBy,
		&conversation.DirectPairKey,
		&conversation.Status,
		&conversation.RequestedBy,
		&conversation.BlockedBy,
		&conversation.CreatedAt,
		&conversation.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &conversation, nil
}

func (r *ConversationRepository) Create(
	ctx context.Context,
	userA, userB, requestedBy uuid.UUID,
) (*models.Conversation, error) {
	pairKey := directPairKey(userA, userB)
	status := models.ConversationStatusPending
	requestedByStr := requestedBy.String()

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	const insertConversationQuery = `
		INSERT INTO conversations (
			type, direct_pair_key, status, requested_by, created_by
		)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING` + conversationSelectColumns

	var conversation models.Conversation

	err = tx.QueryRow(
		ctx,
		insertConversationQuery,
		models.ConversationTypeDirect,
		pairKey,
		status,
		requestedByStr,
		requestedByStr,
	).Scan(
		&conversation.ID,
		&conversation.Type,
		&conversation.Name,
		&conversation.AvatarURL,
		&conversation.CreatedBy,
		&conversation.DirectPairKey,
		&conversation.Status,
		&conversation.RequestedBy,
		&conversation.BlockedBy,
		&conversation.CreatedAt,
		&conversation.UpdatedAt,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return r.FindBetweenUsers(ctx, userA, userB)
		}

		return nil, err
	}

	const insertMemberQuery = `
		INSERT INTO conversation_members (conversation_id, user_id, role)
		VALUES ($1, $2, $3)`

	for _, memberID := range []uuid.UUID{userA, userB} {
		if _, err := tx.Exec(
			ctx,
			insertMemberQuery,
			conversation.ID,
			memberID.String(),
			models.ConversationMemberRoleMember,
		); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		if isUniqueViolation(err) {
			return r.FindBetweenUsers(ctx, userA, userB)
		}

		return nil, err
	}

	return &conversation, nil
}

func (r *ConversationRepository) CreateAcceptedDirect(
	ctx context.Context,
	userA, userB uuid.UUID,
) (*models.Conversation, error) {
	pairKey := directPairKey(userA, userB)
	status := models.ConversationStatusAccepted
	createdBy := userA.String()

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	const insertConversationQuery = `
		INSERT INTO conversations (
			type, direct_pair_key, status, requested_by, created_by
		)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING` + conversationSelectColumns

	var conversation models.Conversation

	err = tx.QueryRow(
		ctx,
		insertConversationQuery,
		models.ConversationTypeDirect,
		pairKey,
		status,
		createdBy,
		createdBy,
	).Scan(
		&conversation.ID,
		&conversation.Type,
		&conversation.Name,
		&conversation.AvatarURL,
		&conversation.CreatedBy,
		&conversation.DirectPairKey,
		&conversation.Status,
		&conversation.RequestedBy,
		&conversation.BlockedBy,
		&conversation.CreatedAt,
		&conversation.UpdatedAt,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return r.FindBetweenUsers(ctx, userA, userB)
		}

		return nil, err
	}

	const insertMemberQuery = `
		INSERT INTO conversation_members (conversation_id, user_id, role)
		VALUES ($1, $2, $3)`

	for _, memberID := range []uuid.UUID{userA, userB} {
		if _, err := tx.Exec(
			ctx,
			insertMemberQuery,
			conversation.ID,
			memberID.String(),
			models.ConversationMemberRoleMember,
		); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		if isUniqueViolation(err) {
			return r.FindBetweenUsers(ctx, userA, userB)
		}

		return nil, err
	}

	return &conversation, nil
}

func (r *ConversationRepository) ListIncomingRequests(
	ctx context.Context,
	userID uuid.UUID,
) ([]models.IncomingMessageRequest, error) {
	const query = `
		SELECT
			c.id,
			u.id,
			u.full_name,
			u.username,
			u.avatar_url,
			COALESCE(latest.content, ''),
			COALESCE(latest.is_unsent, false),
			COALESCE(latest.created_at, c.created_at),
			c.created_at
		FROM conversations c
		JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
		JOIN users u ON u.id = c.requested_by
		LEFT JOIN LATERAL (
			SELECT m.content, m.is_unsent, m.created_at
			FROM messages m
			WHERE m.conversation_id = c.id
			ORDER BY m.created_at DESC
			LIMIT 1
		) latest ON true
		WHERE c.type = $3
		  AND c.status = $2
		  AND c.requested_by <> $1
		  AND u.is_deleted = FALSE
		ORDER BY COALESCE(latest.created_at, c.created_at) DESC`

	rows, err := r.db.Query(
		ctx,
		query,
		userID.String(),
		models.ConversationStatusPending,
		models.ConversationTypeDirect,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	requests := make([]models.IncomingMessageRequest, 0)
	for rows.Next() {
		var request models.IncomingMessageRequest

		if err := rows.Scan(
			&request.ConversationID,
			&request.RequesterID,
			&request.RequesterFullName,
			&request.RequesterUsername,
			&request.RequesterAvatarURL,
			&request.LatestMessageContent,
			&request.LatestMessageIsUnsent,
			&request.LatestMessageAt,
			&request.RequestedAt,
		); err != nil {
			return nil, err
		}

		requests = append(requests, request)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return requests, nil
}

func (r *ConversationRepository) ListOutgoingRequests(
	ctx context.Context,
	userID uuid.UUID,
) ([]models.IncomingMessageRequest, error) {
	const query = `
		SELECT
			c.id,
			u.id,
			u.full_name,
			u.username,
			u.avatar_url,
			COALESCE(latest.content, ''),
			COALESCE(latest.is_unsent, false),
			COALESCE(latest.created_at, c.created_at),
			c.created_at
		FROM conversations c
		JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
		JOIN conversation_members cm_other
			ON cm_other.conversation_id = c.id
			AND cm_other.user_id <> $1
		JOIN users u ON u.id = cm_other.user_id
		LEFT JOIN LATERAL (
			SELECT m.content, m.is_unsent, m.created_at
			FROM messages m
			WHERE m.conversation_id = c.id
			ORDER BY m.created_at DESC
			LIMIT 1
		) latest ON true
		WHERE c.type = $3
		  AND c.status = $2
		  AND c.requested_by = $1
		  AND u.is_deleted = FALSE
		ORDER BY COALESCE(latest.created_at, c.created_at) DESC`

	rows, err := r.db.Query(
		ctx,
		query,
		userID.String(),
		models.ConversationStatusPending,
		models.ConversationTypeDirect,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	requests := make([]models.IncomingMessageRequest, 0)
	for rows.Next() {
		var request models.IncomingMessageRequest

		if err := rows.Scan(
			&request.ConversationID,
			&request.RequesterID,
			&request.RequesterFullName,
			&request.RequesterUsername,
			&request.RequesterAvatarURL,
			&request.LatestMessageContent,
			&request.LatestMessageIsUnsent,
			&request.LatestMessageAt,
			&request.RequestedAt,
		); err != nil {
			return nil, err
		}

		requests = append(requests, request)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return requests, nil
}

func (r *ConversationRepository) UpdateStatus(
	ctx context.Context,
	conversationID uuid.UUID,
	status string,
) error {
	const query = `
		UPDATE conversations
		SET status = $2, updated_at = NOW()
		WHERE id = $1`

	tag, err := r.db.Exec(ctx, query, conversationID.String(), status)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *ConversationRepository) BlockConversation(
	ctx context.Context,
	conversationID, blockedBy uuid.UUID,
) error {
	const query = `
		UPDATE conversations
		SET status = $2, blocked_by = $3, updated_at = NOW()
		WHERE id = $1`

	tag, err := r.db.Exec(
		ctx,
		query,
		conversationID.String(),
		models.ConversationStatusBlocked,
		blockedBy.String(),
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *ConversationRepository) GetBlockedConversations(
	ctx context.Context,
	userID uuid.UUID,
) ([]models.BlockedUser, error) {
	const query = `
		SELECT
			c.id AS conversation_id,
			u.full_name,
			u.username,
			u.avatar_url,
			c.updated_at AS blocked_at
		FROM conversations c
		JOIN conversation_members cm_self
			ON cm_self.conversation_id = c.id
			AND cm_self.user_id = $1
		JOIN conversation_members cm_other
			ON cm_other.conversation_id = c.id
			AND cm_other.user_id <> $1
		JOIN users u ON u.id = cm_other.user_id
		WHERE c.type = $2
		  AND c.status = $3
		  AND c.blocked_by = $1
		  AND u.is_deleted = FALSE
		ORDER BY c.updated_at DESC`

	rows, err := r.db.Query(
		ctx,
		query,
		userID.String(),
		models.ConversationTypeDirect,
		models.ConversationStatusBlocked,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	blocked := make([]models.BlockedUser, 0)
	for rows.Next() {
		var item models.BlockedUser
		if err := rows.Scan(
			&item.ConversationID,
			&item.FullName,
			&item.Username,
			&item.AvatarURL,
			&item.BlockedAt,
		); err != nil {
			return nil, err
		}
		blocked = append(blocked, item)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return blocked, nil
}

func (r *ConversationRepository) UnblockConversation(
	ctx context.Context,
	conversationID uuid.UUID,
) error {
	const query = `
		UPDATE conversations
		SET status = $2, blocked_by = NULL, updated_at = NOW()
		WHERE id = $1
		  AND status = $3`

	tag, err := r.db.Exec(
		ctx,
		query,
		conversationID.String(),
		models.ConversationStatusAccepted,
		models.ConversationStatusBlocked,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *ConversationRepository) DeleteConversation(
	ctx context.Context,
	conversationID uuid.UUID,
) error {
	const query = `DELETE FROM conversations WHERE id = $1`

	tag, err := r.db.Exec(ctx, query, conversationID.String())
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *ConversationRepository) AreUsersConnected(
	ctx context.Context,
	userA, userB uuid.UUID,
) (bool, error) {
	const query = `
		SELECT EXISTS (
			SELECT 1
			FROM conversations c
			WHERE c.type = $1
			  AND c.status = $2
			  AND c.direct_pair_key = $3
		)`

	var connected bool

	err := r.db.QueryRow(
		ctx,
		query,
		models.ConversationTypeDirect,
		models.ConversationStatusAccepted,
		directPairKey(userA, userB),
	).Scan(&connected)
	if err != nil {
		return false, err
	}

	return connected, nil
}

package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
)

func (r *ConversationRepository) MarkDirectMessageDelivered(
	ctx context.Context,
	messageID uuid.UUID,
) error {
	const query = `
		UPDATE messages
		SET delivered_at = COALESCE(delivered_at, NOW())
		WHERE id = $1`

	tag, err := r.db.Exec(ctx, query, messageID.String())
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *ConversationRepository) MarkMessageDelivered(
	ctx context.Context,
	messageID, userID uuid.UUID,
) error {
	const query = `
		INSERT INTO message_deliveries (message_id, user_id, delivered_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (message_id, user_id) DO NOTHING`

	_, err := r.db.Exec(ctx, query, messageID.String(), userID.String())
	return err
}

func (r *ConversationRepository) MarkMessagesDeliveredForUser(
	ctx context.Context,
	conversationID, userID uuid.UUID,
) ([]uuid.UUID, error) {
	const query = `
		INSERT INTO message_deliveries (message_id, user_id, delivered_at)
		SELECT m.id, $2, NOW()
		FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		WHERE m.conversation_id = $1
		  AND c.type = $3
		  AND m.sender_id <> $2
		ON CONFLICT (message_id, user_id) DO NOTHING
		RETURNING message_id`

	rows, err := r.db.Query(
		ctx,
		query,
		conversationID.String(),
		userID.String(),
		models.ConversationTypeGroup,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messageIDs := make([]uuid.UUID, 0)
	for rows.Next() {
		var messageIDStr string
		if err := rows.Scan(&messageIDStr); err != nil {
			return nil, err
		}

		messageID, err := uuid.Parse(messageIDStr)
		if err != nil {
			return nil, fmt.Errorf("invalid message id: %w", err)
		}

		messageIDs = append(messageIDs, messageID)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return messageIDs, nil
}

func (r *ConversationRepository) MarkMessagesReadForUser(
	ctx context.Context,
	conversationID, userID uuid.UUID,
) ([]uuid.UUID, error) {
	const query = `
		INSERT INTO message_reads (message_id, user_id, read_at)
		SELECT m.id, $2, NOW()
		FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		WHERE m.conversation_id = $1
		  AND c.type = $3
		  AND m.sender_id <> $2
		ON CONFLICT (message_id, user_id) DO NOTHING
		RETURNING message_id`

	rows, err := r.db.Query(
		ctx,
		query,
		conversationID.String(),
		userID.String(),
		models.ConversationTypeGroup,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messageIDs := make([]uuid.UUID, 0)
	for rows.Next() {
		var messageIDStr string
		if err := rows.Scan(&messageIDStr); err != nil {
			return nil, err
		}

		messageID, err := uuid.Parse(messageIDStr)
		if err != nil {
			return nil, fmt.Errorf("invalid message id: %w", err)
		}

		messageIDs = append(messageIDs, messageID)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return messageIDs, nil
}

func (r *ConversationRepository) GetGroupConversationIDsForUser(
	ctx context.Context,
	userID uuid.UUID,
) ([]uuid.UUID, error) {
	const query = `
		SELECT c.id
		FROM conversations c
		JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
		WHERE c.type = $2`

	rows, err := r.db.Query(ctx, query, userID.String(), models.ConversationTypeGroup)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	conversationIDs := make([]uuid.UUID, 0)
	for rows.Next() {
		var conversationIDStr string
		if err := rows.Scan(&conversationIDStr); err != nil {
			return nil, err
		}

		conversationID, err := uuid.Parse(conversationIDStr)
		if err != nil {
			return nil, fmt.Errorf("invalid conversation id: %w", err)
		}

		conversationIDs = append(conversationIDs, conversationID)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return conversationIDs, nil
}

type GroupMessageTickStatus struct {
	MessageID uuid.UUID
	SenderID  uuid.UUID
	Status    string
}

func (r *ConversationRepository) GetGroupMessageTickStatuses(
	ctx context.Context,
	conversationID uuid.UUID,
	messageIDs []uuid.UUID,
) ([]GroupMessageTickStatus, error) {
	if len(messageIDs) == 0 {
		return nil, nil
	}

	idStrings := make([]string, len(messageIDs))
	for i, id := range messageIDs {
		idStrings[i] = id.String()
	}

	const query = `
		WITH target_messages AS (
			SELECT m.id, m.sender_id
			FROM messages m
			WHERE m.conversation_id = $1
			  AND m.id = ANY($2::uuid[])
		),
		status_counts AS (
			SELECT
				tm.id AS message_id,
				tm.sender_id,
				(
					SELECT COUNT(*)
					FROM conversation_members cm
					WHERE cm.conversation_id = $1
					  AND cm.user_id <> tm.sender_id
				) AS other_member_count,
				(
					SELECT COUNT(*)
					FROM message_deliveries md
					WHERE md.message_id = tm.id
				) AS delivered_count,
				(
					SELECT COUNT(*)
					FROM message_reads mr
					WHERE mr.message_id = tm.id
				) AS read_count
			FROM target_messages tm
		)
		SELECT
			message_id,
			sender_id,
			CASE
				WHEN other_member_count = 0 THEN 'sent'
				WHEN read_count >= other_member_count THEN 'seen'
				WHEN delivered_count >= other_member_count THEN 'delivered'
				ELSE 'sent'
			END AS tick_status
		FROM status_counts`

	rows, err := r.db.Query(ctx, query, conversationID.String(), idStrings)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]GroupMessageTickStatus, 0)
	for rows.Next() {
		var item GroupMessageTickStatus
		var messageIDStr, senderIDStr string

		if err := rows.Scan(&messageIDStr, &senderIDStr, &item.Status); err != nil {
			return nil, err
		}

		item.MessageID, err = uuid.Parse(messageIDStr)
		if err != nil {
			return nil, fmt.Errorf("invalid message id: %w", err)
		}

		item.SenderID, err = uuid.Parse(senderIDStr)
		if err != nil {
			return nil, fmt.Errorf("invalid sender id: %w", err)
		}

		results = append(results, item)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return results, nil
}

func (r *ConversationRepository) GetMessageInfo(
	ctx context.Context,
	messageID uuid.UUID,
) ([]models.MemberReadStatus, error) {
	const query = `
		SELECT
			u.id,
			u.full_name,
			u.username,
			u.avatar_url,
			md.delivered_at,
			mr.read_at,
			CASE
				WHEN mr.message_id IS NOT NULL THEN 'seen'
				WHEN md.message_id IS NOT NULL THEN 'delivered'
				ELSE 'not_delivered'
			END AS member_status
		FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		JOIN conversation_members cm
			ON cm.conversation_id = m.conversation_id
			AND cm.user_id <> m.sender_id
		JOIN users u ON u.id = cm.user_id
		LEFT JOIN message_reads mr
			ON mr.message_id = m.id AND mr.user_id = cm.user_id
		LEFT JOIN message_deliveries md
			ON md.message_id = m.id AND md.user_id = cm.user_id
		WHERE m.id = $1
		  AND c.type = $2
		ORDER BY u.full_name ASC`

	rows, err := r.db.Query(ctx, query, messageID.String(), models.ConversationTypeGroup)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := make([]models.MemberReadStatus, 0)
	for rows.Next() {
		var member models.MemberReadStatus
		var avatarURL *string

		if err := rows.Scan(
			&member.UserID,
			&member.FullName,
			&member.Username,
			&avatarURL,
			&member.DeliveredAt,
			&member.ReadAt,
			&member.Status,
		); err != nil {
			return nil, err
		}

		member.AvatarURL = avatarURL
		members = append(members, member)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return members, nil
}

func (r *ConversationRepository) GetDirectMessageInfo(
	ctx context.Context,
	messageID uuid.UUID,
) (*models.MemberReadStatus, error) {
	const query = `
		SELECT
			u.id,
			u.full_name,
			u.username,
			u.avatar_url,
			m.delivered_at,
			CASE
				WHEN crs.last_read_at IS NOT NULL AND crs.last_read_at >= m.created_at
					THEN crs.last_read_at
				ELSE NULL
			END AS read_at,
			CASE
				WHEN crs.last_read_at IS NOT NULL AND crs.last_read_at >= m.created_at THEN 'seen'
				WHEN m.delivered_at IS NOT NULL THEN 'delivered'
				ELSE 'not_delivered'
			END AS member_status
		FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		JOIN conversation_members cm
			ON cm.conversation_id = m.conversation_id
			AND cm.user_id <> m.sender_id
		JOIN users u ON u.id = cm.user_id
		LEFT JOIN conversation_read_state crs
			ON crs.conversation_id = m.conversation_id
			AND crs.user_id = cm.user_id
		WHERE m.id = $1
		  AND c.type = $2
		LIMIT 1`

	var member models.MemberReadStatus
	var avatarURL *string

	err := r.db.QueryRow(
		ctx,
		query,
		messageID.String(),
		models.ConversationTypeDirect,
	).Scan(
		&member.UserID,
		&member.FullName,
		&member.Username,
		&avatarURL,
		&member.DeliveredAt,
		&member.ReadAt,
		&member.Status,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	member.AvatarURL = avatarURL

	return &member, nil
}

func (r *ConversationRepository) UpsertReadState(
	ctx context.Context,
	conversationID, userID uuid.UUID,
) error {
	const query = `
		INSERT INTO conversation_read_state (conversation_id, user_id, last_read_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (conversation_id, user_id)
		DO UPDATE SET last_read_at = NOW()`

	_, err := r.db.Exec(ctx, query, conversationID.String(), userID.String())
	return err
}

func (r *ConversationRepository) GetReadState(
	ctx context.Context,
	conversationID, userID uuid.UUID,
) (*time.Time, error) {
	const query = `
		SELECT crs.last_read_at
		FROM conversation_read_state crs
		JOIN conversation_members cm
			ON cm.conversation_id = crs.conversation_id
			AND cm.user_id = crs.user_id
		WHERE crs.conversation_id = $1
		  AND cm.user_id <> $2
		LIMIT 1`

	var lastReadAt time.Time

	err := r.db.QueryRow(ctx, query, conversationID.String(), userID.String()).Scan(&lastReadAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &lastReadAt, nil
}

type DeliveredMessageNotice struct {
	MessageID      string
	ConversationID string
	SenderID       string
}

func (r *ConversationRepository) MarkUndeliveredMessagesForRecipient(
	ctx context.Context,
	recipientID uuid.UUID,
) ([]DeliveredMessageNotice, error) {
	const query = `
		UPDATE messages m
		SET delivered_at = NOW()
		FROM conversations c
		JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
		WHERE m.conversation_id = c.id
		  AND m.delivered_at IS NULL
		  AND m.sender_id <> $1
		  AND c.type = $2
		  AND c.status = $3
		RETURNING m.id, m.conversation_id, m.sender_id`

	rows, err := r.db.Query(
		ctx,
		query,
		recipientID.String(),
		models.ConversationTypeDirect,
		models.ConversationStatusAccepted,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	notices := make([]DeliveredMessageNotice, 0)
	for rows.Next() {
		var notice DeliveredMessageNotice

		if err := rows.Scan(
			&notice.MessageID,
			&notice.ConversationID,
			&notice.SenderID,
		); err != nil {
			return nil, err
		}

		notices = append(notices, notice)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return notices, nil
}

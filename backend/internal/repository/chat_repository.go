package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
)

func (r *ConversationRepository) CreateMessage(
	ctx context.Context,
	conversationID, senderID uuid.UUID,
	content string,
	replyToMessageID *uuid.UUID,
	imageURL *string,
) (*models.Message, error) {
	const query = `
		INSERT INTO messages (conversation_id, sender_id, content, reply_to_message_id, image_url)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, conversation_id, sender_id, content, image_url, is_edited, is_unsent, reply_to_message_id, delivered_at, created_at, updated_at`

	var message models.Message
	var replyToID *string

	err := r.db.QueryRow(
		ctx,
		query,
		conversationID.String(),
		senderID.String(),
		content,
		replyToMessageID,
		imageURL,
	).Scan(
		&message.ID,
		&message.ConversationID,
		&message.SenderID,
		&message.Content,
		&message.ImageURL,
		&message.IsEdited,
		&message.IsUnsent,
		&replyToID,
		&message.DeliveredAt,
		&message.CreatedAt,
		&message.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	message.ReplyToMessageID = replyToID

	return &message, nil
}

func scanMessageReplyTo(
	replyToID, replyToSenderID, replyToContent *string,
	replyToIsUnsent *bool,
) *models.MessageReplyTo {
	if replyToID == nil || *replyToID == "" {
		return nil
	}

	replyTo := &models.MessageReplyTo{
		ID:       *replyToID,
		SenderID: "",
		Content:  "",
	}

	if replyToSenderID != nil {
		replyTo.SenderID = *replyToSenderID
	}
	if replyToContent != nil {
		replyTo.Content = *replyToContent
	}
	if replyToIsUnsent != nil {
		replyTo.IsUnsent = *replyToIsUnsent
	}

	return replyTo
}

func (r *ConversationRepository) EditMessage(
	ctx context.Context,
	messageID uuid.UUID,
	newContent string,
) (*models.Message, error) {
	const query = `
		UPDATE messages
		SET content = $2, is_edited = true, updated_at = NOW()
		WHERE id = $1
		RETURNING id, conversation_id, sender_id, content, is_edited, is_unsent, created_at, updated_at`

	var message models.Message

	err := r.db.QueryRow(ctx, query, messageID.String(), newContent).Scan(
		&message.ID,
		&message.ConversationID,
		&message.SenderID,
		&message.Content,
		&message.IsEdited,
		&message.IsUnsent,
		&message.CreatedAt,
		&message.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	return &message, nil
}

func (r *ConversationRepository) UnsendMessage(
	ctx context.Context,
	messageID uuid.UUID,
) error {
	const query = `
		UPDATE messages
		SET is_unsent = true, image_url = NULL, updated_at = NOW()
		WHERE id = $1 AND is_unsent = false`

	tag, err := r.db.Exec(ctx, query, messageID.String())
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *ConversationRepository) ListConversations(
	ctx context.Context,
	userID uuid.UUID,
) ([]models.ConversationWithPreview, error) {
	const query = `
		SELECT
			combined.conversation_id,
			combined.type,
			combined.requester_id,
			combined.requester_full_name,
			combined.requester_username,
			combined.requester_avatar_url,
			combined.group_name,
			combined.group_avatar_url,
			combined.latest_message_content,
			combined.latest_message_is_unsent,
			combined.latest_message_at,
			combined.requested_at,
			combined.requester_is_online,
			combined.requester_last_seen,
			combined.unread_count
		FROM (
			SELECT
				c.id AS conversation_id,
				c.type,
				u.id::text AS requester_id,
				u.full_name AS requester_full_name,
				u.username AS requester_username,
				u.avatar_url AS requester_avatar_url,
				NULL::text AS group_name,
				NULL::text AS group_avatar_url,
				COALESCE(latest.content, '') AS latest_message_content,
				COALESCE(latest.is_unsent, false) AS latest_message_is_unsent,
				COALESCE(latest.created_at, c.updated_at) AS latest_message_at,
				c.updated_at AS requested_at,
				u.is_online AS requester_is_online,
				u.last_seen AS requester_last_seen,
				(
					SELECT COUNT(*)::int
					FROM messages m
					LEFT JOIN conversation_read_state crs
						ON crs.conversation_id = c.id
						AND crs.user_id = $1
					WHERE m.conversation_id = c.id
					  AND m.sender_id <> $1
					  AND NOT EXISTS (
						SELECT 1
						FROM message_deletions md
						WHERE md.message_id = m.id
						  AND md.user_id = $1
					  )
					  AND (
						crs.last_read_at IS NULL
						OR m.created_at > crs.last_read_at
					  )
				) AS unread_count
			FROM conversations c
			JOIN conversation_members cm_self
				ON cm_self.conversation_id = c.id
				AND cm_self.user_id = $1
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

			UNION ALL

			SELECT
				c.id AS conversation_id,
				c.type,
				'' AS requester_id,
				'' AS requester_full_name,
				'' AS requester_username,
				NULL::text AS requester_avatar_url,
				c.name AS group_name,
				c.avatar_url AS group_avatar_url,
				COALESCE(latest.content, '') AS latest_message_content,
				COALESCE(latest.is_unsent, false) AS latest_message_is_unsent,
				COALESCE(latest.created_at, c.updated_at) AS latest_message_at,
				c.updated_at AS requested_at,
				false AS requester_is_online,
				NULL::timestamptz AS requester_last_seen,
				(
					SELECT COUNT(*)::int
					FROM messages m
					LEFT JOIN conversation_read_state crs
						ON crs.conversation_id = c.id
						AND crs.user_id = $1
					WHERE m.conversation_id = c.id
					  AND m.sender_id <> $1
					  AND NOT EXISTS (
						SELECT 1
						FROM message_deletions md
						WHERE md.message_id = m.id
						  AND md.user_id = $1
					  )
					  AND (
						crs.last_read_at IS NULL
						OR m.created_at > crs.last_read_at
					  )
				) AS unread_count
			FROM conversations c
			JOIN conversation_members cm_self
				ON cm_self.conversation_id = c.id
				AND cm_self.user_id = $1
			LEFT JOIN LATERAL (
				SELECT m.content, m.is_unsent, m.created_at
				FROM messages m
				WHERE m.conversation_id = c.id
				ORDER BY m.created_at DESC
				LIMIT 1
			) latest ON true
			WHERE c.type = $4
		) combined
		ORDER BY combined.latest_message_at DESC`

	rows, err := r.db.Query(
		ctx,
		query,
		userID.String(),
		models.ConversationStatusAccepted,
		models.ConversationTypeDirect,
		models.ConversationTypeGroup,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	conversations := make([]models.ConversationWithPreview, 0)
	for rows.Next() {
		var conversation models.ConversationWithPreview

		if err := rows.Scan(
			&conversation.ConversationID,
			&conversation.Type,
			&conversation.RequesterID,
			&conversation.RequesterFullName,
			&conversation.RequesterUsername,
			&conversation.RequesterAvatarURL,
			&conversation.GroupName,
			&conversation.GroupAvatarURL,
			&conversation.LatestMessageContent,
			&conversation.LatestMessageIsUnsent,
			&conversation.LatestMessageAt,
			&conversation.RequestedAt,
			&conversation.RequesterIsOnline,
			&conversation.RequesterLastSeen,
			&conversation.UnreadCount,
		); err != nil {
			return nil, err
		}

		conversations = append(conversations, conversation)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return conversations, nil
}

const defaultMessageListLimit = 50

func (r *ConversationRepository) GetMessageByID(
	ctx context.Context,
	messageID uuid.UUID,
) (*models.Message, error) {
	const query = `
		SELECT id, conversation_id, sender_id, content, image_url, is_edited, is_unsent, created_at, updated_at
		FROM messages
		WHERE id = $1`

	var message models.Message

	err := r.db.QueryRow(ctx, query, messageID.String()).Scan(
		&message.ID,
		&message.ConversationID,
		&message.SenderID,
		&message.Content,
		&message.ImageURL,
		&message.IsEdited,
		&message.IsUnsent,
		&message.CreatedAt,
		&message.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	return &message, nil
}

func (r *ConversationRepository) HideMessageForUser(
	ctx context.Context,
	messageID, userID uuid.UUID,
) error {
	const query = `
		INSERT INTO message_deletions (message_id, user_id)
		VALUES ($1, $2)
		ON CONFLICT (message_id, user_id) DO NOTHING`

	_, err := r.db.Exec(ctx, query, messageID.String(), userID.String())
	return err
}

func (r *ConversationRepository) ListMessages(
	ctx context.Context,
	conversationID, userID uuid.UUID,
	limit int,
) ([]models.Message, error) {
	if limit <= 0 {
		limit = defaultMessageListLimit
	}

	const query = `
		SELECT
			m.id,
			m.conversation_id,
			m.sender_id,
			m.content,
			m.image_url,
			m.is_edited,
			m.is_unsent,
			m.reply_to_message_id,
			m.delivered_at,
			m.created_at,
			m.updated_at,
			rt.id,
			rt.sender_id,
			rt.content,
			rt.is_unsent
		FROM messages m
		LEFT JOIN message_deletions md ON md.message_id = m.id AND md.user_id = $2
		LEFT JOIN messages rt ON rt.id = m.reply_to_message_id
		WHERE m.conversation_id = $1
		  AND md.id IS NULL
		ORDER BY m.created_at ASC
		LIMIT $3`

	rows, err := r.db.Query(ctx, query, conversationID.String(), userID.String(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := make([]models.Message, 0)
	for rows.Next() {
		var message models.Message
		var replyToMessageID *string
		var replyToID *string
		var replyToSenderID *string
		var replyToContent *string
		var replyToIsUnsent *bool

		if err := rows.Scan(
			&message.ID,
			&message.ConversationID,
			&message.SenderID,
			&message.Content,
			&message.ImageURL,
			&message.IsEdited,
			&message.IsUnsent,
			&replyToMessageID,
			&message.DeliveredAt,
			&message.CreatedAt,
			&message.UpdatedAt,
			&replyToID,
			&replyToSenderID,
			&replyToContent,
			&replyToIsUnsent,
		); err != nil {
			return nil, err
		}

		message.ReplyToMessageID = replyToMessageID
		message.ReplyTo = scanMessageReplyTo(
			replyToID,
			replyToSenderID,
			replyToContent,
			replyToIsUnsent,
		)

		messages = append(messages, message)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := r.attachReactionsToMessages(ctx, conversationID, messages); err != nil {
		return nil, err
	}

	return messages, nil
}

func (r *ConversationRepository) TouchConversation(
	ctx context.Context,
	conversationID uuid.UUID,
) error {
	const query = `
		UPDATE conversations
		SET updated_at = NOW()
		WHERE id = $1`

	tag, err := r.db.Exec(ctx, query, conversationID.String())
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

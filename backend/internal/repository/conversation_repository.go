package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
)

type ConversationRepository struct {
	db *pgxpool.Pool
}

func NewConversationRepository(db *pgxpool.Pool) *ConversationRepository {
	return &ConversationRepository{db: db}
}

func normalizeUserPair(userA, userB uuid.UUID) (uuid.UUID, uuid.UUID) {
	if userA.String() < userB.String() {
		return userA, userB
	}

	return userB, userA
}

func directPairKey(userA, userB uuid.UUID) string {
	userOne, userTwo := normalizeUserPair(userA, userB)

	return userOne.String() + "_" + userTwo.String()
}

const conversationSelectColumns = `
	id, type, name, avatar_url, created_by, direct_pair_key, status, requested_by, created_at, updated_at`

func scanConversation(scanner interface {
	Scan(dest ...any) error
}, conversation *models.Conversation) error {
	return scanner.Scan(
		&conversation.ID,
		&conversation.Type,
		&conversation.Name,
		&conversation.AvatarURL,
		&conversation.CreatedBy,
		&conversation.DirectPairKey,
		&conversation.Status,
		&conversation.RequestedBy,
		&conversation.CreatedAt,
		&conversation.UpdatedAt,
	)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError

	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

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

func (r *ConversationRepository) GetOtherParticipantID(
	ctx context.Context,
	conversationID, userID uuid.UUID,
) (uuid.UUID, error) {
	const query = `
		SELECT user_id
		FROM conversation_members
		WHERE conversation_id = $1
		  AND user_id <> $2
		LIMIT 1`

	var otherUserIDStr string

	err := r.db.QueryRow(ctx, query, conversationID.String(), userID.String()).Scan(&otherUserIDStr)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, fmt.Errorf("other participant not found")
	}
	if err != nil {
		return uuid.Nil, err
	}

	otherUserID, err := uuid.Parse(otherUserIDStr)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid other participant id: %w", err)
	}

	return otherUserID, nil
}

func (r *ConversationRepository) GetOtherMembers(
	ctx context.Context,
	conversationID, excludeUserID uuid.UUID,
) ([]uuid.UUID, error) {
	const query = `
		SELECT user_id
		FROM conversation_members
		WHERE conversation_id = $1
		  AND user_id <> $2
		ORDER BY joined_at ASC`

	rows, err := r.db.Query(ctx, query, conversationID.String(), excludeUserID.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	memberIDs := make([]uuid.UUID, 0)
	for rows.Next() {
		var memberIDStr string

		if err := rows.Scan(&memberIDStr); err != nil {
			return nil, err
		}

		memberID, err := uuid.Parse(memberIDStr)
		if err != nil {
			return nil, fmt.Errorf("invalid member id: %w", err)
		}

		memberIDs = append(memberIDs, memberID)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return memberIDs, nil
}

func (r *ConversationRepository) CreateGroup(
	ctx context.Context,
	name string,
	avatarURL *string,
	createdBy uuid.UUID,
	memberIDs []uuid.UUID,
) (*models.Conversation, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	const insertConversationQuery = `
		INSERT INTO conversations (
			type,
			name,
			avatar_url,
			created_by,
			status,
			requested_by,
			direct_pair_key
		)
		VALUES ($1, $2, $3, $4, NULL, NULL, NULL)
		RETURNING` + conversationSelectColumns

	var conversation models.Conversation
	createdByStr := createdBy.String()

	err = tx.QueryRow(
		ctx,
		insertConversationQuery,
		models.ConversationTypeGroup,
		name,
		avatarURL,
		createdByStr,
	).Scan(
		&conversation.ID,
		&conversation.Type,
		&conversation.Name,
		&conversation.AvatarURL,
		&conversation.CreatedBy,
		&conversation.DirectPairKey,
		&conversation.Status,
		&conversation.RequestedBy,
		&conversation.CreatedAt,
		&conversation.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	const insertMemberQuery = `
		INSERT INTO conversation_members (conversation_id, user_id, role)
		VALUES ($1, $2, $3)`

	if _, err := tx.Exec(
		ctx,
		insertMemberQuery,
		conversation.ID,
		createdByStr,
		models.ConversationMemberRoleAdmin,
	); err != nil {
		return nil, err
	}

	for _, memberID := range memberIDs {
		if memberID == createdBy {
			continue
		}

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
		return nil, err
	}

	memberCount := 1 + countDistinctMembers(memberIDs, createdBy)
	conversation.MemberCount = &memberCount

	return &conversation, nil
}

func countDistinctMembers(memberIDs []uuid.UUID, createdBy uuid.UUID) int {
	count := 0
	for _, memberID := range memberIDs {
		if memberID != createdBy {
			count++
		}
	}

	return count
}

func (r *ConversationRepository) GetGroupByID(
	ctx context.Context,
	conversationID uuid.UUID,
) (*models.Conversation, error) {
	const query = `
		SELECT
			c.id,
			c.type,
			c.name,
			c.avatar_url,
			c.created_by,
			c.direct_pair_key,
			c.status,
			c.requested_by,
			c.created_at,
			c.updated_at,
			(
				SELECT COUNT(*)
				FROM conversation_members cm
				WHERE cm.conversation_id = c.id
			) AS member_count
		FROM conversations c
		WHERE c.id = $1
		  AND c.type = $2`

	var conversation models.Conversation
	var memberCount int

	err := r.db.QueryRow(
		ctx,
		query,
		conversationID.String(),
		models.ConversationTypeGroup,
	).Scan(
		&conversation.ID,
		&conversation.Type,
		&conversation.Name,
		&conversation.AvatarURL,
		&conversation.CreatedBy,
		&conversation.DirectPairKey,
		&conversation.Status,
		&conversation.RequestedBy,
		&conversation.CreatedAt,
		&conversation.UpdatedAt,
		&memberCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	conversation.MemberCount = &memberCount

	return &conversation, nil
}

func (r *ConversationRepository) ListGroupMembers(
	ctx context.Context,
	conversationID uuid.UUID,
) ([]models.GroupMemberDetail, error) {
	const query = `
		SELECT
			u.id,
			u.full_name,
			u.username,
			u.avatar_url,
			cm.role,
			cm.joined_at
		FROM conversation_members cm
		JOIN users u ON u.id = cm.user_id
		WHERE cm.conversation_id = $1
		ORDER BY
			CASE WHEN cm.role = 'admin' THEN 0 ELSE 1 END,
			cm.joined_at ASC`

	rows, err := r.db.Query(ctx, query, conversationID.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := make([]models.GroupMemberDetail, 0)
	for rows.Next() {
		var member models.GroupMemberDetail

		if err := rows.Scan(
			&member.ID,
			&member.FullName,
			&member.Username,
			&member.AvatarURL,
			&member.Role,
			&member.JoinedAt,
		); err != nil {
			return nil, err
		}

		members = append(members, member)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return members, nil
}

func (r *ConversationRepository) UpdateGroupInfo(
	ctx context.Context,
	conversationID uuid.UUID,
	name string,
	avatarURL *string,
) error {
	const query = `
		UPDATE conversations
		SET name = $2, avatar_url = $3, updated_at = NOW()
		WHERE id = $1
		  AND type = $4`

	tag, err := r.db.Exec(
		ctx,
		query,
		conversationID.String(),
		name,
		avatarURL,
		models.ConversationTypeGroup,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *ConversationRepository) IsAdmin(
	ctx context.Context,
	conversationID, userID uuid.UUID,
) (bool, error) {
	const query = `
		SELECT EXISTS (
			SELECT 1
			FROM conversation_members
			WHERE conversation_id = $1
			  AND user_id = $2
			  AND role = $3
		)`

	var exists bool

	err := r.db.QueryRow(
		ctx,
		query,
		conversationID.String(),
		userID.String(),
		models.ConversationMemberRoleAdmin,
	).Scan(&exists)
	if err != nil {
		return false, err
	}

	return exists, nil
}

func (r *ConversationRepository) AddMembers(
	ctx context.Context,
	conversationID uuid.UUID,
	userIDs []uuid.UUID,
) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	const insertQuery = `
		INSERT INTO conversation_members (conversation_id, user_id, role, joined_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (conversation_id, user_id) DO NOTHING`

	for _, userID := range userIDs {
		if _, err := tx.Exec(
			ctx,
			insertQuery,
			conversationID.String(),
			userID.String(),
			models.ConversationMemberRoleMember,
		); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *ConversationRepository) RemoveMember(
	ctx context.Context,
	conversationID, userID uuid.UUID,
) error {
	const query = `
		DELETE FROM conversation_members
		WHERE conversation_id = $1
		  AND user_id = $2`

	tag, err := r.db.Exec(ctx, query, conversationID.String(), userID.String())
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *ConversationRepository) UpdateMemberRole(
	ctx context.Context,
	conversationID, userID uuid.UUID,
	role string,
) error {
	const query = `
		UPDATE conversation_members
		SET role = $3
		WHERE conversation_id = $1
		  AND user_id = $2`

	tag, err := r.db.Exec(
		ctx,
		query,
		conversationID.String(),
		userID.String(),
		role,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (r *ConversationRepository) CountAdmins(
	ctx context.Context,
	conversationID uuid.UUID,
) (int, error) {
	const query = `
		SELECT COUNT(*)
		FROM conversation_members
		WHERE conversation_id = $1
		  AND role = $2`

	var count int

	err := r.db.QueryRow(
		ctx,
		query,
		conversationID.String(),
		models.ConversationMemberRoleAdmin,
	).Scan(&count)
	if err != nil {
		return 0, err
	}

	return count, nil
}

func (r *ConversationRepository) CountMembers(
	ctx context.Context,
	conversationID uuid.UUID,
) (int, error) {
	const query = `
		SELECT COUNT(*)
		FROM conversation_members
		WHERE conversation_id = $1`

	var count int

	err := r.db.QueryRow(ctx, query, conversationID.String()).Scan(&count)
	if err != nil {
		return 0, err
	}

	return count, nil
}

func (r *ConversationRepository) GetOldestMember(
	ctx context.Context,
	conversationID uuid.UUID,
	excludeUserID uuid.UUID,
) (uuid.UUID, error) {
	const query = `
		SELECT user_id
		FROM conversation_members
		WHERE conversation_id = $1
		  AND user_id != $2
		ORDER BY joined_at ASC
		LIMIT 1`

	var userIDStr string

	err := r.db.QueryRow(
		ctx,
		query,
		conversationID.String(),
		excludeUserID.String(),
	).Scan(&userIDStr)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrNotFound
	}
	if err != nil {
		return uuid.Nil, err
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid oldest member id: %w", err)
	}

	return userID, nil
}

func (r *ConversationRepository) PromoteMemberAndRemoveMember(
	ctx context.Context,
	conversationID, promoteUserID, removeUserID uuid.UUID,
) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	const updateRoleQuery = `
		UPDATE conversation_members
		SET role = $3
		WHERE conversation_id = $1
		  AND user_id = $2`

	tag, err := tx.Exec(
		ctx,
		updateRoleQuery,
		conversationID.String(),
		promoteUserID.String(),
		models.ConversationMemberRoleAdmin,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	const removeQuery = `
		DELETE FROM conversation_members
		WHERE conversation_id = $1
		  AND user_id = $2`

	tag, err = tx.Exec(ctx, removeQuery, conversationID.String(), removeUserID.String())
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return tx.Commit(ctx)
}

func (r *ConversationRepository) CountMessagesBySender(
	ctx context.Context,
	conversationID, senderID uuid.UUID,
) (int, error) {
	const query = `
		SELECT COUNT(*)
		FROM messages
		WHERE conversation_id = $1 AND sender_id = $2`

	var count int
	err := r.db.QueryRow(ctx, query, conversationID.String(), senderID.String()).Scan(&count)
	if err != nil {
		return 0, err
	}

	return count, nil
}

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

func (r *ConversationRepository) GetByID(
	ctx context.Context,
	conversationID uuid.UUID,
) (*models.Conversation, error) {
	const query = `
		SELECT` + conversationSelectColumns + `
		FROM conversations
		WHERE id = $1`

	var conversation models.Conversation

	err := scanConversation(r.db.QueryRow(ctx, query, conversationID.String()), &conversation)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	return &conversation, nil
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
			combined.requester_last_seen
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
				u.last_seen AS requester_last_seen
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
				NULL::timestamptz AS requester_last_seen
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

func (r *ConversationRepository) IsParticipant(
	ctx context.Context,
	conversationID, userID uuid.UUID,
) (bool, error) {
	const query = `
		SELECT EXISTS (
			SELECT 1
			FROM conversation_members
			WHERE conversation_id = $1
			  AND user_id = $2
		)`

	var exists bool

	err := r.db.QueryRow(ctx, query, conversationID.String(), userID.String()).Scan(&exists)
	if err != nil {
		return false, err
	}

	return exists, nil
}

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

func (r *ConversationRepository) MarkMessageDelivered(
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
		  AND (
			(c.type = $2 AND c.status = $3)
			OR c.type = $4
		  )
		RETURNING m.id, m.conversation_id, m.sender_id`

	rows, err := r.db.Query(
		ctx,
		query,
		recipientID.String(),
		models.ConversationTypeDirect,
		models.ConversationStatusAccepted,
		models.ConversationTypeGroup,
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

func (r *ConversationRepository) UpsertReaction(
	ctx context.Context,
	messageID, userID uuid.UUID,
	emoji string,
) error {
	const query = `
		INSERT INTO message_reactions (message_id, user_id, emoji)
		VALUES ($1, $2, $3)
		ON CONFLICT (message_id, user_id)
		DO UPDATE SET emoji = EXCLUDED.emoji, created_at = NOW()`

	_, err := r.db.Exec(ctx, query, messageID.String(), userID.String(), emoji)
	return err
}

func (r *ConversationRepository) RemoveReaction(
	ctx context.Context,
	messageID, userID uuid.UUID,
) error {
	const query = `
		DELETE FROM message_reactions
		WHERE message_id = $1 AND user_id = $2`

	_, err := r.db.Exec(ctx, query, messageID.String(), userID.String())
	return err
}

func (r *ConversationRepository) GetUserReaction(
	ctx context.Context,
	messageID, userID uuid.UUID,
) (*string, error) {
	const query = `
		SELECT emoji
		FROM message_reactions
		WHERE message_id = $1 AND user_id = $2`

	var emoji string

	err := r.db.QueryRow(ctx, query, messageID.String(), userID.String()).Scan(&emoji)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &emoji, nil
}

func (r *ConversationRepository) GetReactionsForMessage(
	ctx context.Context,
	messageID uuid.UUID,
) ([]models.ReactionSummary, error) {
	const query = `
		SELECT emoji, user_id
		FROM message_reactions
		WHERE message_id = $1
		ORDER BY emoji, created_at`

	rows, err := r.db.Query(ctx, query, messageID.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanReactionSummaries(rows)
}

func (r *ConversationRepository) attachReactionsToMessages(
	ctx context.Context,
	conversationID uuid.UUID,
	messages []models.Message,
) error {
	if len(messages) == 0 {
		return nil
	}

	const query = `
		SELECT mr.message_id, mr.emoji, mr.user_id
		FROM message_reactions mr
		JOIN messages m ON m.id = mr.message_id
		WHERE m.conversation_id = $1
		ORDER BY mr.message_id, mr.emoji, mr.created_at`

	rows, err := r.db.Query(ctx, query, conversationID.String())
	if err != nil {
		return err
	}
	defer rows.Close()

	reactionsByMessage := make(map[string][]models.ReactionSummary)

	for rows.Next() {
		var messageID string
		var emoji string
		var userID string

		if err := rows.Scan(&messageID, &emoji, &userID); err != nil {
			return err
		}

		summaries := reactionsByMessage[messageID]
		if len(summaries) == 0 || summaries[len(summaries)-1].Emoji != emoji {
			summaries = append(summaries, models.ReactionSummary{
				Emoji:   emoji,
				Count:   1,
				UserIDs: []string{userID},
			})
		} else {
			last := summaries[len(summaries)-1]
			last.Count++
			last.UserIDs = append(last.UserIDs, userID)
			summaries[len(summaries)-1] = last
		}

		reactionsByMessage[messageID] = summaries
	}

	if err := rows.Err(); err != nil {
		return err
	}

	for i := range messages {
		if reactions, ok := reactionsByMessage[messages[i].ID]; ok {
			messages[i].Reactions = reactions
		} else {
			messages[i].Reactions = []models.ReactionSummary{}
		}
	}

	return nil
}

func scanReactionSummaries(rows pgx.Rows) ([]models.ReactionSummary, error) {
	summaries := make([]models.ReactionSummary, 0)

	for rows.Next() {
		var emoji string
		var userID string

		if err := rows.Scan(&emoji, &userID); err != nil {
			return nil, err
		}

		if len(summaries) == 0 || summaries[len(summaries)-1].Emoji != emoji {
			summaries = append(summaries, models.ReactionSummary{
				Emoji:   emoji,
				Count:   1,
				UserIDs: []string{userID},
			})
			continue
		}

		last := summaries[len(summaries)-1]
		last.Count++
		last.UserIDs = append(last.UserIDs, userID)
		summaries[len(summaries)-1] = last
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	if summaries == nil {
		return []models.ReactionSummary{}, nil
	}

	return summaries, nil
}

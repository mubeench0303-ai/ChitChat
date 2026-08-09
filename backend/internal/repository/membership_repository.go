package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
)

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

func (r *ConversationRepository) ListEligibleGroupMemberConnections(
	ctx context.Context,
	userID, groupConversationID uuid.UUID,
) ([]models.FriendResponse, error) {
	const query = `
		SELECT
			u.id,
			u.full_name,
			u.username,
			u.avatar_url,
			u.is_online,
			c.id
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
		  AND u.is_deleted = FALSE
		  AND NOT EXISTS (
			SELECT 1
			FROM conversation_members existing
			WHERE existing.conversation_id = $4
			  AND existing.user_id = u.id
		  )
		ORDER BY u.full_name ASC`

	rows, err := r.db.Query(
		ctx,
		query,
		userID.String(),
		models.ConversationTypeDirect,
		models.ConversationStatusAccepted,
		groupConversationID.String(),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	connections := make([]models.FriendResponse, 0)
	for rows.Next() {
		var connection models.FriendResponse

		if err := rows.Scan(
			&connection.ID,
			&connection.FullName,
			&connection.Username,
			&connection.AvatarURL,
			&connection.IsOnline,
			&connection.ConversationID,
		); err != nil {
			return nil, err
		}

		connections = append(connections, connection)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return connections, nil
}

func (r *ConversationRepository) GetGroupsCreatedBy(
	ctx context.Context,
	userID uuid.UUID,
) ([]uuid.UUID, error) {
	const query = `
		SELECT id
		FROM conversations
		WHERE type = $1
		  AND created_by = $2`

	rows, err := r.db.Query(
		ctx,
		query,
		models.ConversationTypeGroup,
		userID.String(),
	)
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
			return nil, fmt.Errorf("invalid group conversation id: %w", err)
		}

		conversationIDs = append(conversationIDs, conversationID)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return conversationIDs, nil
}

func (r *ConversationRepository) TransferGroupOwnership(
	ctx context.Context,
	conversationID, newOwnerID uuid.UUID,
) error {
	const query = `
		UPDATE conversations
		SET created_by = $2, updated_at = NOW()
		WHERE id = $1
		  AND type = $3`

	tag, err := r.db.Exec(
		ctx,
		query,
		conversationID.String(),
		newOwnerID.String(),
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

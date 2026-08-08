package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
)

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
		&conversation.BlockedBy,
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

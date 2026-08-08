package repository

import (
	"context"
	"errors"
	"fmt"

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
	id, type, name, avatar_url, created_by, direct_pair_key, status, requested_by, blocked_by, created_at, updated_at`

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
		&conversation.BlockedBy,
		&conversation.CreatedAt,
		&conversation.UpdatedAt,
	)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError

	return errors.As(err, &pgErr) && pgErr.Code == "23505"
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

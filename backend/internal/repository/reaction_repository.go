package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
)

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

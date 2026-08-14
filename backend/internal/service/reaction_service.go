package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
)

var allowedReactionEmojis = map[string]struct{}{
	"❤️": {},
	"👍":  {},
	"😂":  {},
	"😮":  {},
	"😢":  {},
	"😡":  {},
}

func (s *ConversationService) ToggleReaction(
	ctx context.Context,
	userID, messageID uuid.UUID,
	emoji string,
) error {
	if _, ok := allowedReactionEmojis[emoji]; !ok {
		return ErrInvalidReactionEmoji
	}

	message, err := s.conversations.GetMessageByID(ctx, messageID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrMessageNotFound
	}
	if err != nil {
		return fmt.Errorf("conversation: failed to get message: %w", err)
	}

	conversationID, err := uuid.Parse(message.ConversationID)
	if err != nil {
		return fmt.Errorf("conversation: invalid conversation id on message: %w", err)
	}

	isParticipant, err := s.conversations.IsParticipant(ctx, conversationID, userID)
	if err != nil {
		return fmt.Errorf("conversation: failed to check participant: %w", err)
	}
	if !isParticipant {
		return ErrNotAuthorized
	}

	if err := s.ensureConversationNotPending(ctx, conversationID); err != nil {
		return err
	}

	currentReaction, err := s.conversations.GetUserReaction(ctx, messageID, userID)
	if err != nil {
		return fmt.Errorf("conversation: failed to get user reaction: %w", err)
	}

	switch {
	case currentReaction == nil:
		if err := s.conversations.UpsertReaction(ctx, messageID, userID, emoji); err != nil {
			return fmt.Errorf("conversation: failed to add reaction: %w", err)
		}
	case *currentReaction == emoji:
		if err := s.conversations.RemoveReaction(ctx, messageID, userID); err != nil {
			return fmt.Errorf("conversation: failed to remove reaction: %w", err)
		}
	default:
		if err := s.conversations.UpsertReaction(ctx, messageID, userID, emoji); err != nil {
			return fmt.Errorf("conversation: failed to update reaction: %w", err)
		}
	}

	reactions, err := s.conversations.GetReactionsForMessage(ctx, messageID)
	if err != nil {
		return fmt.Errorf("conversation: failed to load reactions: %w", err)
	}

	if s.notifications != nil {
		payload := map[string]interface{}{
			"conversationId": message.ConversationID,
			"messageId":      message.ID,
			"reactions":      reactionsToNotificationPayload(reactions),
		}

		s.notifyOtherMembers(ctx, conversationID, userID, "reaction_updated", payload)
	}

	return nil
}

func reactionsToNotificationPayload(reactions []models.ReactionSummary) []map[string]interface{} {
	payload := make([]map[string]interface{}, 0, len(reactions))
	for _, reaction := range reactions {
		payload = append(payload, map[string]interface{}{
			"emoji":   reaction.Emoji,
			"count":   reaction.Count,
			"userIds": reaction.UserIDs,
		})
	}

	return payload
}

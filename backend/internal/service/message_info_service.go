package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
)

func (s *ConversationService) MarkConversationRead(
	ctx context.Context,
	userID, conversationID uuid.UUID,
) error {
	isParticipant, err := s.conversations.IsParticipant(ctx, conversationID, userID)
	if err != nil {
		return fmt.Errorf("conversation: failed to check participant: %w", err)
	}
	if !isParticipant {
		return ErrNotAuthorized
	}

	conversation, err := s.conversations.GetByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrConversationNotFound
	}
	if err != nil {
		return fmt.Errorf("conversation: failed to fetch conversation: %w", err)
	}

	if err := s.conversations.UpsertReadState(ctx, conversationID, userID); err != nil {
		return fmt.Errorf("conversation: failed to update read state: %w", err)
	}

	if conversation.Type == models.ConversationTypeGroup {
		affectedMessageIDs, err := s.conversations.MarkMessagesReadForUser(
			ctx,
			conversationID,
			userID,
		)
		if err != nil {
			return fmt.Errorf("conversation: failed to mark group messages read: %w", err)
		}

		s.pushGroupTickUpdates(ctx, conversationID, affectedMessageIDs)
	}

	if s.notifications != nil {
		payload := map[string]interface{}{
			"conversationId": conversationID.String(),
			"readAt":         time.Now(),
		}

		s.notifyOtherMembers(ctx, conversationID, userID, "conversation_read", payload)
	}

	return nil
}

func (s *ConversationService) DeliverPendingMessages(
	ctx context.Context,
	userID uuid.UUID,
) error {
	notices, err := s.conversations.MarkUndeliveredMessagesForRecipient(ctx, userID)
	if err != nil {
		return fmt.Errorf("conversation: failed to mark pending deliveries: %w", err)
	}

	if s.notifications != nil && len(notices) > 0 {
		for _, notice := range notices {
			senderID, err := uuid.Parse(notice.SenderID)
			if err != nil {
				log.Printf("conversation: invalid sender id on delivery notice: %v", err)
				continue
			}

			payload := map[string]interface{}{
				"conversationId": notice.ConversationID,
				"messageId":      notice.MessageID,
			}

			if err := s.notifications.NotifyUsers([]uuid.UUID{senderID}, "message_delivered", payload); err != nil {
				log.Printf("conversation: failed to notify sender %s of delivery: %v", senderID, err)
			}
		}
	}

	groupConversationIDs, err := s.conversations.GetGroupConversationIDsForUser(ctx, userID)
	if err != nil {
		return fmt.Errorf("conversation: failed to list group conversations: %w", err)
	}

	for _, conversationID := range groupConversationIDs {
		affectedMessageIDs, markErr := s.conversations.MarkMessagesDeliveredForUser(
			ctx,
			conversationID,
			userID,
		)
		if markErr != nil {
			return fmt.Errorf("conversation: failed to mark group messages delivered: %w", markErr)
		}

		s.pushGroupTickUpdates(ctx, conversationID, affectedMessageIDs)
	}

	return nil
}

func applyMessageStatus(
	message *models.Message,
	otherLastRead *time.Time,
	requestingUserID string,
) {
	if message.SenderID != requestingUserID {
		message.Status = nil
		return
	}

	status := "sent"
	if otherLastRead != nil && !otherLastRead.Before(message.CreatedAt) {
		status = "seen"
	} else if message.DeliveredAt != nil {
		status = "delivered"
	}

	message.Status = &status
}

func (s *ConversationService) notifyOtherMembers(
	ctx context.Context,
	conversationID, excludeUserID uuid.UUID,
	eventType string,
	payload map[string]interface{},
) {
	if s.notifications == nil {
		return
	}

	recipientIDs, err := s.conversations.GetOtherMembers(ctx, conversationID, excludeUserID)
	if err != nil {
		log.Printf("conversation: failed to resolve notification recipients: %v", err)
		return
	}

	if err := s.notifications.NotifyUsers(recipientIDs, eventType, payload); err != nil {
		log.Printf("conversation: failed to notify recipients: %v", err)
	}
}

func (s *ConversationService) pushGroupTickUpdates(
	ctx context.Context,
	conversationID uuid.UUID,
	messageIDs []uuid.UUID,
) {
	if s.notifications == nil || len(messageIDs) == 0 {
		return
	}

	tickStatuses, err := s.conversations.GetGroupMessageTickStatuses(
		ctx,
		conversationID,
		messageIDs,
	)
	if err != nil {
		log.Printf("conversation: failed to compute group tick statuses: %v", err)
		return
	}

	for _, item := range tickStatuses {
		payload := map[string]interface{}{
			"conversationId": conversationID.String(),
			"messageId":      item.MessageID.String(),
			"tickStatus":     item.Status,
		}

		if err := s.notifications.NotifyUsers([]uuid.UUID{item.SenderID}, "message_tick_updated", payload); err != nil {
			log.Printf("conversation: failed to notify tick update for message %s: %v", item.MessageID, err)
		}
	}
}

func (s *ConversationService) GetMessageInfo(
	ctx context.Context,
	actingUserID, messageID uuid.UUID,
) ([]models.MemberReadStatus, error) {
	message, err := s.conversations.GetMessageByID(ctx, messageID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrMessageNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to get message: %w", err)
	}

	if message.SenderID != actingUserID.String() {
		return nil, ErrNotMessageSender
	}

	conversationID, err := uuid.Parse(message.ConversationID)
	if err != nil {
		return nil, fmt.Errorf("conversation: invalid conversation id on message: %w", err)
	}

	conversation, err := s.conversations.GetByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrConversationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to fetch conversation: %w", err)
	}

	if conversation.Type == models.ConversationTypeGroup {
		members, err := s.conversations.GetMessageInfo(ctx, messageID)
		if err != nil {
			return nil, fmt.Errorf("conversation: failed to get message info: %w", err)
		}

		return members, nil
	}

	if conversation.Type != models.ConversationTypeDirect {
		return nil, ErrNotAuthorized
	}

	member, err := s.conversations.GetDirectMessageInfo(ctx, messageID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrMessageNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to get direct message info: %w", err)
	}

	return []models.MemberReadStatus{*member}, nil
}

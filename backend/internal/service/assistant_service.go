package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
	"github.com/mubeench0303-ai/ChitChat/backend/pkg/gemini"
)

const (
	assistantContextMessageLimit = 20
	assistantFallbackReply       = "Sorry, I couldn't process that right now."
	assistantWelcomeMessage      = "Hi! I'm your AI Assistant. Ask me anything — I'm here to help."
)

type AssistantService struct {
	conversations *repository.ConversationRepository
	users         *repository.UserRepository
	notifications NotificationService
	gemini        *gemini.Client
	assistantID   uuid.UUID

	conversationLocks sync.Map
}

func NewAssistantService(
	conversations *repository.ConversationRepository,
	users *repository.UserRepository,
	notifications NotificationService,
	geminiClient *gemini.Client,
) *AssistantService {
	return &AssistantService{
		conversations: conversations,
		users:         users,
		notifications: notifications,
		gemini:        geminiClient,
		assistantID:   uuid.MustParse(models.AIAssistantUserID),
	}
}

func (s *AssistantService) EnsureAIConversation(ctx context.Context, userID uuid.UUID) error {
	if userID == s.assistantID {
		return nil
	}

	existing, err := s.conversations.FindBetweenUsers(ctx, userID, s.assistantID)
	if err != nil {
		return fmt.Errorf("assistant: failed to find conversation: %w", err)
	}
	if existing != nil {
		return nil
	}

	return s.createAssistantConversation(ctx, userID)
}

func (s *AssistantService) createAssistantConversation(
	ctx context.Context,
	userID uuid.UUID,
) error {
	conversation, err := s.conversations.CreateAcceptedDirect(ctx, userID, s.assistantID)
	if err != nil {
		return fmt.Errorf("assistant: failed to create conversation: %w", err)
	}

	conversationUUID, err := uuid.Parse(conversation.ID)
	if err != nil {
		return fmt.Errorf("assistant: invalid conversation id: %w", err)
	}

	if _, err := s.conversations.CreateMessage(
		ctx,
		conversationUUID,
		s.assistantID,
		assistantWelcomeMessage,
		nil,
		nil,
		nil,
	); err != nil {
		return fmt.Errorf("assistant: failed to create welcome message: %w", err)
	}

	if err := s.conversations.TouchConversation(ctx, conversationUUID); err != nil {
		return fmt.Errorf("assistant: failed to touch conversation: %w", err)
	}

	return nil
}

func (s *AssistantService) BuildContext(
	ctx context.Context,
	conversationID uuid.UUID,
) ([]gemini.GeminiMessage, error) {
	messages, err := s.conversations.ListRecentMessagesForContext(
		ctx,
		conversationID,
		assistantContextMessageLimit,
	)
	if err != nil {
		return nil, fmt.Errorf("assistant: failed to list messages: %w", err)
	}

	geminiMessages := make([]gemini.GeminiMessage, 0, len(messages))
	for _, message := range messages {
		if message.IsUnsent {
			continue
		}

		content := strings.TrimSpace(messageContentForAssistant(&message))
		if content == "" {
			continue
		}

		role := "user"
		if message.SenderID == s.assistantID.String() {
			role = "model"
		}

		geminiMessages = append(geminiMessages, gemini.GeminiMessage{
			Role:    role,
			Content: content,
		})
	}

	return geminiMessages, nil
}

func (s *AssistantService) GenerateAndSendReply(
	ctx context.Context,
	conversationID, humanUserID uuid.UUID,
) error {
	lock := s.getConversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()

	replyText, geminiErr := s.generateReplyText(ctx, conversationID)
	if geminiErr != nil {
		logAssistantFailure(conversationID, geminiErr)
		replyText = assistantFallbackReply
	}

	return s.insertAndBroadcastReply(ctx, conversationID, humanUserID, replyText)
}

func (s *AssistantService) generateReplyText(
	ctx context.Context,
	conversationID uuid.UUID,
) (string, error) {
	if s.gemini == nil {
		return "", gemini.ErrMissingAPIKey
	}

	contextMessages, err := s.BuildContext(ctx, conversationID)
	if err != nil {
		return "", err
	}

	return s.gemini.GenerateReply(ctx, contextMessages)
}

func (s *AssistantService) insertAndBroadcastReply(
	ctx context.Context,
	conversationID, humanUserID uuid.UUID,
	replyText string,
) error {
	message, err := s.conversations.CreateMessage(
		ctx,
		conversationID,
		s.assistantID,
		replyText,
		nil,
		nil,
		nil,
	)
	if err != nil {
		return fmt.Errorf("assistant: failed to create reply message: %w", err)
	}

	scrubMessage(message)

	if err := s.conversations.TouchConversation(ctx, conversationID); err != nil {
		return fmt.Errorf("assistant: failed to touch conversation: %w", err)
	}

	if s.notifications != nil {
		senderName := "AI Assistant"
		if assistantUser, userErr := s.users.GetUserByID(ctx, s.assistantID.String()); userErr == nil {
			senderName = assistantUser.FullName
		}

		payload := map[string]interface{}{
			"conversationId": message.ConversationID,
			"message":        messageToNotificationPayload(message, senderName),
		}

		if err := s.notifications.NotifyUsers([]uuid.UUID{humanUserID}, "new_message", payload); err != nil {
			log.Printf("assistant: failed to notify user %s: %v", humanUserID, err)
		}

		messageUUID, parseErr := uuid.Parse(message.ID)
		if parseErr != nil {
			log.Printf("assistant: invalid message id for delivery mark: %v", parseErr)
		} else if s.notifications.IsUserOnline(humanUserID) {
			if err := s.conversations.MarkDirectMessageDelivered(ctx, messageUUID); err != nil {
				log.Printf("assistant: failed to mark message delivered: %v", err)
			}
		}
	}

	return nil
}

func (s *AssistantService) getConversationLock(conversationID uuid.UUID) *sync.Mutex {
	value, _ := s.conversationLocks.LoadOrStore(conversationID.String(), &sync.Mutex{})
	return value.(*sync.Mutex)
}

func messageContentForAssistant(message *models.Message) string {
	content := strings.TrimSpace(message.Content)
	if content != "" {
		return content
	}

	switch message.Type {
	case models.MessageTypeImage:
		return "[Image]"
	case models.MessageTypeVoice:
		return "[Voice message]"
	case models.MessageTypeVideo:
		return "[Video]"
	default:
		return ""
	}
}

func logAssistantFailure(conversationID uuid.UUID, err error) {
	switch {
	case errors.Is(err, gemini.ErrMissingAPIKey):
		log.Printf(
			"assistant: gemini unavailable for conversation %s: missing API key",
			conversationID,
		)
	case gemini.IsRateLimitError(err):
		log.Printf(
			"assistant: gemini rate limit for conversation %s: %v",
			conversationID,
			err,
		)
	case errors.Is(err, gemini.ErrEmptyResponse):
		log.Printf(
			"assistant: gemini empty response for conversation %s: %v",
			conversationID,
			err,
		)
	default:
		log.Printf(
			"assistant: gemini failure for conversation %s: %v",
			conversationID,
			err,
		)
	}
}

package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
)

const (
	maxMessageContentLength  = 2000
	maxMessageImageSizeBytes = 5 << 20
	messageImageUploadFolder = "chitchat/messages"
	editWindowDuration       = 10 * time.Minute
	unsendWindowDuration     = 1 * time.Hour
	unsentMessagePlaceholder = "This message was unsent"
	defaultMessageListLimit  = 50
)

func (s *ConversationService) GetChatList(
	ctx context.Context,
	userID uuid.UUID,
) ([]models.ConversationWithPreview, error) {
	conversations, err := s.conversations.ListConversations(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to list conversations: %w", err)
	}

	for i := range conversations {
		scrubConversationPreview(&conversations[i])
	}

	return conversations, nil
}

func (s *ConversationService) GetMessages(
	ctx context.Context,
	userID, conversationID uuid.UUID,
) ([]models.Message, error) {
	isParticipant, err := s.conversations.IsParticipant(ctx, conversationID, userID)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to check participant: %w", err)
	}
	if !isParticipant {
		return nil, ErrNotAuthorized
	}

	conversation, err := s.conversations.GetByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrConversationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to fetch conversation: %w", err)
	}

	messages, err := s.conversations.ListMessages(ctx, conversationID, userID, defaultMessageListLimit)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to list messages: %w", err)
	}

	if conversation.Type == models.ConversationTypeGroup {
		messageIDs := make([]uuid.UUID, 0, len(messages))
		for i := range messages {
			scrubMessage(&messages[i])
			if messages[i].SenderID == userID.String() {
				messageUUID, parseErr := uuid.Parse(messages[i].ID)
				if parseErr != nil {
					return nil, fmt.Errorf("conversation: invalid message id: %w", parseErr)
				}
				messageIDs = append(messageIDs, messageUUID)
			}
		}

		if len(messageIDs) > 0 {
			tickStatuses, tickErr := s.conversations.GetGroupMessageTickStatuses(
				ctx,
				conversationID,
				messageIDs,
			)
			if tickErr != nil {
				return nil, fmt.Errorf("conversation: failed to get group tick statuses: %w", tickErr)
			}

			tickByMessageID := make(map[string]string, len(tickStatuses))
			for _, item := range tickStatuses {
				tickByMessageID[item.MessageID.String()] = item.Status
			}

			for i := range messages {
				if messages[i].SenderID != userID.String() {
					continue
				}
				if status, ok := tickByMessageID[messages[i].ID]; ok {
					messages[i].TickStatus = &status
				} else {
					sent := "sent"
					messages[i].TickStatus = &sent
				}
			}
		}

		return messages, nil
	}

	var otherLastRead *time.Time
	if conversation.Type == models.ConversationTypeDirect {
		otherLastRead, err = s.conversations.GetReadState(ctx, conversationID, userID)
		if err != nil {
			return nil, fmt.Errorf("conversation: failed to get read state: %w", err)
		}
	}

	userIDStr := userID.String()
	for i := range messages {
		scrubMessage(&messages[i])
		applyMessageStatus(&messages[i], otherLastRead, userIDStr)
	}

	return messages, nil
}

func (s *ConversationService) DeleteMessageForMe(
	ctx context.Context,
	userID, messageID uuid.UUID,
) error {
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

	if err := s.conversations.HideMessageForUser(ctx, messageID, userID); err != nil {
		return fmt.Errorf("conversation: failed to hide message: %w", err)
	}

	return nil
}

func (s *ConversationService) EditMessage(
	ctx context.Context,
	userID, messageID uuid.UUID,
	newContent string,
) (*models.Message, error) {
	message, err := s.conversations.GetMessageByID(ctx, messageID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrMessageNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to get message: %w", err)
	}

	if message.SenderID != userID.String() {
		return nil, ErrNotAuthorized
	}

	if time.Since(message.CreatedAt) > editWindowDuration {
		return nil, ErrEditWindowExpired
	}

	trimmedContent := strings.TrimSpace(newContent)
	if err := validateMessageContent(trimmedContent); err != nil {
		return nil, err
	}

	updatedMessage, err := s.conversations.EditMessage(ctx, messageID, trimmedContent)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to edit message: %w", err)
	}

	scrubMessage(updatedMessage)

	if s.notifications != nil {
		conversationID, err := uuid.Parse(message.ConversationID)
		if err != nil {
			log.Printf("conversation: invalid conversation id on message: %v", err)
		} else {
			payload := map[string]interface{}{
				"conversationId": updatedMessage.ConversationID,
				"messageId":      updatedMessage.ID,
				"content":        updatedMessage.Content,
				"isEdited":       true,
			}

			s.notifyOtherMembers(ctx, conversationID, userID, "message_edited", payload)
		}
	}

	return updatedMessage, nil
}

func (s *ConversationService) UnsendMessage(
	ctx context.Context,
	userID, messageID uuid.UUID,
) error {
	message, err := s.conversations.GetMessageByID(ctx, messageID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrMessageNotFound
	}
	if err != nil {
		return fmt.Errorf("conversation: failed to get message: %w", err)
	}

	if message.SenderID != userID.String() {
		return ErrNotAuthorized
	}

	if message.IsUnsent {
		return nil
	}

	if time.Since(message.CreatedAt) > unsendWindowDuration {
		return ErrUnsendWindowExpired
	}

	if message.ImageURL != nil && strings.TrimSpace(*message.ImageURL) != "" {
		if s.cloudinary == nil {
			return fmt.Errorf("conversation: image delete is not configured")
		}

		if err := s.cloudinary.DeleteImage(ctx, *message.ImageURL); err != nil {
			return fmt.Errorf("conversation: failed to delete message image: %w", err)
		}
	}

	if err := s.conversations.UnsendMessage(ctx, messageID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrMessageNotFound
		}
		return fmt.Errorf("conversation: failed to unsend message: %w", err)
	}

	if s.notifications != nil {
		conversationID, err := uuid.Parse(message.ConversationID)
		if err != nil {
			log.Printf("conversation: invalid conversation id on message: %v", err)
		} else {
			payload := map[string]interface{}{
				"conversationId": message.ConversationID,
				"messageId":      message.ID,
			}

			s.notifyOtherMembers(ctx, conversationID, userID, "message_unsent", payload)
		}
	}

	return nil
}

func (s *ConversationService) SendChatMessage(
	ctx context.Context,
	userID, conversationID uuid.UUID,
	content string,
	replyToMessageID *uuid.UUID,
	imageFile multipart.File,
	imageFilename string,
) (*models.Message, error) {
	isParticipant, err := s.conversations.IsParticipant(ctx, conversationID, userID)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to check participant: %w", err)
	}
	if !isParticipant {
		return nil, ErrNotAuthorized
	}

	conversation, err := s.conversations.GetByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrConversationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to fetch conversation: %w", err)
	}

	if conversation.Type == models.ConversationTypeDirect {
		if conversation.Status == nil || *conversation.Status != models.ConversationStatusAccepted {
			return nil, ErrConversationNotAccepted
		}

		otherUserID, err := s.conversations.GetOtherParticipantID(ctx, conversationID, userID)
		if err != nil {
			return nil, fmt.Errorf("conversation: failed to resolve other participant: %w", err)
		}

		otherUser, err := s.users.GetUserByID(ctx, otherUserID.String())
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrRecipientNoLongerExists
		}
		if err != nil {
			return nil, fmt.Errorf("conversation: failed to load other participant: %w", err)
		}

		if otherUser.IsDeleted {
			return nil, ErrRecipientNoLongerExists
		}
	}

	trimmedContent := strings.TrimSpace(content)
	hasImage := imageFile != nil
	hasContent := trimmedContent != "" && utf8.RuneCountInString(trimmedContent) >= 1

	if !hasContent && !hasImage {
		return nil, ErrMessageContentOrImageRequired
	}

	if hasContent {
		if utf8.RuneCountInString(trimmedContent) > maxMessageContentLength {
			return nil, ErrMessageTooLong
		}
	}

	var imageURL *string
	if hasImage {
		if err := validateMessageImageFile(imageFile); err != nil {
			return nil, err
		}

		if s.cloudinary == nil {
			return nil, fmt.Errorf("conversation: image upload is not configured")
		}

		uploadedURL, err := s.cloudinary.UploadImage(
			ctx,
			imageFile,
			imageFilename,
			messageImageUploadFolder,
		)
		if err != nil {
			return nil, fmt.Errorf("conversation: failed to upload image: %w", err)
		}

		imageURL = &uploadedURL
	}

	var replyTarget *models.Message
	if replyToMessageID != nil {
		replyTarget, err = s.conversations.GetMessageByID(ctx, *replyToMessageID)
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrInvalidReplyTarget
		}
		if err != nil {
			return nil, fmt.Errorf("conversation: failed to get reply target: %w", err)
		}
		if replyTarget.ConversationID != conversationID.String() {
			return nil, ErrInvalidReplyTarget
		}
	}

	message, err := s.conversations.CreateMessage(
		ctx,
		conversationID,
		userID,
		trimmedContent,
		replyToMessageID,
		imageURL,
	)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to create message: %w", err)
	}

	if replyTarget != nil {
		scrubMessage(replyTarget)
		message.ReplyTo = &models.MessageReplyTo{
			ID:       replyTarget.ID,
			SenderID: replyTarget.SenderID,
			Content:  replyTarget.Content,
			IsUnsent: replyTarget.IsUnsent,
		}
	}

	scrubMessage(message)

	if err := s.conversations.TouchConversation(ctx, conversationID); err != nil {
		return nil, fmt.Errorf("conversation: failed to update conversation: %w", err)
	}

	if s.notifications != nil {
		senderName := ""
		if sender, userErr := s.users.GetUserByID(ctx, userID.String()); userErr != nil {
			log.Printf("conversation: failed to resolve sender name for notification: %v", userErr)
		} else {
			senderName = sender.FullName
		}

		payload := map[string]interface{}{
			"conversationId": message.ConversationID,
			"message":        messageToNotificationPayload(message, senderName),
		}

		recipientIDs, err := s.conversations.GetOtherMembers(ctx, conversationID, userID)
		if err != nil {
			log.Printf("conversation: failed to resolve notification recipients: %v", err)
		} else {
			if err := s.notifications.NotifyUsers(recipientIDs, "new_message", payload); err != nil {
				log.Printf("conversation: failed to notify message recipients: %v", err)
			}

			messageUUID, parseErr := uuid.Parse(message.ID)
			if parseErr != nil {
				log.Printf("conversation: invalid message id for delivery mark: %v", parseErr)
			} else if conversation.Type == models.ConversationTypeGroup {
				for _, recipientID := range recipientIDs {
					if !s.notifications.IsUserOnline(recipientID) {
						continue
					}
					if err := s.conversations.MarkMessageDelivered(ctx, messageUUID, recipientID); err != nil {
						log.Printf("conversation: failed to mark group message delivered for user %s: %v", recipientID, err)
					}
				}
				s.pushGroupTickUpdates(ctx, conversationID, []uuid.UUID{messageUUID})
			} else {
				deliveredMarked := false
				for _, recipientID := range recipientIDs {
					if !deliveredMarked && s.notifications.IsUserOnline(recipientID) {
						if err := s.conversations.MarkDirectMessageDelivered(ctx, messageUUID); err != nil {
							log.Printf("conversation: failed to mark message delivered: %v", err)
						} else {
							now := time.Now()
							message.DeliveredAt = &now
							deliveredMarked = true
						}
					}
				}
			}
		}
	}

	if conversation.Type == models.ConversationTypeGroup {
		messageUUID, parseErr := uuid.Parse(message.ID)
		if parseErr != nil {
			sent := "sent"
			message.TickStatus = &sent
		} else {
			tickStatuses, tickErr := s.conversations.GetGroupMessageTickStatuses(
				ctx,
				conversationID,
				[]uuid.UUID{messageUUID},
			)
			if tickErr != nil || len(tickStatuses) == 0 {
				sent := "sent"
				message.TickStatus = &sent
			} else {
				status := tickStatuses[0].Status
				message.TickStatus = &status
			}
		}
	} else {
		applyMessageStatus(message, nil, userID.String())
	}

	return message, nil
}

func scrubMessage(message *models.Message) {
	if message.IsUnsent {
		message.Content = unsentMessagePlaceholder
		message.ImageURL = nil
	}
	if message.ReplyTo != nil && message.ReplyTo.IsUnsent {
		message.ReplyTo.Content = unsentMessagePlaceholder
	}
}

func messageToNotificationPayload(message *models.Message, senderName string) map[string]interface{} {
	payload := map[string]interface{}{
		"id":             message.ID,
		"conversationId": message.ConversationID,
		"senderId":       message.SenderID,
		"content":        message.Content,
		"createdAt":      message.CreatedAt,
		"isUnsent":       message.IsUnsent,
		"isEdited":       message.IsEdited,
	}

	if senderName != "" {
		payload["senderName"] = senderName
	}

	if message.ReplyToMessageID != nil {
		payload["replyToMessageId"] = *message.ReplyToMessageID
	}
	if message.ImageURL != nil {
		payload["imageUrl"] = *message.ImageURL
	}
	if message.ReplyTo != nil {
		payload["replyTo"] = map[string]interface{}{
			"id":       message.ReplyTo.ID,
			"senderId": message.ReplyTo.SenderID,
			"content":  message.ReplyTo.Content,
			"isUnsent": message.ReplyTo.IsUnsent,
		}
	}
	if message.TickStatus != nil {
		payload["tickStatus"] = *message.TickStatus
	}

	return payload
}

func scrubConversationPreview(preview *models.ConversationWithPreview) {
	if preview.LatestMessageIsUnsent {
		preview.LatestMessageContent = unsentMessagePlaceholder
	}
}

func validateMessageContent(content string) error {
	if content == "" || utf8.RuneCountInString(content) < 1 {
		return ErrInvalidMessageContent
	}

	if utf8.RuneCountInString(content) > maxMessageContentLength {
		return ErrMessageTooLong
	}

	return nil
}

func validateMessageImageFile(file multipart.File) error {
	header := make([]byte, 512)
	n, err := file.Read(header)
	if err != nil && !errors.Is(err, io.EOF) {
		return fmt.Errorf("conversation: failed to read image file: %w", err)
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("conversation: failed to reset image file reader: %w", err)
	}

	contentType := http.DetectContentType(header[:n])
	switch contentType {
	case "image/jpeg", "image/png", "image/webp":
	default:
		return ErrInvalidMessageImageContentType
	}

	size, err := file.Seek(0, io.SeekEnd)
	if err != nil {
		return fmt.Errorf("conversation: failed to determine image file size: %w", err)
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("conversation: failed to reset image file reader: %w", err)
	}

	if size > maxMessageImageSizeBytes {
		return ErrInvalidMessageImageFileSize
	}

	return nil
}

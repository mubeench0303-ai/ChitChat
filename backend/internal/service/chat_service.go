package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
)

const maxDailyAIMessagesPerUser = 15

const (
	maxMessageContentLength        = 2000
	maxMessageImageSizeBytes       = 5 << 20
	maxMessageVoiceSizeBytes       = 10 << 20
	maxMessageVoiceDurationSeconds = 300
	maxMessageVideoSizeBytes       = 100 << 20
	maxMessageVideoDurationSeconds = 60
	messageImageUploadFolder       = "chitchat/messages"
	messageVoiceUploadFolder       = "chitchat/voice-messages"
	messageVideoUploadFolder       = "chitchat/videos"
	editWindowDuration       = 10 * time.Minute
	unsendWindowDuration     = 1 * time.Hour
	unsentMessagePlaceholder = "This message was unsent"
	defaultMessageListLimit  = 50
	maxPinnedChats           = 3
)

func (s *ConversationService) GetConversationHeaderInfo(
	ctx context.Context,
	userID, conversationID uuid.UUID,
) (*models.ConversationHeaderInfo, error) {
	info, err := s.conversations.GetConversationHeaderInfo(ctx, conversationID, userID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrConversationNotFound
	}
	if errors.Is(err, repository.ErrForbidden) {
		return nil, ErrNotAuthorized
	}
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to get header info: %w", err)
	}

	if info.Type == models.ConversationTypeDirect && info.ParticipantID != nil {
		participantID, parseErr := uuid.Parse(*info.ParticipantID)
		if parseErr != nil {
			return nil, fmt.Errorf("conversation: invalid participant id: %w", parseErr)
		}

		avatarURL := info.ParticipantAvatarURL
		isOnline := info.ParticipantIsOnline
		lastSeen := info.ParticipantLastSeen
		if privacyErr := s.applyDirectParticipantPrivacy(
			ctx,
			userID,
			participantID,
			&avatarURL,
			&isOnline,
			&lastSeen,
		); privacyErr != nil {
			return nil, privacyErr
		}

		info.ParticipantAvatarURL = avatarURL
		info.ParticipantIsOnline = isOnline
		info.ParticipantLastSeen = lastSeen
	}

	return info, nil
}

func (s *ConversationService) applyDirectParticipantPrivacy(
	ctx context.Context,
	viewerID, targetID uuid.UUID,
	avatarURL **string,
	isOnline **bool,
	lastSeen **time.Time,
) error {
	if s.privacy == nil {
		return nil
	}

	canViewPhoto, err := s.privacy.CanView(ctx, viewerID, targetID, models.PrivacyFieldProfilePhoto)
	if err != nil {
		return fmt.Errorf("conversation: failed to check profile photo privacy: %w", err)
	}
	if !canViewPhoto && avatarURL != nil {
		*avatarURL = nil
	}

	canViewPresence, err := s.privacy.CanView(ctx, viewerID, targetID, models.PrivacyFieldLastSeenAndOnline)
	if err != nil {
		return fmt.Errorf("conversation: failed to check presence privacy: %w", err)
	}
	if !canViewPresence {
		if isOnline != nil {
			*isOnline = nil
		}
		if lastSeen != nil {
			*lastSeen = nil
		}
	}

	return nil
}

func (s *ConversationService) GetFriends(
	ctx context.Context,
	userID uuid.UUID,
) ([]models.FriendResponse, error) {
	friends, err := s.conversations.GetFriends(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to list friends: %w", err)
	}

	if friends == nil {
		friends = []models.FriendResponse{}
	}

	for i := range friends {
		targetID, parseErr := uuid.Parse(friends[i].ID)
		if parseErr != nil {
			continue
		}

		avatarURL := friends[i].AvatarURL
		isOnline := friends[i].IsOnline
		if privacyErr := s.applyDirectParticipantPrivacy(
			ctx,
			userID,
			targetID,
			&avatarURL,
			&isOnline,
			nil,
		); privacyErr != nil {
			return nil, privacyErr
		}

		friends[i].AvatarURL = avatarURL
		friends[i].IsOnline = isOnline
	}

	return friends, nil
}

func (s *ConversationService) ClearChat(
	ctx context.Context,
	actingUserID, conversationID uuid.UUID,
) error {
	isParticipant, err := s.conversations.IsParticipant(ctx, conversationID, actingUserID)
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

	if conversation.Type != models.ConversationTypeDirect {
		return ErrNotAuthorized
	}

	if err := s.conversations.ClearChatForUser(ctx, conversationID, actingUserID); err != nil {
		return fmt.Errorf("conversation: failed to clear chat: %w", err)
	}

	return nil
}

func (s *ConversationService) PinChat(
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

	alreadyPinned, err := s.conversations.IsConversationPinned(ctx, userID, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrNotAuthorized
	}
	if err != nil {
		return fmt.Errorf("conversation: failed to check pin state: %w", err)
	}

	if !alreadyPinned {
		count, err := s.conversations.GetPinnedCount(ctx, userID)
		if err != nil {
			return fmt.Errorf("conversation: failed to count pinned chats: %w", err)
		}
		if count >= maxPinnedChats {
			return ErrPinLimitReached
		}
	}

	if err := s.conversations.PinConversation(ctx, userID, conversationID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotAuthorized
		}
		return fmt.Errorf("conversation: failed to pin chat: %w", err)
	}

	return nil
}

func (s *ConversationService) UnpinChat(
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

	if err := s.conversations.UnpinConversation(ctx, userID, conversationID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotAuthorized
		}
		return fmt.Errorf("conversation: failed to unpin chat: %w", err)
	}

	return nil
}

func (s *ConversationService) MuteChat(
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

	if err := s.conversations.MuteConversation(ctx, userID, conversationID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotAuthorized
		}
		return fmt.Errorf("conversation: failed to mute chat: %w", err)
	}

	return nil
}

func (s *ConversationService) UnmuteChat(
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

	if err := s.conversations.UnmuteConversation(ctx, userID, conversationID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotAuthorized
		}
		return fmt.Errorf("conversation: failed to unmute chat: %w", err)
	}

	return nil
}

func (s *ConversationService) SetBackground(
	ctx context.Context,
	userID, conversationID uuid.UUID,
	backgroundType, backgroundValue string,
) error {
	isParticipant, err := s.conversations.IsParticipant(ctx, conversationID, userID)
	if err != nil {
		return fmt.Errorf("conversation: failed to check participant: %w", err)
	}
	if !isParticipant {
		return ErrNotAuthorized
	}

	backgroundType = strings.TrimSpace(backgroundType)
	backgroundValue = strings.TrimSpace(backgroundValue)

	switch backgroundType {
	case BackgroundTypePreset:
		if _, ok := allowedBackgroundPresets[backgroundValue]; !ok {
			return ErrInvalidBackgroundPreset
		}
	case BackgroundTypeCustom:
		if backgroundValue == "" {
			return ErrInvalidBackgroundValue
		}
	default:
		return ErrInvalidBackgroundType
	}

	var valuePtr *string
	if backgroundValue != "" {
		valuePtr = &backgroundValue
	}

	if err := s.conversations.SetConversationBackground(
		ctx,
		userID,
		conversationID,
		backgroundType,
		valuePtr,
	); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotAuthorized
		}
		return fmt.Errorf("conversation: failed to set background: %w", err)
	}

	return nil
}

func (s *ConversationService) ResetBackground(
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

	if err := s.conversations.ResetConversationBackground(ctx, userID, conversationID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotAuthorized
		}
		return fmt.Errorf("conversation: failed to reset background: %w", err)
	}

	return nil
}

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

		if conversations[i].Type != models.ConversationTypeDirect {
			continue
		}

		targetID, parseErr := uuid.Parse(conversations[i].RequesterID)
		if parseErr != nil {
			continue
		}

		avatarURL := conversations[i].RequesterAvatarURL
		isOnline := conversations[i].RequesterIsOnline
		lastSeen := conversations[i].RequesterLastSeen
		if privacyErr := s.applyDirectParticipantPrivacy(
			ctx,
			userID,
			targetID,
			&avatarURL,
			&isOnline,
			&lastSeen,
		); privacyErr != nil {
			return nil, privacyErr
		}

		conversations[i].RequesterAvatarURL = avatarURL
		conversations[i].RequesterIsOnline = isOnline
		conversations[i].RequesterLastSeen = lastSeen
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

	if err := s.ensureConversationNotPending(ctx, conversationID); err != nil {
		return err
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

	conversationID, err := uuid.Parse(message.ConversationID)
	if err != nil {
		return nil, fmt.Errorf("conversation: invalid conversation id on message: %w", err)
	}

	if err := s.ensureConversationNotPending(ctx, conversationID); err != nil {
		return nil, err
	}

	if message.Type == models.MessageTypeImage ||
		message.Type == models.MessageTypeVoice ||
		message.Type == models.MessageTypeVideo ||
		message.ImageURL != nil ||
		message.AudioURL != nil ||
		message.VideoURL != nil {
		return nil, ErrMessageNotEditable
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

	conversationID, err := uuid.Parse(message.ConversationID)
	if err != nil {
		return fmt.Errorf("conversation: invalid conversation id on message: %w", err)
	}

	if err := s.ensureConversationNotPending(ctx, conversationID); err != nil {
		return err
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

	if message.AudioURL != nil && strings.TrimSpace(*message.AudioURL) != "" {
		if s.cloudinary == nil {
			return fmt.Errorf("conversation: voice delete is not configured")
		}

		if err := s.cloudinary.DeleteVideo(ctx, *message.AudioURL); err != nil {
			return fmt.Errorf("conversation: failed to delete message voice: %w", err)
		}
	}

	if message.VideoURL != nil && strings.TrimSpace(*message.VideoURL) != "" {
		if s.cloudinary == nil {
			return fmt.Errorf("conversation: video delete is not configured")
		}

		if err := s.cloudinary.DeleteVideo(ctx, *message.VideoURL); err != nil {
			return fmt.Errorf("conversation: failed to delete message video: %w", err)
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
	replyToStatusID *uuid.UUID,
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

		if err := s.ensureAIDailyMessageLimit(ctx, userID, otherUser); err != nil {
			return nil, err
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
	if replyToMessageID != nil && replyToStatusID != nil {
		return nil, ErrInvalidReplyTarget
	}

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

	var replyStatusTarget *models.Status
	if replyToStatusID != nil {
		if s.statuses == nil {
			return nil, ErrInvalidStatusReplyTarget
		}

		replyStatusTarget, err = s.statuses.GetStatusByID(ctx, *replyToStatusID)
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrInvalidStatusReplyTarget
		}
		if err != nil {
			return nil, fmt.Errorf("conversation: failed to get status reply target: %w", err)
		}

		statusOwnerID, parseErr := uuid.Parse(replyStatusTarget.UserID)
		if parseErr != nil {
			return nil, ErrInvalidStatusReplyTarget
		}

		isOwnerParticipant, participantErr := s.conversations.IsParticipant(
			ctx,
			conversationID,
			statusOwnerID,
		)
		if participantErr != nil {
			return nil, fmt.Errorf("conversation: failed to check status owner participant: %w", participantErr)
		}
		if !isOwnerParticipant {
			return nil, ErrInvalidStatusReplyTarget
		}

		if conversation.Type == models.ConversationTypeDirect {
			otherUserID, otherErr := s.conversations.GetOtherParticipantID(ctx, conversationID, userID)
			if otherErr != nil {
				return nil, fmt.Errorf("conversation: failed to resolve other participant: %w", otherErr)
			}
			if statusOwnerID != otherUserID {
				return nil, ErrInvalidStatusReplyTarget
			}
		}
	}

	message, err := s.conversations.CreateMessage(
		ctx,
		conversationID,
		userID,
		trimmedContent,
		replyToMessageID,
		replyToStatusID,
		imageURL,
	)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to create message: %w", err)
	}

	if replyTarget != nil {
		scrubMessage(replyTarget)
		message.ReplyTo = messageToReplyTo(replyTarget)
	}

	if replyStatusTarget != nil {
		message.ReplyToStatus = &models.MessageReplyToStatus{
			ID:                   replyStatusTarget.ID,
			OwnerID:              replyStatusTarget.UserID,
			Type:                 replyStatusTarget.Type,
			Content:              replyStatusTarget.Content,
			ImageURL:             replyStatusTarget.ImageURL,
			VideoURL:             replyStatusTarget.VideoURL,
			VideoDurationSeconds: replyStatusTarget.VideoDurationSeconds,
			BackgroundColor:      replyStatusTarget.BackgroundColor,
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

	s.maybeTriggerAssistantReply(ctx, userID, conversationID, conversation)

	return message, nil
}

func (s *ConversationService) SendVoiceMessage(
	ctx context.Context,
	userID, conversationID uuid.UUID,
	replyToMessageID *uuid.UUID,
	replyToStatusID *uuid.UUID,
	audioFile multipart.File,
	audioFilename string,
	clientDurationSeconds int,
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

		if err := s.ensureAIDailyMessageLimit(ctx, userID, otherUser); err != nil {
			return nil, err
		}
	}

	if err := validateMessageVoiceFile(audioFile); err != nil {
		return nil, err
	}

	if s.cloudinary == nil {
		return nil, fmt.Errorf("conversation: voice upload is not configured")
	}

	uploadResult, err := s.cloudinary.UploadVideo(
		ctx,
		audioFile,
		audioFilename,
		messageVoiceUploadFolder,
	)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to upload voice message: %w", err)
	}

	durationSeconds := clientDurationSeconds
	if uploadResult.Duration > 0 {
		durationSeconds = int(math.Round(uploadResult.Duration))
	}

	if durationSeconds <= 0 {
		return nil, ErrInvalidMessageVoiceContentType
	}

	if durationSeconds > maxMessageVoiceDurationSeconds {
		return nil, ErrMessageVoiceTooLong
	}

	if replyToMessageID != nil && replyToStatusID != nil {
		return nil, ErrInvalidReplyTarget
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

	var replyStatusTarget *models.Status
	if replyToStatusID != nil {
		if s.statuses == nil {
			return nil, ErrInvalidStatusReplyTarget
		}

		replyStatusTarget, err = s.statuses.GetStatusByID(ctx, *replyToStatusID)
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrInvalidStatusReplyTarget
		}
		if err != nil {
			return nil, fmt.Errorf("conversation: failed to get status reply target: %w", err)
		}

		statusOwnerID, parseErr := uuid.Parse(replyStatusTarget.UserID)
		if parseErr != nil {
			return nil, ErrInvalidStatusReplyTarget
		}

		isOwnerParticipant, participantErr := s.conversations.IsParticipant(
			ctx,
			conversationID,
			statusOwnerID,
		)
		if participantErr != nil {
			return nil, fmt.Errorf("conversation: failed to check status owner participant: %w", participantErr)
		}
		if !isOwnerParticipant {
			return nil, ErrInvalidStatusReplyTarget
		}

		if conversation.Type == models.ConversationTypeDirect {
			otherUserID, otherErr := s.conversations.GetOtherParticipantID(ctx, conversationID, userID)
			if otherErr != nil {
				return nil, fmt.Errorf("conversation: failed to resolve other participant: %w", otherErr)
			}
			if statusOwnerID != otherUserID {
				return nil, ErrInvalidStatusReplyTarget
			}
		}
	}

	message, err := s.conversations.CreateVoiceMessage(
		ctx,
		conversationID,
		userID,
		replyToMessageID,
		replyToStatusID,
		uploadResult.SecureURL,
		durationSeconds,
	)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to create voice message: %w", err)
	}

	if replyTarget != nil {
		scrubMessage(replyTarget)
		message.ReplyTo = messageToReplyTo(replyTarget)
	}

	if replyStatusTarget != nil {
		message.ReplyToStatus = &models.MessageReplyToStatus{
			ID:                   replyStatusTarget.ID,
			OwnerID:              replyStatusTarget.UserID,
			Type:                 replyStatusTarget.Type,
			Content:              replyStatusTarget.Content,
			ImageURL:             replyStatusTarget.ImageURL,
			VideoURL:             replyStatusTarget.VideoURL,
			VideoDurationSeconds: replyStatusTarget.VideoDurationSeconds,
			BackgroundColor:      replyStatusTarget.BackgroundColor,
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

	s.maybeTriggerAssistantReply(ctx, userID, conversationID, conversation)

	return message, nil
}

func (s *ConversationService) SendVideoMessage(
	ctx context.Context,
	userID, conversationID uuid.UUID,
	replyToMessageID *uuid.UUID,
	replyToStatusID *uuid.UUID,
	videoFile multipart.File,
	videoFilename string,
	clientDurationSeconds int,
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

		if err := s.ensureAIDailyMessageLimit(ctx, userID, otherUser); err != nil {
			return nil, err
		}
	}

	if err := validateMessageVideoFile(videoFile); err != nil {
		return nil, err
	}

	if s.cloudinary == nil {
		return nil, fmt.Errorf("conversation: video upload is not configured")
	}

	uploadResult, err := s.cloudinary.UploadVideo(
		ctx,
		videoFile,
		videoFilename,
		messageVideoUploadFolder,
	)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to upload video message: %w", err)
	}

	durationSeconds := clientDurationSeconds
	if uploadResult.Duration > 0 {
		durationSeconds = int(math.Round(uploadResult.Duration))
	}

	if durationSeconds <= 0 {
		return nil, ErrInvalidMessageVideoContentType
	}

	if durationSeconds > maxMessageVideoDurationSeconds {
		return nil, ErrMessageVideoTooLong
	}

	if replyToMessageID != nil && replyToStatusID != nil {
		return nil, ErrInvalidReplyTarget
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

	var replyStatusTarget *models.Status
	if replyToStatusID != nil {
		if s.statuses == nil {
			return nil, ErrInvalidStatusReplyTarget
		}

		replyStatusTarget, err = s.statuses.GetStatusByID(ctx, *replyToStatusID)
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrInvalidStatusReplyTarget
		}
		if err != nil {
			return nil, fmt.Errorf("conversation: failed to get status reply target: %w", err)
		}

		statusOwnerID, parseErr := uuid.Parse(replyStatusTarget.UserID)
		if parseErr != nil {
			return nil, ErrInvalidStatusReplyTarget
		}

		isOwnerParticipant, participantErr := s.conversations.IsParticipant(
			ctx,
			conversationID,
			statusOwnerID,
		)
		if participantErr != nil {
			return nil, fmt.Errorf("conversation: failed to check status owner participant: %w", participantErr)
		}
		if !isOwnerParticipant {
			return nil, ErrInvalidStatusReplyTarget
		}

		if conversation.Type == models.ConversationTypeDirect {
			otherUserID, otherErr := s.conversations.GetOtherParticipantID(ctx, conversationID, userID)
			if otherErr != nil {
				return nil, fmt.Errorf("conversation: failed to resolve other participant: %w", otherErr)
			}
			if statusOwnerID != otherUserID {
				return nil, ErrInvalidStatusReplyTarget
			}
		}
	}

	message, err := s.conversations.CreateVideoMessage(
		ctx,
		conversationID,
		userID,
		replyToMessageID,
		replyToStatusID,
		uploadResult.SecureURL,
		durationSeconds,
	)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to create video message: %w", err)
	}

	if replyTarget != nil {
		scrubMessage(replyTarget)
		message.ReplyTo = messageToReplyTo(replyTarget)
	}

	if replyStatusTarget != nil {
		message.ReplyToStatus = &models.MessageReplyToStatus{
			ID:                   replyStatusTarget.ID,
			OwnerID:              replyStatusTarget.UserID,
			Type:                 replyStatusTarget.Type,
			Content:              replyStatusTarget.Content,
			ImageURL:             replyStatusTarget.ImageURL,
			VideoURL:             replyStatusTarget.VideoURL,
			VideoDurationSeconds: replyStatusTarget.VideoDurationSeconds,
			BackgroundColor:      replyStatusTarget.BackgroundColor,
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

	s.maybeTriggerAssistantReply(ctx, userID, conversationID, conversation)

	return message, nil
}

func messageToReplyTo(message *models.Message) *models.MessageReplyTo {
	if message == nil {
		return nil
	}

	return &models.MessageReplyTo{
		ID:       message.ID,
		SenderID: message.SenderID,
		Type:     message.Type,
		Content:  message.Content,
		ImageURL: message.ImageURL,
		AudioURL: message.AudioURL,
		VideoURL: message.VideoURL,
		IsUnsent: message.IsUnsent,
	}
}

func scrubMessage(message *models.Message) {
	if message.IsUnsent {
		message.Content = unsentMessagePlaceholder
		message.ImageURL = nil
		message.AudioURL = nil
		message.AudioDurationSeconds = nil
		message.VideoURL = nil
		message.VideoDurationSeconds = nil
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
		"type":           message.Type,
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
	if message.ReplyToStatusID != nil {
		payload["replyToStatusId"] = *message.ReplyToStatusID
	}
	if message.ImageURL != nil {
		payload["imageUrl"] = *message.ImageURL
	}
	if message.AudioURL != nil {
		payload["audioUrl"] = *message.AudioURL
	}
	if message.AudioDurationSeconds != nil {
		payload["audioDurationSeconds"] = *message.AudioDurationSeconds
	}
	if message.VideoURL != nil {
		payload["videoUrl"] = *message.VideoURL
	}
	if message.VideoDurationSeconds != nil {
		payload["videoDurationSeconds"] = *message.VideoDurationSeconds
	}
	if message.ReplyTo != nil {
		replyToPayload := map[string]interface{}{
			"id":       message.ReplyTo.ID,
			"senderId": message.ReplyTo.SenderID,
			"content":  message.ReplyTo.Content,
			"isUnsent": message.ReplyTo.IsUnsent,
		}
		if message.ReplyTo.Type != "" {
			replyToPayload["type"] = message.ReplyTo.Type
		}
		if message.ReplyTo.ImageURL != nil {
			replyToPayload["imageUrl"] = *message.ReplyTo.ImageURL
		}
		if message.ReplyTo.AudioURL != nil {
			replyToPayload["audioUrl"] = *message.ReplyTo.AudioURL
		}
		if message.ReplyTo.VideoURL != nil {
			replyToPayload["videoUrl"] = *message.ReplyTo.VideoURL
		}
		payload["replyTo"] = replyToPayload
	}
	if message.ReplyToStatus != nil {
		replyToStatusPayload := map[string]interface{}{
			"id":              message.ReplyToStatus.ID,
			"ownerId":         message.ReplyToStatus.OwnerID,
			"type":            message.ReplyToStatus.Type,
			"content":         message.ReplyToStatus.Content,
			"imageUrl":        message.ReplyToStatus.ImageURL,
			"videoUrl":        message.ReplyToStatus.VideoURL,
			"backgroundColor": message.ReplyToStatus.BackgroundColor,
		}
		if message.ReplyToStatus.VideoDurationSeconds != nil {
			replyToStatusPayload["videoDurationSeconds"] = *message.ReplyToStatus.VideoDurationSeconds
		}
		payload["replyToStatus"] = replyToStatusPayload
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

func validateMessageVoiceFile(file multipart.File) error {
	header := make([]byte, 512)
	n, err := file.Read(header)
	if err != nil && !errors.Is(err, io.EOF) {
		return fmt.Errorf("conversation: failed to read voice file: %w", err)
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("conversation: failed to reset voice file reader: %w", err)
	}

	contentType := http.DetectContentType(header[:n])
	if !isAllowedVoiceContentType(contentType) {
		return ErrInvalidMessageVoiceContentType
	}

	size, err := file.Seek(0, io.SeekEnd)
	if err != nil {
		return fmt.Errorf("conversation: failed to determine voice file size: %w", err)
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("conversation: failed to reset voice file reader: %w", err)
	}

	if size > maxMessageVoiceSizeBytes {
		return ErrInvalidMessageVoiceFileSize
	}

	return nil
}

func isAllowedVoiceContentType(contentType string) bool {
	contentType = strings.ToLower(strings.TrimSpace(contentType))

	switch contentType {
	case "application/ogg", "video/webm", "audio/webm", "audio/ogg", "audio/mpeg",
		"audio/mp4", "audio/wav", "audio/x-wav", "audio/aac", "audio/mp3":
		return true
	}

	return strings.HasPrefix(contentType, "audio/")
}

func validateMessageVideoFile(file multipart.File) error {
	header := make([]byte, 512)
	n, err := file.Read(header)
	if err != nil && !errors.Is(err, io.EOF) {
		return fmt.Errorf("conversation: failed to read video file: %w", err)
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("conversation: failed to reset video file reader: %w", err)
	}

	contentType := http.DetectContentType(header[:n])
	if !isAllowedVideoContentType(contentType) {
		return ErrInvalidMessageVideoContentType
	}

	size, err := file.Seek(0, io.SeekEnd)
	if err != nil {
		return fmt.Errorf("conversation: failed to determine video file size: %w", err)
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("conversation: failed to reset video file reader: %w", err)
	}

	if size > maxMessageVideoSizeBytes {
		return ErrInvalidMessageVideoFileSize
	}

	return nil
}

func isAllowedVideoContentType(contentType string) bool {
	contentType = strings.ToLower(strings.TrimSpace(contentType))

	switch contentType {
	case "video/mp4", "video/webm", "video/quicktime":
		return true
	}

	return strings.HasPrefix(contentType, "video/")
}

func (s *ConversationService) ensureAIDailyMessageLimit(
	ctx context.Context,
	userID uuid.UUID,
	otherUser *models.User,
) error {
	if otherUser == nil || !otherUser.IsSystem {
		return nil
	}

	count, err := s.conversations.CountTodaysMessagesToAI(ctx, userID)
	if err != nil {
		return fmt.Errorf("conversation: failed to count today's AI messages: %w", err)
	}

	if count >= maxDailyAIMessagesPerUser {
		return ErrAIDailyMessageLimitReached
	}

	return nil
}

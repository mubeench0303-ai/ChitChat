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
	"github.com/mubeench0303-ai/ChitChat/backend/pkg/cloudinary"
)

const (
	maxMessageContentLength   = 2000
	maxMessageImageSizeBytes  = 5 << 20
	messageImageUploadFolder  = "chitchat/messages"
	groupImageUploadFolder    = "chitchat/groups"
	maxGroupNameLength        = 100
	maxPendingRequestMessages = 3
	defaultMessageListLimit   = 50
	editWindowDuration        = 10 * time.Minute
	unsendWindowDuration      = 1 * time.Hour
	unsentMessagePlaceholder  = "This message was unsent"
)

var (
	ErrCannotMessageSelf      = errors.New("you cannot send a message request to yourself")
	ErrConversationBlocked    = errors.New("this conversation is blocked")
	ErrRequestLimitReached    = errors.New("request message limit reached")
	ErrInvalidMessageContent  = errors.New("message content is required")
	ErrMessageContentOrImageRequired = errors.New("message must include content or an image")
	ErrInvalidMessageImageFileSize   = errors.New("image must be at most 5MB")
	ErrInvalidMessageImageContentType = errors.New("image must be a JPEG, PNG, or WebP image")
	ErrMessageTooLong         = errors.New("message must be at most 2000 characters")
	ErrConversationNotFound   = errors.New("conversation not found")
	ErrNotAuthorizedToRespond = errors.New("not authorized to respond to this request")
	ErrNotAuthorized          = errors.New("not authorized")
	ErrNotBlockInitiator      = errors.New("not authorized to unblock this user")
	ErrConversationNotAccepted = errors.New("conversation is not accepted")
	ErrMessageNotFound         = errors.New("message not found")
	ErrNotMessageSender        = errors.New("not your message")
	ErrEditWindowExpired       = errors.New("edit window expired")
	ErrUnsendWindowExpired     = errors.New("unsend window expired")
	ErrInvalidReplyTarget      = errors.New("reply target not in this conversation")
	ErrInvalidReactionEmoji    = errors.New("invalid reaction emoji")
	ErrInvalidGroupName      = errors.New("group name is required")
	ErrGroupNameTooLong      = errors.New("group name must be at most 100 characters")
	ErrGroupMembersRequired  = errors.New("group must include at least one other member")
	ErrGroupMemberNotFound   = errors.New("one or more selected members were not found")
	ErrGroupNotFound         = errors.New("group not found")
	ErrNotGroupAdmin         = errors.New("not authorized as group admin")
	ErrNotGroupMember        = errors.New("not a group member")
	ErrInvalidGroupMemberRole = errors.New("role must be admin or member")
	ErrGroupAddMembersRequired = errors.New("at least one member id is required")
	ErrUseLeaveGroupInstead     = errors.New("use leave group to remove yourself")
	ErrWouldLeaveZeroAdmins     = errors.New("group must have at least one admin")
	ErrRecipientNoLongerExists  = errors.New("recipient no longer exists")
)

var allowedReactionEmojis = map[string]struct{}{
	"❤️": {},
	"👍": {},
	"😂": {},
	"😮": {},
	"😢": {},
	"😡": {},
}

type ConversationService struct {
	users         *repository.UserRepository
	conversations *repository.ConversationRepository
	notifications NotificationService
	cloudinary    *cloudinary.Client
}

func NewConversationService(
	users *repository.UserRepository,
	conversations *repository.ConversationRepository,
	notifications NotificationService,
	cloudinaryClient *cloudinary.Client,
) *ConversationService {
	return &ConversationService{
		users:         users,
		conversations: conversations,
		notifications: notifications,
		cloudinary:    cloudinaryClient,
	}
}

func (s *ConversationService) SendMessageRequest(
	ctx context.Context,
	senderID uuid.UUID,
	targetUsername, content string,
) (*models.Message, error) {
	trimmedUsername := strings.TrimSpace(targetUsername)
	trimmedContent := strings.TrimSpace(content)

	targetUser, err := s.users.GetPublicProfileByUsername(ctx, trimmedUsername)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrPublicProfileNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to look up target user: %w", err)
	}

	if targetUser.IsDeleted {
		return nil, ErrPublicProfileNotFound
	}

	targetID, err := uuid.Parse(targetUser.ID)
	if err != nil {
		return nil, fmt.Errorf("conversation: invalid target user id: %w", err)
	}

	if senderID == targetID {
		return nil, ErrCannotMessageSelf
	}

	if err := validateMessageContent(trimmedContent); err != nil {
		return nil, err
	}

	conversation, err := s.conversations.FindBetweenUsers(ctx, senderID, targetID)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to find conversation: %w", err)
	}

	if conversation == nil {
		conversation, err = s.conversations.Create(ctx, senderID, targetID, senderID)
		if err != nil {
			return nil, fmt.Errorf("conversation: failed to create conversation: %w", err)
		}
	}

	switch conversationStatus(conversation) {
	case models.ConversationStatusBlocked:
		return nil, ErrConversationBlocked
	case models.ConversationStatusPending:
		if conversationRequestedBy(conversation) == senderID.String() {
			conversationUUID, err := uuid.Parse(conversation.ID)
			if err != nil {
				return nil, fmt.Errorf("conversation: invalid conversation id: %w", err)
			}

			count, err := s.conversations.CountMessagesBySender(ctx, conversationUUID, senderID)
			if err != nil {
				return nil, fmt.Errorf("conversation: failed to count messages: %w", err)
			}
			if count >= maxPendingRequestMessages {
				return nil, ErrRequestLimitReached
			}
		}
	case models.ConversationStatusAccepted:
		// No limit once the conversation is accepted.
	default:
		return nil, fmt.Errorf("conversation: unsupported conversation status %q", conversationStatus(conversation))
	}

	conversationUUID, err := uuid.Parse(conversation.ID)
	if err != nil {
		return nil, fmt.Errorf("conversation: invalid conversation id: %w", err)
	}

	message, err := s.conversations.CreateMessage(ctx, conversationUUID, senderID, trimmedContent, nil, nil)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to create message: %w", err)
	}

	return message, nil
}

func (s *ConversationService) GetIncomingRequests(
	ctx context.Context,
	userID uuid.UUID,
) ([]models.ConversationWithPreview, error) {
	requests, err := s.conversations.ListIncomingRequests(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to list incoming requests: %w", err)
	}

	results := make([]models.ConversationWithPreview, 0, len(requests))
	for _, request := range requests {
		latestContent := request.LatestMessageContent
		if request.LatestMessageIsUnsent {
			latestContent = unsentMessagePlaceholder
		}

		results = append(results, models.ConversationWithPreview{
			ConversationID:       request.ConversationID,
			Type:                 models.ConversationTypeDirect,
			RequesterID:          request.RequesterID,
			RequesterFullName:    request.RequesterFullName,
			RequesterUsername:    request.RequesterUsername,
			RequesterAvatarURL:   request.RequesterAvatarURL,
			LatestMessageContent: latestContent,
			LatestMessageAt:      request.LatestMessageAt,
			RequestedAt:          request.RequestedAt,
		})
	}

	return results, nil
}

func (s *ConversationService) AcceptRequest(
	ctx context.Context,
	userID, conversationID uuid.UUID,
) error {
	conversation, err := s.conversations.GetByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrConversationNotFound
	}
	if err != nil {
		return fmt.Errorf("conversation: failed to fetch conversation: %w", err)
	}

	if !canRespondToIncomingRequest(ctx, s.conversations, conversation, userID) {
		return ErrNotAuthorizedToRespond
	}

	if err := s.conversations.UpdateStatus(ctx, conversationID, models.ConversationStatusAccepted); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrConversationNotFound
		}
		return fmt.Errorf("conversation: failed to accept request: %w", err)
	}

	return nil
}

func (s *ConversationService) RejectRequest(
	ctx context.Context,
	userID, conversationID uuid.UUID,
) error {
	conversation, err := s.conversations.GetByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrConversationNotFound
	}
	if err != nil {
		return fmt.Errorf("conversation: failed to fetch conversation: %w", err)
	}

	if !canRespondToIncomingRequest(ctx, s.conversations, conversation, userID) {
		return ErrNotAuthorizedToRespond
	}

	if err := s.conversations.DeleteConversation(ctx, conversationID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrConversationNotFound
		}
		return fmt.Errorf("conversation: failed to reject request: %w", err)
	}

	return nil
}

func (s *ConversationService) BlockRequest(
	ctx context.Context,
	userID, conversationID uuid.UUID,
) error {
	conversation, err := s.conversations.GetByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrConversationNotFound
	}
	if err != nil {
		return fmt.Errorf("conversation: failed to fetch conversation: %w", err)
	}

	if !canRespondToIncomingRequest(ctx, s.conversations, conversation, userID) {
		return ErrNotAuthorizedToRespond
	}

	if err := s.conversations.BlockConversation(ctx, conversationID, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrConversationNotFound
		}
		return fmt.Errorf("conversation: failed to block request: %w", err)
	}

	return nil
}

func conversationStatus(conversation *models.Conversation) string {
	if conversation.Status == nil {
		return ""
	}

	return *conversation.Status
}

func conversationRequestedBy(conversation *models.Conversation) string {
	if conversation.RequestedBy == nil {
		return ""
	}

	return *conversation.RequestedBy
}

func canRespondToIncomingRequest(
	ctx context.Context,
	conversations *repository.ConversationRepository,
	conversation *models.Conversation,
	userID uuid.UUID,
) bool {
	conversationID, err := uuid.Parse(conversation.ID)
	if err != nil {
		return false
	}

	isParticipant, err := conversations.IsParticipant(ctx, conversationID, userID)
	if err != nil || !isParticipant {
		return false
	}

	isRecipient := conversationRequestedBy(conversation) != userID.String()
	isPending := conversationStatus(conversation) == models.ConversationStatusPending

	return isRecipient && isPending
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
	}

	return conversations, nil
}

func (s *ConversationService) RemoveConnection(
	ctx context.Context,
	userID, conversationID uuid.UUID,
) error {
	conversation, err := s.conversations.GetByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrConversationNotFound
	}
	if err != nil {
		return fmt.Errorf("conversation: failed to fetch conversation: %w", err)
	}

	if !canManageAcceptedConversation(ctx, s.conversations, conversation, userID) {
		return ErrNotAuthorized
	}

	if err := s.conversations.DeleteConversation(ctx, conversationID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrConversationNotFound
		}
		return fmt.Errorf("conversation: failed to remove connection: %w", err)
	}

	return nil
}

func (s *ConversationService) BlockConnection(
	ctx context.Context,
	userID, conversationID uuid.UUID,
) error {
	conversation, err := s.conversations.GetByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrConversationNotFound
	}
	if err != nil {
		return fmt.Errorf("conversation: failed to fetch conversation: %w", err)
	}

	if !canManageAcceptedConversation(ctx, s.conversations, conversation, userID) {
		return ErrNotAuthorized
	}

	if err := s.conversations.BlockConversation(ctx, conversationID, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrConversationNotFound
		}
		return fmt.Errorf("conversation: failed to block connection: %w", err)
	}

	return nil
}

func (s *ConversationService) GetBlockedUsers(
	ctx context.Context,
	userID uuid.UUID,
) ([]models.BlockedUser, error) {
	blocked, err := s.conversations.GetBlockedConversations(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to list blocked users: %w", err)
	}

	return blocked, nil
}

func (s *ConversationService) UnblockUser(
	ctx context.Context,
	actingUserID, conversationID uuid.UUID,
) error {
	conversation, err := s.conversations.GetByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrConversationNotFound
	}
	if err != nil {
		return fmt.Errorf("conversation: failed to fetch conversation: %w", err)
	}

	if conversationStatus(conversation) != models.ConversationStatusBlocked {
		return ErrConversationNotFound
	}

	if conversation.BlockedBy == nil || *conversation.BlockedBy != actingUserID.String() {
		return ErrNotBlockInitiator
	}

	if err := s.conversations.UnblockConversation(ctx, conversationID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrConversationNotFound
		}
		return fmt.Errorf("conversation: failed to unblock user: %w", err)
	}

	return nil
}

func canManageAcceptedConversation(
	ctx context.Context,
	conversations *repository.ConversationRepository,
	conversation *models.Conversation,
	userID uuid.UUID,
) bool {
	conversationID, err := uuid.Parse(conversation.ID)
	if err != nil {
		return false
	}

	isParticipant, err := conversations.IsParticipant(ctx, conversationID, userID)
	if err != nil || !isParticipant {
		return false
	}

	return conversationStatus(conversation) == models.ConversationStatusAccepted
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

func (s *ConversationService) CreateGroup(
	ctx context.Context,
	creatorID uuid.UUID,
	name string,
	memberIDs []uuid.UUID,
) (*models.Conversation, error) {
	trimmedName := strings.TrimSpace(name)
	if err := validateGroupName(trimmedName); err != nil {
		return nil, err
	}

	if len(memberIDs) < 1 {
		return nil, ErrGroupMembersRequired
	}

	uniqueMemberIDs := make([]uuid.UUID, 0, len(memberIDs))
	seen := make(map[uuid.UUID]struct{}, len(memberIDs))
	for _, memberID := range memberIDs {
		if memberID == creatorID {
			continue
		}
		if _, ok := seen[memberID]; ok {
			continue
		}
		seen[memberID] = struct{}{}

		_, err := s.users.GetUserByID(ctx, memberID.String())
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrGroupMemberNotFound
		}
		if err != nil {
			return nil, fmt.Errorf("conversation: failed to verify member: %w", err)
		}

		uniqueMemberIDs = append(uniqueMemberIDs, memberID)
	}

	if len(uniqueMemberIDs) < 1 {
		return nil, ErrGroupMembersRequired
	}

	group, err := s.conversations.CreateGroup(ctx, trimmedName, nil, creatorID, uniqueMemberIDs)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to create group: %w", err)
	}

	return group, nil
}

func (s *ConversationService) GetGroupInfo(
	ctx context.Context,
	userID, conversationID uuid.UUID,
) (*models.Conversation, []models.GroupMemberDetail, error) {
	isParticipant, err := s.conversations.IsParticipant(ctx, conversationID, userID)
	if err != nil {
		return nil, nil, fmt.Errorf("conversation: failed to check participant: %w", err)
	}
	if !isParticipant {
		return nil, nil, ErrNotAuthorized
	}

	group, err := s.conversations.GetGroupByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, nil, ErrGroupNotFound
	}
	if err != nil {
		return nil, nil, fmt.Errorf("conversation: failed to fetch group: %w", err)
	}

	members, err := s.conversations.ListGroupMembers(ctx, conversationID)
	if err != nil {
		return nil, nil, fmt.Errorf("conversation: failed to list group members: %w", err)
	}

	return group, members, nil
}

func (s *ConversationService) UpdateGroupInfo(
	ctx context.Context,
	userID, conversationID uuid.UUID,
	name string,
	avatarURL *string,
) error {
	isAdmin, err := s.conversations.IsAdmin(ctx, conversationID, userID)
	if err != nil {
		return fmt.Errorf("conversation: failed to check admin role: %w", err)
	}
	if !isAdmin {
		return ErrNotGroupAdmin
	}

	trimmedName := strings.TrimSpace(name)
	if err := validateGroupName(trimmedName); err != nil {
		return err
	}

	group, err := s.conversations.GetGroupByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrGroupNotFound
	}
	if err != nil {
		return fmt.Errorf("conversation: failed to fetch group: %w", err)
	}

	resolvedAvatarURL := group.AvatarURL
	if avatarURL != nil {
		resolvedAvatarURL = avatarURL
	}

	if err := s.conversations.UpdateGroupInfo(ctx, conversationID, trimmedName, resolvedAvatarURL); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrGroupNotFound
		}
		return fmt.Errorf("conversation: failed to update group info: %w", err)
	}

	return nil
}

func (s *ConversationService) UpdateGroupAvatar(
	ctx context.Context,
	userID, conversationID uuid.UUID,
	file multipart.File,
	filename string,
) (*models.Conversation, error) {
	isAdmin, err := s.conversations.IsAdmin(ctx, conversationID, userID)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to check admin role: %w", err)
	}
	if !isAdmin {
		return nil, ErrNotGroupAdmin
	}

	group, err := s.conversations.GetGroupByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to fetch group: %w", err)
	}

	if err := validateMessageImageFile(file); err != nil {
		return nil, err
	}

	if s.cloudinary == nil {
		return nil, fmt.Errorf("conversation: image upload is not configured")
	}

	uploadedURL, err := s.cloudinary.UploadImage(ctx, file, filename, groupImageUploadFolder)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to upload group avatar: %w", err)
	}

	groupName := ""
	if group.Name != nil {
		groupName = *group.Name
	}

	if err := s.conversations.UpdateGroupInfo(ctx, conversationID, groupName, &uploadedURL); err != nil {
		return nil, fmt.Errorf("conversation: failed to update group avatar: %w", err)
	}

	return s.conversations.GetGroupByID(ctx, conversationID)
}

func (s *ConversationService) AddGroupMembers(
	ctx context.Context,
	actorID, conversationID uuid.UUID,
	memberIDs []uuid.UUID,
) error {
	isAdmin, err := s.conversations.IsAdmin(ctx, conversationID, actorID)
	if err != nil {
		return fmt.Errorf("conversation: failed to check admin role: %w", err)
	}
	if !isAdmin {
		return ErrNotGroupAdmin
	}

	if len(memberIDs) < 1 {
		return ErrGroupAddMembersRequired
	}

	uniqueMemberIDs := make([]uuid.UUID, 0, len(memberIDs))
	seen := make(map[uuid.UUID]struct{}, len(memberIDs))
	for _, memberID := range memberIDs {
		if _, ok := seen[memberID]; ok {
			continue
		}
		seen[memberID] = struct{}{}

		_, err := s.users.GetUserByID(ctx, memberID.String())
		if errors.Is(err, repository.ErrNotFound) {
			return ErrGroupMemberNotFound
		}
		if err != nil {
			return fmt.Errorf("conversation: failed to verify member: %w", err)
		}

		uniqueMemberIDs = append(uniqueMemberIDs, memberID)
	}

	if len(uniqueMemberIDs) < 1 {
		return ErrGroupAddMembersRequired
	}

	if err := s.conversations.AddMembers(ctx, conversationID, uniqueMemberIDs); err != nil {
		return fmt.Errorf("conversation: failed to add members: %w", err)
	}

	return nil
}

func (s *ConversationService) RemoveGroupMember(
	ctx context.Context,
	actorID, conversationID, targetUserID uuid.UUID,
) error {
	isAdmin, err := s.conversations.IsAdmin(ctx, conversationID, actorID)
	if err != nil {
		return fmt.Errorf("conversation: failed to check admin role: %w", err)
	}
	if !isAdmin {
		return ErrNotGroupAdmin
	}

	if targetUserID == actorID {
		return ErrUseLeaveGroupInstead
	}

	isTargetMember, err := s.conversations.IsParticipant(ctx, conversationID, targetUserID)
	if err != nil {
		return fmt.Errorf("conversation: failed to check target membership: %w", err)
	}
	if !isTargetMember {
		return ErrNotGroupMember
	}

	if err := s.conversations.RemoveMember(ctx, conversationID, targetUserID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotGroupMember
		}
		return fmt.Errorf("conversation: failed to remove member: %w", err)
	}

	return nil
}

func (s *ConversationService) LeaveGroup(
	ctx context.Context,
	userID, conversationID uuid.UUID,
) error {
	isParticipant, err := s.conversations.IsParticipant(ctx, conversationID, userID)
	if err != nil {
		return fmt.Errorf("conversation: failed to check participant: %w", err)
	}
	if !isParticipant {
		return ErrNotGroupMember
	}

	isAdmin, err := s.conversations.IsAdmin(ctx, conversationID, userID)
	if err != nil {
		return fmt.Errorf("conversation: failed to check admin role: %w", err)
	}

	if isAdmin {
		adminCount, err := s.conversations.CountAdmins(ctx, conversationID)
		if err != nil {
			return fmt.Errorf("conversation: failed to count admins: %w", err)
		}

		if adminCount > 1 {
			if err := s.conversations.RemoveMember(ctx, conversationID, userID); err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					return ErrNotGroupMember
				}
				return fmt.Errorf("conversation: failed to leave group: %w", err)
			}

			return nil
		}

		memberCount, err := s.conversations.CountMembers(ctx, conversationID)
		if err != nil {
			return fmt.Errorf("conversation: failed to count members: %w", err)
		}

		if memberCount <= 1 {
			if err := s.conversations.RemoveMember(ctx, conversationID, userID); err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					return ErrNotGroupMember
				}
				return fmt.Errorf("conversation: failed to leave group: %w", err)
			}

			return nil
		}

		successorID, err := s.conversations.GetOldestMember(ctx, conversationID, userID)
		if err != nil {
			return fmt.Errorf("conversation: failed to find successor admin: %w", err)
		}

		if err := s.conversations.PromoteMemberAndRemoveMember(
			ctx,
			conversationID,
			successorID,
			userID,
		); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return ErrNotGroupMember
			}
			return fmt.Errorf("conversation: failed to transfer admin and leave group: %w", err)
		}

		return nil
	}

	if err := s.conversations.RemoveMember(ctx, conversationID, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotGroupMember
		}
		return fmt.Errorf("conversation: failed to leave group: %w", err)
	}

	return nil
}

func (s *ConversationService) UpdateMemberRole(
	ctx context.Context,
	actorID, conversationID, targetUserID uuid.UUID,
	newRole string,
) error {
	if newRole != models.ConversationMemberRoleAdmin &&
		newRole != models.ConversationMemberRoleMember {
		return ErrInvalidGroupMemberRole
	}

	isAdmin, err := s.conversations.IsAdmin(ctx, conversationID, actorID)
	if err != nil {
		return fmt.Errorf("conversation: failed to check admin role: %w", err)
	}
	if !isAdmin {
		return ErrNotGroupAdmin
	}

	isTargetMember, err := s.conversations.IsParticipant(ctx, conversationID, targetUserID)
	if err != nil {
		return fmt.Errorf("conversation: failed to check target membership: %w", err)
	}
	if !isTargetMember {
		return ErrNotGroupMember
	}

	if newRole == models.ConversationMemberRoleMember {
		targetIsAdmin, err := s.conversations.IsAdmin(ctx, conversationID, targetUserID)
		if err != nil {
			return fmt.Errorf("conversation: failed to check target admin role: %w", err)
		}

		if targetIsAdmin {
			adminCount, err := s.conversations.CountAdmins(ctx, conversationID)
			if err != nil {
				return fmt.Errorf("conversation: failed to count admins: %w", err)
			}

			if adminCount <= 1 {
				return ErrWouldLeaveZeroAdmins
			}
		}
	}

	if err := s.conversations.UpdateMemberRole(ctx, conversationID, targetUserID, newRole); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrNotGroupMember
		}
		return fmt.Errorf("conversation: failed to update member role: %w", err)
	}

	return nil
}

func validateGroupName(name string) error {
	if name == "" || utf8.RuneCountInString(name) < 1 {
		return ErrInvalidGroupName
	}

	if utf8.RuneCountInString(name) > maxGroupNameLength {
		return ErrGroupNameTooLong
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

package service

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
	"github.com/mubeench0303-ai/ChitChat/backend/pkg/cloudinary"
)

const maxPendingRequestMessages = 3

var (
	ErrCannotMessageSelf              = errors.New("you cannot send a message request to yourself")
	ErrConversationBlocked            = errors.New("this conversation is blocked")
	ErrRequestLimitReached            = errors.New("request message limit reached")
	ErrInvalidMessageContent          = errors.New("message content is required")
	ErrMessageContentOrImageRequired  = errors.New("message must include content or an image")
	ErrInvalidMessageImageFileSize    = errors.New("image must be at most 5MB")
	ErrInvalidMessageImageContentType = errors.New("image must be a JPEG, PNG, or WebP image")
	ErrInvalidMessageVoiceFileSize    = errors.New("voice message must be at most 10MB")
	ErrInvalidMessageVoiceContentType = errors.New("voice message must be an audio file")
	ErrMessageVoiceTooLong            = errors.New("voice message must be at most 5 minutes")
	ErrInvalidMessageVideoFileSize    = errors.New("video message must be at most 100MB")
	ErrInvalidMessageVideoContentType = errors.New("video message must be a video file")
	ErrMessageVideoTooLong            = errors.New("video message must be at most 60 seconds")
	ErrMessageNotEditable             = errors.New("this message cannot be edited")
	ErrMessageTooLong                 = errors.New("message must be at most 2000 characters")
	ErrConversationNotFound           = errors.New("conversation not found")
	ErrNotAuthorizedToRespond         = errors.New("not authorized to respond to this request")
	ErrNotAuthorized                  = errors.New("not authorized")
	ErrNotBlockInitiator              = errors.New("not authorized to unblock this user")
	ErrConversationNotAccepted        = errors.New("conversation is not accepted")
	ErrPendingMessageModification     = errors.New("Messages can't be modified until the request is accepted")
	ErrMessageNotFound                = errors.New("message not found")
	ErrNotMessageSender               = errors.New("not your message")
	ErrEditWindowExpired              = errors.New("edit window expired")
	ErrUnsendWindowExpired            = errors.New("unsend window expired")
	ErrInvalidReplyTarget             = errors.New("reply target not in this conversation")
	ErrInvalidStatusReplyTarget       = errors.New("invalid status reply target")
	ErrInvalidReactionEmoji           = errors.New("invalid reaction emoji")
	ErrInvalidGroupName               = errors.New("group name is required")
	ErrGroupNameTooLong               = errors.New("group name must be at most 100 characters")
	ErrGroupMembersRequired           = errors.New("group must include at least one other member")
	ErrGroupMemberNotFound            = errors.New("one or more selected members were not found")
	ErrGroupNotFound                  = errors.New("group not found")
	ErrNotGroupAdmin                  = errors.New("not authorized as group admin")
	ErrNotGroupMember                 = errors.New("not a group member")
	ErrInvalidGroupMemberRole         = errors.New("role must be admin or member")
	ErrGroupAddMembersRequired        = errors.New("at least one member id is required")
	ErrUseLeaveGroupInstead           = errors.New("use leave group to remove yourself")
	ErrWouldLeaveZeroAdmins           = errors.New("group must have at least one admin")
	ErrRecipientNoLongerExists        = errors.New("recipient no longer exists")
	ErrPinLimitReached                = errors.New("you can only pin up to 3 chats — unpin one first")
	ErrInvalidBackgroundType          = errors.New("invalid background type")
	ErrInvalidBackgroundPreset        = errors.New("invalid background preset")
	ErrInvalidBackgroundValue         = errors.New("background value is required")
	ErrSystemUserActionNotAllowed     = errors.New("this action is not available for the AI Assistant")
	ErrCannotMessageSystemUser        = errors.New("you cannot send a message request to the AI Assistant")
	ErrCannotAddSystemUserToGroup     = errors.New("the AI Assistant cannot be added to groups")
	ErrAIDailyMessageLimitReached     = errors.New("You've reached today's limit of 15 messages to AI Assistant. Come back after midnight to continue.")
)

const (
	BackgroundTypeDefault = "default"
	BackgroundTypePreset  = "preset"
	BackgroundTypeCustom  = "custom"
)

var allowedBackgroundPresets = map[string]struct{}{
	"preset_1": {},
	"preset_2": {},
	"preset_3": {},
	"preset_4": {},
	"preset_5": {},
	"preset_6": {},
	"preset_7": {},
}

type ConversationService struct {
	users         *repository.UserRepository
	conversations *repository.ConversationRepository
	statuses      *repository.StatusRepository
	notifications NotificationService
	cloudinary    *cloudinary.Client
	privacy       PrivacyChecker
	assistant     *AssistantService
}

func NewConversationService(
	users *repository.UserRepository,
	conversations *repository.ConversationRepository,
	statuses *repository.StatusRepository,
	notifications NotificationService,
	cloudinaryClient *cloudinary.Client,
	privacy PrivacyChecker,
	assistant *AssistantService,
) *ConversationService {
	return &ConversationService{
		users:         users,
		conversations: conversations,
		statuses:      statuses,
		notifications: notifications,
		cloudinary:    cloudinaryClient,
		privacy:       privacy,
		assistant:     assistant,
	}
}

func (s *ConversationService) rejectIfSystemDirectConversation(
	ctx context.Context,
	conversationID, userID uuid.UUID,
) error {
	conversation, err := s.conversations.GetByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrConversationNotFound
	}
	if err != nil {
		return fmt.Errorf("conversation: failed to fetch conversation: %w", err)
	}

	if conversation.Type != models.ConversationTypeDirect {
		return nil
	}

	otherUserID, err := s.conversations.GetOtherParticipantID(ctx, conversationID, userID)
	if err != nil {
		return fmt.Errorf("conversation: failed to resolve other participant: %w", err)
	}

	otherUser, err := s.users.GetUserByID(ctx, otherUserID.String())
	if errors.Is(err, repository.ErrNotFound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("conversation: failed to load other participant: %w", err)
	}

	if otherUser.IsSystem {
		return ErrSystemUserActionNotAllowed
	}

	return nil
}

func (s *ConversationService) maybeTriggerAssistantReply(
	ctx context.Context,
	userID, conversationID uuid.UUID,
	conversation *models.Conversation,
) {
	if s.assistant == nil || conversation.Type != models.ConversationTypeDirect {
		return
	}

	otherUserID, err := s.conversations.GetOtherParticipantID(ctx, conversationID, userID)
	if err != nil {
		return
	}

	otherUser, err := s.users.GetUserByID(ctx, otherUserID.String())
	if err != nil || !otherUser.IsSystem {
		return
	}

	go func() {
		if err := s.assistant.GenerateAndSendReply(context.Background(), conversationID, userID); err != nil {
			log.Printf("assistant: failed to generate reply for conversation %s: %v", conversationID, err)
		}
	}()
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

	if err := s.rejectIfSystemDirectConversation(ctx, conversationID, userID); err != nil {
		return err
	}

	if err := s.conversations.DeleteConversation(ctx, conversationID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrConversationNotFound
		}
		return fmt.Errorf("conversation: failed to remove connection: %w", err)
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

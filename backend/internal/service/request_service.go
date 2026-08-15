package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
)

func (s *ConversationService) SendMessageRequest(
	ctx context.Context,
	senderID uuid.UUID,
	targetUsername, content string,
) (*models.Message, error) {
	trimmedUsername := strings.TrimSpace(targetUsername)
	trimmedContent := strings.TrimSpace(content)

	targetUser, _, _, err := s.users.GetPublicProfileByUsername(ctx, senderID, trimmedUsername)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrPublicProfileNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to look up target user: %w", err)
	}

	if targetUser.IsDeleted {
		return nil, ErrPublicProfileNotFound
	}

	if targetUser.IsSystem {
		return nil, ErrCannotMessageSystemUser
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

	isNewRequest := false
	if conversation == nil {
		conversation, err = s.conversations.Create(ctx, senderID, targetID, senderID)
		if err != nil {
			return nil, fmt.Errorf("conversation: failed to create conversation: %w", err)
		}
		isNewRequest = true
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

	message, err := s.conversations.CreateMessage(ctx, conversationUUID, senderID, trimmedContent, nil, nil, nil)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to create message: %w", err)
	}

	if isNewRequest && s.notifications != nil {
		sender, senderErr := s.users.GetUserByID(ctx, senderID.String())
		if senderErr != nil {
			log.Printf("conversation: failed to load sender for request notification: %v", senderErr)
		} else {
			payload := map[string]interface{}{
				"conversationId":       conversation.ID,
				"requesterId":          sender.ID,
				"requesterFullName":    sender.FullName,
				"requesterUsername":    sender.Username,
				"requesterAvatarUrl":   sender.AvatarURL,
				"latestMessageContent": message.Content,
				"latestMessageAt":      message.CreatedAt,
				"requestedAt":          conversation.CreatedAt,
			}
			if notifyErr := s.notifications.NotifyUsers(
				[]uuid.UUID{targetID},
				"request_received",
				payload,
			); notifyErr != nil {
				log.Printf("conversation: failed to notify request recipient: %v", notifyErr)
			}
		}
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

func (s *ConversationService) GetSentRequests(
	ctx context.Context,
	userID uuid.UUID,
) ([]models.ConversationWithPreview, error) {
	requests, err := s.conversations.ListOutgoingRequests(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("conversation: failed to list sent requests: %w", err)
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

	for i := range results {
		targetID, parseErr := uuid.Parse(results[i].RequesterID)
		if parseErr != nil {
			continue
		}

		avatarURL := results[i].RequesterAvatarURL
		isOnline := results[i].RequesterIsOnline
		lastSeen := results[i].RequesterLastSeen
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

		results[i].RequesterAvatarURL = avatarURL
		results[i].RequesterIsOnline = isOnline
		results[i].RequesterLastSeen = lastSeen
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

func (s *ConversationService) ensureConversationNotPending(
	ctx context.Context,
	conversationID uuid.UUID,
) error {
	conversation, err := s.conversations.GetByID(ctx, conversationID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrConversationNotFound
	}
	if err != nil {
		return fmt.Errorf("conversation: failed to fetch conversation: %w", err)
	}

	if conversationStatus(conversation) == models.ConversationStatusPending {
		return ErrPendingMessageModification
	}

	return nil
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

	if err := s.rejectIfSystemDirectConversation(ctx, conversationID, userID); err != nil {
		return err
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

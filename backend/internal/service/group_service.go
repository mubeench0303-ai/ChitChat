package service

import (
	"context"
	"errors"
	"fmt"
	"mime/multipart"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
)

const (
	groupImageUploadFolder = "chitchat/groups"
	maxGroupNameLength     = 100
)

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

		memberUser, err := s.users.GetUserByID(ctx, memberID.String())
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrGroupMemberNotFound
		}
		if err != nil {
			return nil, fmt.Errorf("conversation: failed to verify member: %w", err)
		}
		if memberUser.IsDeleted {
			return nil, ErrGroupMemberNotFound
		}
		if memberUser.IsSystem {
			return nil, ErrCannotAddSystemUserToGroup
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

func validateGroupName(name string) error {
	if name == "" || utf8.RuneCountInString(name) < 1 {
		return ErrInvalidGroupName
	}

	if utf8.RuneCountInString(name) > maxGroupNameLength {
		return ErrGroupNameTooLong
	}

	return nil
}

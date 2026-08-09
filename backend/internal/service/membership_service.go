package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
)

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

		memberUser, err := s.users.GetUserByID(ctx, memberID.String())
		if errors.Is(err, repository.ErrNotFound) {
			return ErrGroupMemberNotFound
		}
		if err != nil {
			return fmt.Errorf("conversation: failed to verify member: %w", err)
		}
		if memberUser.IsDeleted {
			return ErrGroupMemberNotFound
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

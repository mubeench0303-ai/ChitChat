package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
)

const defaultUserSearchLimit = 20

func (s *AuthService) SearchUsers(
	ctx context.Context,
	currentUserID uuid.UUID,
	query string,
) ([]models.UserSearchResult, error) {
	trimmedQuery := strings.TrimSpace(query)
	if trimmedQuery == "" || utf8.RuneCountInString(trimmedQuery) < 1 {
		return nil, ErrInvalidSearchQuery
	}

	users, err := s.users.SearchByUsername(ctx, trimmedQuery, currentUserID, defaultUserSearchLimit)
	if err != nil {
		return nil, fmt.Errorf("auth: failed to search users: %w", err)
	}

	results := make([]models.UserSearchResult, 0, len(users))
	for _, user := range users {
		results = append(results, models.UserSearchResult{
			ID:        user.ID,
			FullName:  user.FullName,
			Username:  user.Username,
			AvatarURL: user.AvatarURL,
		})
	}

	return results, nil
}

func (s *AuthService) GetPublicProfile(
	ctx context.Context,
	username string,
) (*models.PublicProfile, error) {
	trimmedUsername := strings.TrimSpace(username)
	if trimmedUsername == "" {
		return nil, ErrPublicProfileNotFound
	}

	user, err := s.users.GetPublicProfileByUsername(ctx, trimmedUsername)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrPublicProfileNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("auth: failed to get public profile: %w", err)
	}

	if user.IsDeleted {
		return nil, ErrUserNoLongerExists
	}

	return &models.PublicProfile{
		ID:        user.ID,
		FullName:  user.FullName,
		Username:  user.Username,
		Bio:       user.Bio,
		AvatarURL: user.AvatarURL,
	}, nil
}

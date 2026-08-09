package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
)

const (
	maxStatusesPerUser = 5
	statusTTL          = 24 * time.Hour
	statusCleanupEvery = 30 * time.Minute
)

var (
	ErrStatusNotFound    = errors.New("status not found")
	ErrNotStatusOwner    = errors.New("you can only manage your own statuses")
	ErrInvalidStatusType = errors.New("status type must be text or image")
	ErrStatusTextRequired = errors.New("text status content is required")
	ErrStatusImageRequired = errors.New("image status requires an image URL")
)

type StatusService struct {
	statuses *repository.StatusRepository
	users    *repository.UserRepository
	privacy  PrivacyChecker
}

func NewStatusService(
	statuses *repository.StatusRepository,
	users *repository.UserRepository,
	privacy PrivacyChecker,
) *StatusService {
	return &StatusService{
		statuses: statuses,
		users:    users,
		privacy:  privacy,
	}
}

func (s *StatusService) activeSince() time.Time {
	return time.Now().Add(-statusTTL)
}

func (s *StatusService) enforceStatusLimit(ctx context.Context, userID uuid.UUID) error {
	count, err := s.statuses.GetActiveStatusCount(ctx, userID)
	if err != nil {
		return fmt.Errorf("status: failed to count statuses: %w", err)
	}

	if count < maxStatusesPerUser {
		return nil
	}

	oldest, err := s.statuses.GetOldestStatus(ctx, userID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("status: failed to get oldest status: %w", err)
	}

	oldestID, err := uuid.Parse(oldest.ID)
	if err != nil {
		return fmt.Errorf("status: invalid oldest status id: %w", err)
	}

	if err := s.statuses.DeleteStatus(ctx, oldestID); err != nil {
		return fmt.Errorf("status: failed to evict oldest status: %w", err)
	}

	return nil
}

func (s *StatusService) CreateTextStatus(
	ctx context.Context,
	userID uuid.UUID,
	content, backgroundColor string,
) (*models.Status, error) {
	trimmedContent := strings.TrimSpace(content)
	if trimmedContent == "" {
		return nil, ErrStatusTextRequired
	}

	if err := s.enforceStatusLimit(ctx, userID); err != nil {
		return nil, err
	}

	var bg *string
	if trimmedBG := strings.TrimSpace(backgroundColor); trimmedBG != "" {
		bg = &trimmedBG
	}

	contentPtr := &trimmedContent

	status, err := s.statuses.CreateStatus(
		ctx,
		userID,
		models.StatusTypeText,
		contentPtr,
		nil,
		bg,
	)
	if err != nil {
		return nil, fmt.Errorf("status: failed to create text status: %w", err)
	}

	return status, nil
}

func (s *StatusService) CreateImageStatus(
	ctx context.Context,
	userID uuid.UUID,
	imageURL, caption string,
) (*models.Status, error) {
	trimmedURL := strings.TrimSpace(imageURL)
	if trimmedURL == "" {
		return nil, ErrStatusImageRequired
	}

	if err := s.enforceStatusLimit(ctx, userID); err != nil {
		return nil, err
	}

	var contentPtr *string
	if trimmedCaption := strings.TrimSpace(caption); trimmedCaption != "" {
		contentPtr = &trimmedCaption
	}

	urlPtr := &trimmedURL

	status, err := s.statuses.CreateStatus(
		ctx,
		userID,
		models.StatusTypeImage,
		contentPtr,
		urlPtr,
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("status: failed to create image status: %w", err)
	}

	return status, nil
}

func (s *StatusService) GetMyStatuses(
	ctx context.Context,
	userID uuid.UUID,
) ([]models.Status, error) {
	statuses, err := s.statuses.GetStatusesForUser(ctx, userID, s.activeSince())
	if err != nil {
		return nil, fmt.Errorf("status: failed to get own statuses: %w", err)
	}

	if statuses == nil {
		statuses = []models.Status{}
	}

	return statuses, nil
}

func (s *StatusService) GetConnectionsStatuses(
	ctx context.Context,
	viewerID uuid.UUID,
) ([]models.StatusFeedEntry, error) {
	statuses, err := s.statuses.GetStatusesFromConnections(ctx, viewerID, s.activeSince())
	if err != nil {
		return nil, fmt.Errorf("status: failed to get connection statuses: %w", err)
	}

	allowedByOwner := make(map[string]bool)
	feedByOwner := make(map[string]*models.StatusFeedEntry)
	order := make([]string, 0)

	for _, status := range statuses {
		ownerID := status.UserID

		allowed, ok := allowedByOwner[ownerID]
		if !ok {
			ownerUUID, parseErr := uuid.Parse(ownerID)
			if parseErr != nil {
				return nil, fmt.Errorf("status: invalid owner id: %w", parseErr)
			}

			canView, privacyErr := s.privacy.CanView(
				ctx,
				viewerID,
				ownerUUID,
				models.PrivacyFieldStatus,
			)
			if privacyErr != nil {
				return nil, fmt.Errorf("status: failed to check status privacy: %w", privacyErr)
			}

			allowed = canView
			allowedByOwner[ownerID] = allowed
		}

		if !allowed {
			continue
		}

		entry, exists := feedByOwner[ownerID]
		if !exists {
			ownerUUID, parseErr := uuid.Parse(ownerID)
			if parseErr != nil {
				return nil, fmt.Errorf("status: invalid owner id: %w", parseErr)
			}

			user, userErr := s.users.GetUserByID(ctx, ownerUUID.String())
			if errors.Is(userErr, repository.ErrNotFound) {
				continue
			}
			if userErr != nil {
				return nil, fmt.Errorf("status: failed to load status owner: %w", userErr)
			}

			entry = &models.StatusFeedEntry{
				UserID:    user.ID,
				FullName:  user.FullName,
				Username:  user.Username,
				AvatarURL: user.AvatarURL,
				Statuses:  make([]models.Status, 0),
			}
			feedByOwner[ownerID] = entry
			order = append(order, ownerID)
		}

		entry.Statuses = append(entry.Statuses, status)
	}

	feed := make([]models.StatusFeedEntry, 0, len(order))
	for _, ownerID := range order {
		feed = append(feed, *feedByOwner[ownerID])
	}

	return feed, nil
}

func (s *StatusService) MarkStatusViewed(
	ctx context.Context,
	statusID, viewerID uuid.UUID,
) error {
	status, err := s.statuses.GetStatusByID(ctx, statusID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrStatusNotFound
	}
	if err != nil {
		return fmt.Errorf("status: failed to get status: %w", err)
	}

	if status.CreatedAt.Before(s.activeSince()) {
		return ErrStatusNotFound
	}

	ownerID, err := uuid.Parse(status.UserID)
	if err != nil {
		return fmt.Errorf("status: invalid status owner id: %w", err)
	}

	if viewerID == ownerID {
		return nil
	}

	canView, err := s.privacy.CanView(ctx, viewerID, ownerID, models.PrivacyFieldStatus)
	if err != nil {
		return fmt.Errorf("status: failed to check status privacy: %w", err)
	}
	if !canView {
		return ErrNotAuthorized
	}

	if err := s.statuses.AddStatusView(ctx, statusID, viewerID); err != nil {
		return fmt.Errorf("status: failed to record view: %w", err)
	}

	return nil
}

func (s *StatusService) GetStatusViewersList(
	ctx context.Context,
	requesterID, statusID uuid.UUID,
) ([]models.StatusViewer, error) {
	status, err := s.statuses.GetStatusByID(ctx, statusID)
	if errors.Is(err, repository.ErrNotFound) {
		return nil, ErrStatusNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("status: failed to get status: %w", err)
	}

	ownerID, err := uuid.Parse(status.UserID)
	if err != nil {
		return nil, fmt.Errorf("status: invalid status owner id: %w", err)
	}

	if requesterID != ownerID {
		return nil, ErrNotAuthorized
	}

	viewers, err := s.statuses.GetStatusViewers(ctx, statusID)
	if err != nil {
		return nil, fmt.Errorf("status: failed to get status viewers: %w", err)
	}

	if viewers == nil {
		viewers = []models.StatusViewer{}
	}

	return viewers, nil
}

func (s *StatusService) DeleteMyStatus(
	ctx context.Context,
	userID, statusID uuid.UUID,
) error {
	status, err := s.statuses.GetStatusByID(ctx, statusID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrStatusNotFound
	}
	if err != nil {
		return fmt.Errorf("status: failed to get status: %w", err)
	}

	ownerID, err := uuid.Parse(status.UserID)
	if err != nil {
		return fmt.Errorf("status: invalid status owner id: %w", err)
	}

	if userID != ownerID {
		return ErrNotStatusOwner
	}

	if err := s.statuses.DeleteStatus(ctx, statusID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrStatusNotFound
		}
		return fmt.Errorf("status: failed to delete status: %w", err)
	}

	return nil
}

func (s *StatusService) StartCleanupJob(ctx context.Context) {
	ticker := time.NewTicker(statusCleanupEvery)

	go func() {
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				cutoff := time.Now().Add(-statusTTL)
				deleted, err := s.statuses.DeleteExpiredStatuses(ctx, cutoff)
				if err != nil {
					log.Printf("status cleanup: failed to delete expired statuses: %v", err)
					continue
				}
				if deleted > 0 {
					log.Printf("status cleanup: deleted %d expired status rows", deleted)
				}
			}
		}
	}()
}

package service

import (
	"encoding/json"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/ws"
)

type NotificationService interface {
	NotifyUsers(userIDs []uuid.UUID, eventType string, payload interface{}) error
	IsUserOnline(userID uuid.UUID) bool
}

type HubNotificationService struct {
	hub *ws.Hub
}

func NewHubNotificationService(hub *ws.Hub) *HubNotificationService {
	return &HubNotificationService{hub: hub}
}

func (s *HubNotificationService) NotifyUsers(
	userIDs []uuid.UUID,
	eventType string,
	payload interface{},
) error {
	if len(userIDs) == 0 {
		return nil
	}

	envelope := map[string]interface{}{
		"type":    eventType,
		"payload": payload,
	}

	message, err := json.Marshal(envelope)
	if err != nil {
		return err
	}

	for _, userID := range userIDs {
		s.hub.SendToUser(userID, message)
	}

	return nil
}

func (s *HubNotificationService) IsUserOnline(userID uuid.UUID) bool {
	return s.hub.IsOnline(userID)
}

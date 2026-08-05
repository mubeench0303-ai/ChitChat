package ws

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
	jwthelper "github.com/mubeench0303-ai/ChitChat/backend/pkg/jwt"
)

type UserNotifier interface {
	NotifyUsers(userIDs []uuid.UUID, eventType string, payload interface{}) error
}

type PendingDeliveryHandler interface {
	DeliverPendingMessages(ctx context.Context, userID uuid.UUID) error
}

type incomingEnvelope struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type typingPayload struct {
	ConversationID string `json:"conversationId"`
	IsTyping       bool   `json:"isTyping"`
}

func ServeWS(
	hub *Hub,
	jwtHelper *jwthelper.Helper,
	originPatterns []string,
	conversations *repository.ConversationRepository,
	users *repository.UserRepository,
	notifier UserNotifier,
	deliveryHandler PendingDeliveryHandler,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(middleware.AuthTokenCookieName)
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		claims, err := jwtHelper.ValidateToken(cookie.Value)
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		userID, err := uuid.Parse(claims.UserID)
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		wsConn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			OriginPatterns: originPatterns,
		})
		if err != nil {
			log.Printf("ws: failed to upgrade connection: %v", err)
			return
		}

		connectionID := uuid.New()
		connection := &Connection{
			Conn:         wsConn,
			UserID:       userID,
			ConnectionID: connectionID,
		}

		hub.Register(userID, connection)

		ctx := context.Background()
		if err := users.SetOnlineStatus(ctx, userID, true); err != nil {
			log.Printf("ws: failed to set user %s online: %v", userID, err)
		} else {
			broadcastPresence(hub, userID, true, nil)
		}

		if deliveryHandler != nil {
			if err := deliveryHandler.DeliverPendingMessages(ctx, userID); err != nil {
				log.Printf("ws: failed to deliver pending messages for user %s: %v", userID, err)
			}
		}

		go func() {
			defer handleDisconnect(ctx, hub, users, userID, connectionID)
			defer wsConn.Close(websocket.StatusNormalClosure, "")

			readCtx := context.Background()
			for {
				_, message, readErr := wsConn.Read(readCtx)
				if readErr != nil {
					if websocket.CloseStatus(readErr) != websocket.StatusNormalClosure {
						log.Printf("ws: read error for user %s: %v", userID, readErr)
					}
					return
				}

				handleIncomingMessage(readCtx, userID, message, conversations, users, notifier)
			}
		}()
	}
}

func handleDisconnect(
	ctx context.Context,
	hub *Hub,
	users *repository.UserRepository,
	userID, connectionID uuid.UUID,
) {
	hub.Unregister(userID, connectionID)

	if hub.IsOnline(userID) {
		return
	}

	lastSeenAt := time.Now()

	if err := users.SetOnlineStatus(ctx, userID, false); err != nil {
		log.Printf("ws: failed to set user %s offline: %v", userID, err)
	}

	if err := users.SetLastSeen(ctx, userID, lastSeenAt); err != nil {
		log.Printf("ws: failed to set last seen for user %s: %v", userID, err)
	}

	broadcastPresence(hub, userID, false, &lastSeenAt)
}

func broadcastPresence(hub *Hub, userID uuid.UUID, isOnline bool, lastSeen *time.Time) {
	// TODO(groups): presence is broadcast to all connected clients for direct-chat
	// contacts (frontend filters by userId). Per-group member presence fan-out is
	// intentionally out of scope until group UI shows online status.
	payload := map[string]interface{}{
		"userId":   userID.String(),
		"isOnline": isOnline,
	}

	if !isOnline && lastSeen != nil {
		payload["lastSeen"] = lastSeen.UTC().Format(time.RFC3339)
	}

	envelope := map[string]interface{}{
		"type":    "presence",
		"payload": payload,
	}

	message, err := json.Marshal(envelope)
	if err != nil {
		log.Printf("ws: failed to marshal presence event: %v", err)
		return
	}

	hub.BroadcastAll(message)
}

func handleIncomingMessage(
	ctx context.Context,
	senderID uuid.UUID,
	message []byte,
	conversations *repository.ConversationRepository,
	users *repository.UserRepository,
	notifier UserNotifier,
) {
	var envelope incomingEnvelope
	if err := json.Unmarshal(message, &envelope); err != nil {
		return
	}

	switch envelope.Type {
	case "typing":
		handleTypingEvent(ctx, senderID, envelope.Payload, conversations, users, notifier)
	default:
		return
	}
}

func handleTypingEvent(
	ctx context.Context,
	senderID uuid.UUID,
	rawPayload json.RawMessage,
	conversations *repository.ConversationRepository,
	users *repository.UserRepository,
	notifier UserNotifier,
) {
	var payload typingPayload
	if err := json.Unmarshal(rawPayload, &payload); err != nil {
		return
	}

	conversationID, err := uuid.Parse(payload.ConversationID)
	if err != nil {
		return
	}

	isParticipant, err := conversations.IsParticipant(ctx, conversationID, senderID)
	if err != nil || !isParticipant {
		return
	}

	recipientIDs, err := conversations.GetOtherMembers(ctx, conversationID, senderID)
	if err != nil || len(recipientIDs) == 0 {
		return
	}

	senderName := ""
	if users != nil {
		sender, userErr := users.GetUserByID(ctx, senderID.String())
		if userErr != nil {
			log.Printf("ws: failed to resolve typing sender name for user %s: %v", senderID, userErr)
		} else {
			senderName = sender.FullName
		}
	}

	notifyPayload := map[string]interface{}{
		"conversationId": payload.ConversationID,
		"userId":         senderID.String(),
		"senderId":       senderID.String(),
		"senderName":     senderName,
		"isTyping":       payload.IsTyping,
	}

	if err := notifier.NotifyUsers(recipientIDs, "typing", notifyPayload); err != nil {
		log.Printf("ws: failed to forward typing event: %v", err)
	}
}

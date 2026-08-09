package ws

import (
	"context"
	"log"
	"sync"

	"github.com/coder/websocket"
	"github.com/google/uuid"
)

type Connection struct {
	Conn         *websocket.Conn
	UserID       uuid.UUID
	ConnectionID uuid.UUID
}

type Hub struct {
	mu          sync.RWMutex
	connections map[uuid.UUID]map[uuid.UUID]*Connection
}

func NewHub() *Hub {
	return &Hub{
		connections: make(map[uuid.UUID]map[uuid.UUID]*Connection),
	}
}

func (h *Hub) Register(userID uuid.UUID, conn *Connection) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.connections[userID] == nil {
		h.connections[userID] = make(map[uuid.UUID]*Connection)
	}

	h.connections[userID][conn.ConnectionID] = conn
}

func (h *Hub) Unregister(userID, connectionID uuid.UUID) {
	h.mu.Lock()
	defer h.mu.Unlock()

	userConnections, ok := h.connections[userID]
	if !ok {
		return
	}

	delete(userConnections, connectionID)
	if len(userConnections) == 0 {
		delete(h.connections, userID)
	}
}

func (h *Hub) IsOnline(userID uuid.UUID) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()

	userConnections, ok := h.connections[userID]
	return ok && len(userConnections) > 0
}

func (h *Hub) SendToUser(userID uuid.UUID, message []byte) {
	h.mu.RLock()
	userConnections, ok := h.connections[userID]
	if !ok {
		h.mu.RUnlock()
		return
	}

	targets := make([]*Connection, 0, len(userConnections))
	for _, connection := range userConnections {
		targets = append(targets, connection)
	}
	h.mu.RUnlock()

	ctx := context.Background()
	for _, connection := range targets {
		if err := connection.Conn.Write(ctx, websocket.MessageText, message); err != nil {
			log.Printf(
				"ws: failed to write to user %s connection %s: %v",
				userID,
				connection.ConnectionID,
				err,
			)
		}
	}
}

func (h *Hub) ConnectedUserIDs() []uuid.UUID {
	h.mu.RLock()
	defer h.mu.RUnlock()

	userIDs := make([]uuid.UUID, 0, len(h.connections))
	for userID := range h.connections {
		userIDs = append(userIDs, userID)
	}

	return userIDs
}

func (h *Hub) BroadcastAll(message []byte) {
	h.mu.RLock()
	targets := make([]*Connection, 0)
	for _, userConnections := range h.connections {
		for _, connection := range userConnections {
			targets = append(targets, connection)
		}
	}
	h.mu.RUnlock()

	ctx := context.Background()
	for _, connection := range targets {
		if err := connection.Conn.Write(ctx, websocket.MessageText, message); err != nil {
			log.Printf(
				"ws: failed to broadcast to user %s connection %s: %v",
				connection.UserID,
				connection.ConnectionID,
				err,
			)
		}
	}
}

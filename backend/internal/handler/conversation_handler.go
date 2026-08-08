package handler

import (
	"context"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/service"
)

type ConversationHandler struct {
	conversations *service.ConversationService
}

func NewConversationHandler(conversations *service.ConversationService) *ConversationHandler {
	return &ConversationHandler{conversations: conversations}
}
func (h *ConversationHandler) RemoveConnection(w http.ResponseWriter, r *http.Request) {
	h.manageConversation(w, r, h.conversations.RemoveConnection)
}
func (h *ConversationHandler) manageConversation(
	w http.ResponseWriter,
	r *http.Request,
	action func(context.Context, uuid.UUID, uuid.UUID) error,
) {
	userIDStr, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	conversationID, err := uuid.Parse(chi.URLParam(r, "conversationId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	err = action(r.Context(), userID, conversationID)
	if errors.Is(err, service.ErrConversationNotFound) {
		writeError(w, http.StatusNotFound, "Conversation not found")
		return
	}
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to process request")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Connection updated successfully",
	})
}

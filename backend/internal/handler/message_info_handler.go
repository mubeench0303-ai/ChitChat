package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/service"
)

func (h *ConversationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
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

	err = h.conversations.MarkConversationRead(r.Context(), userID, conversationID)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to mark conversation as read")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *ConversationHandler) GetMessageInfo(w http.ResponseWriter, r *http.Request) {
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

	messageID, err := uuid.Parse(chi.URLParam(r, "messageId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid message ID")
		return
	}

	members, err := h.conversations.GetMessageInfo(r.Context(), userID, messageID)
	if errors.Is(err, service.ErrMessageNotFound) {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if errors.Is(err, service.ErrNotMessageSender) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to get message info")
		return
	}

	writeJSON(w, http.StatusOK, members)
}

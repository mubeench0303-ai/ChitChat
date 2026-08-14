package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/service"
)

type ToggleReactionBody struct {
	Emoji string `json:"emoji"`
}

func (h *ConversationHandler) ToggleReaction(w http.ResponseWriter, r *http.Request) {
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

	var req ToggleReactionBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	err = h.conversations.ToggleReaction(r.Context(), userID, messageID, req.Emoji)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrPendingMessageModification) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrMessageNotFound) {
		writeError(w, http.StatusNotFound, "Message not found")
		return
	}
	if errors.Is(err, service.ErrInvalidReactionEmoji) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to toggle reaction")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

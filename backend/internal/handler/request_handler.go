package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/service"
)

type SendMessageRequestBody struct {
	Username string `json:"username"`
	Content  string `json:"content"`
}

func (h *ConversationHandler) SendMessageRequest(w http.ResponseWriter, r *http.Request) {
	senderIDStr, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	senderID, err := uuid.Parse(senderIDStr)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req SendMessageRequestBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	message, err := h.conversations.SendMessageRequest(
		r.Context(),
		senderID,
		req.Username,
		req.Content,
	)
	if errors.Is(err, service.ErrPublicProfileNotFound) {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}
	if errors.Is(err, service.ErrCannotMessageSelf) ||
		errors.Is(err, service.ErrConversationBlocked) ||
		errors.Is(err, service.ErrCannotMessageSystemUser) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrRequestLimitReached) {
		writeError(w, http.StatusTooManyRequests, err.Error())
		return
	}
	if errors.Is(err, service.ErrInvalidMessageContent) ||
		errors.Is(err, service.ErrMessageTooLong) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to send message request")
		return
	}

	writeJSON(w, http.StatusCreated, message)
}

func (h *ConversationHandler) GetIncomingRequests(w http.ResponseWriter, r *http.Request) {
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

	requests, err := h.conversations.GetIncomingRequests(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch incoming requests")
		return
	}

	if requests == nil {
		requests = []models.ConversationWithPreview{}
	}

	writeJSON(w, http.StatusOK, requests)
}

func (h *ConversationHandler) GetSentRequests(w http.ResponseWriter, r *http.Request) {
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

	requests, err := h.conversations.GetSentRequests(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch sent requests")
		return
	}

	if requests == nil {
		requests = []models.ConversationWithPreview{}
	}

	writeJSON(w, http.StatusOK, requests)
}

func (h *ConversationHandler) AcceptRequest(w http.ResponseWriter, r *http.Request) {
	h.respondToRequest(w, r, h.conversations.AcceptRequest)
}

func (h *ConversationHandler) RejectRequest(w http.ResponseWriter, r *http.Request) {
	h.respondToRequest(w, r, h.conversations.RejectRequest)
}

func (h *ConversationHandler) BlockRequest(w http.ResponseWriter, r *http.Request) {
	h.respondToRequest(w, r, h.conversations.BlockRequest)
}

func (h *ConversationHandler) respondToRequest(
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
	if errors.Is(err, service.ErrNotAuthorizedToRespond) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to process request")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Request processed successfully",
	})
}

func (h *ConversationHandler) BlockConnection(w http.ResponseWriter, r *http.Request) {
	h.manageConversation(w, r, h.conversations.BlockConnection)
}

func (h *ConversationHandler) GetBlockedUsers(w http.ResponseWriter, r *http.Request) {
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

	blocked, err := h.conversations.GetBlockedUsers(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch blocked users")
		return
	}

	if blocked == nil {
		blocked = []models.BlockedUser{}
	}

	writeJSON(w, http.StatusOK, blocked)
}

func (h *ConversationHandler) UnblockUser(w http.ResponseWriter, r *http.Request) {
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

	err = h.conversations.UnblockUser(r.Context(), userID, conversationID)
	if errors.Is(err, service.ErrConversationNotFound) {
		writeError(w, http.StatusNotFound, "Conversation not found")
		return
	}
	if errors.Is(err, service.ErrNotBlockInitiator) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to unblock user")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "User unblocked successfully",
	})
}

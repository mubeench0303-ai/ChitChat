package handler

import (
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/service"
)

func (h *ConversationHandler) GetChatList(w http.ResponseWriter, r *http.Request) {
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

	conversations, err := h.conversations.GetChatList(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch chat list")
		return
	}

	if conversations == nil {
		conversations = []models.ConversationWithPreview{}
	}

	writeJSON(w, http.StatusOK, conversations)
}

const maxSendMessageMultipartBytes = 6 << 20 // 5MB image + form overhead

func parseOptionalMessageID(raw *string) (*uuid.UUID, error) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil, nil
	}

	messageID, err := uuid.Parse(strings.TrimSpace(*raw))
	if err != nil {
		return nil, err
	}

	return &messageID, nil
}

func (h *ConversationHandler) GetMessages(w http.ResponseWriter, r *http.Request) {
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

	messages, err := h.conversations.GetMessages(r.Context(), userID, conversationID)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch messages")
		return
	}

	if messages == nil {
		messages = []models.Message{}
	}

	writeJSON(w, http.StatusOK, messages)
}

func (h *ConversationHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
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

	if err := r.ParseMultipartForm(maxSendMessageMultipartBytes); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid multipart form")
		return
	}

	content := strings.TrimSpace(r.FormValue("content"))

	replyToRaw := strings.TrimSpace(r.FormValue("replyToMessageId"))
	var replyToRawPtr *string
	if replyToRaw != "" {
		replyToRawPtr = &replyToRaw
	}

	replyToMessageID, err := parseOptionalMessageID(replyToRawPtr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid reply message ID")
		return
	}

	var imageFile multipart.File
	var imageFilename string

	file, header, err := r.FormFile("image")
	switch {
	case err == nil:
		imageFile = file
		imageFilename = header.Filename
		defer file.Close()
	case errors.Is(err, http.ErrMissingFile):
		// Optional image field.
	default:
		writeError(w, http.StatusBadRequest, "Expected a file field named \"image\"")
		return
	}

	hasContent := content != "" && utf8.RuneCountInString(content) >= 1
	hasImage := imageFile != nil
	if !hasContent && !hasImage {
		writeError(w, http.StatusBadRequest, "Message must include content or an image")
		return
	}

	message, err := h.conversations.SendChatMessage(
		r.Context(),
		userID,
		conversationID,
		content,
		replyToMessageID,
		imageFile,
		imageFilename,
	)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrConversationNotFound) {
		writeError(w, http.StatusNotFound, "Conversation not found")
		return
	}
	if errors.Is(err, service.ErrConversationNotAccepted) {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	if errors.Is(err, service.ErrRecipientNoLongerExists) {
		writeError(w, http.StatusGone, err.Error())
		return
	}
	if errors.Is(err, service.ErrInvalidReplyTarget) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if errors.Is(err, service.ErrMessageContentOrImageRequired) ||
		errors.Is(err, service.ErrInvalidMessageContent) ||
		errors.Is(err, service.ErrMessageTooLong) ||
		errors.Is(err, service.ErrInvalidMessageImageFileSize) ||
		errors.Is(err, service.ErrInvalidMessageImageContentType) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to send message")
		return
	}

	writeJSON(w, http.StatusCreated, message)
}

func (h *ConversationHandler) DeleteMessageForMe(w http.ResponseWriter, r *http.Request) {
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

	err = h.conversations.DeleteMessageForMe(r.Context(), userID, messageID)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrMessageNotFound) {
		writeError(w, http.StatusNotFound, "Message not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to delete message")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type EditMessageBody struct {
	Content string `json:"content"`
}

func (h *ConversationHandler) EditMessage(w http.ResponseWriter, r *http.Request) {
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

	var req EditMessageBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	message, err := h.conversations.EditMessage(r.Context(), userID, messageID, req.Content)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrEditWindowExpired) {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	if errors.Is(err, service.ErrMessageNotFound) {
		writeError(w, http.StatusNotFound, "Message not found")
		return
	}
	if errors.Is(err, service.ErrInvalidMessageContent) ||
		errors.Is(err, service.ErrMessageTooLong) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to edit message")
		return
	}

	writeJSON(w, http.StatusOK, message)
}

func (h *ConversationHandler) UnsendMessage(w http.ResponseWriter, r *http.Request) {
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

	err = h.conversations.UnsendMessage(r.Context(), userID, messageID)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrUnsendWindowExpired) {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	if errors.Is(err, service.ErrMessageNotFound) {
		writeError(w, http.StatusNotFound, "Message not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to unsend message")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Message unsent successfully",
	})
}

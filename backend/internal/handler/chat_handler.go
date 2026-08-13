package handler

import (
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/service"
	"github.com/mubeench0303-ai/ChitChat/backend/pkg/cloudinary"
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
const maxSendVoiceMultipartBytes = 11 << 20  // 10MB audio + form overhead
const maxBackgroundMultipartBytes = 6 << 20

type setBackgroundRequest struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

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

	replyToStatusRaw := strings.TrimSpace(r.FormValue("replyToStatusId"))
	var replyToStatusRawPtr *string
	if replyToStatusRaw != "" {
		replyToStatusRawPtr = &replyToStatusRaw
	}

	replyToStatusID, err := parseOptionalMessageID(replyToStatusRawPtr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid reply status ID")
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
		replyToStatusID,
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
	if errors.Is(err, service.ErrInvalidReplyTarget) ||
		errors.Is(err, service.ErrInvalidStatusReplyTarget) {
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

func (h *ConversationHandler) SendVoiceMessage(w http.ResponseWriter, r *http.Request) {
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

	if err := r.ParseMultipartForm(maxSendVoiceMultipartBytes); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid multipart form")
		return
	}

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

	replyToStatusRaw := strings.TrimSpace(r.FormValue("replyToStatusId"))
	var replyToStatusRawPtr *string
	if replyToStatusRaw != "" {
		replyToStatusRawPtr = &replyToStatusRaw
	}

	replyToStatusID, err := parseOptionalMessageID(replyToStatusRawPtr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid reply status ID")
		return
	}

	durationSeconds := 0
	if durationRaw := strings.TrimSpace(r.FormValue("durationSeconds")); durationRaw != "" {
		parsedDuration, parseErr := strconv.Atoi(durationRaw)
		if parseErr != nil || parsedDuration < 0 {
			writeError(w, http.StatusBadRequest, "Invalid duration value")
			return
		}
		durationSeconds = parsedDuration
	}

	file, header, err := r.FormFile("audio")
	if err != nil {
		if errors.Is(err, http.ErrMissingFile) {
			writeError(w, http.StatusBadRequest, "Voice message must include an audio file")
			return
		}
		writeError(w, http.StatusBadRequest, "Expected a file field named \"audio\"")
		return
	}
	defer file.Close()

	message, err := h.conversations.SendVoiceMessage(
		r.Context(),
		userID,
		conversationID,
		replyToMessageID,
		replyToStatusID,
		file,
		header.Filename,
		durationSeconds,
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
	if errors.Is(err, service.ErrInvalidReplyTarget) ||
		errors.Is(err, service.ErrInvalidStatusReplyTarget) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if errors.Is(err, service.ErrInvalidMessageVoiceFileSize) ||
		errors.Is(err, service.ErrInvalidMessageVoiceContentType) ||
		errors.Is(err, service.ErrMessageVoiceTooLong) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to send voice message")
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
	if errors.Is(err, service.ErrMessageNotEditable) {
		writeError(w, http.StatusBadRequest, err.Error())
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

func (h *ConversationHandler) GetFriends(w http.ResponseWriter, r *http.Request) {
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

	friends, err := h.conversations.GetFriends(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch friends")
		return
	}

	if friends == nil {
		friends = []models.FriendResponse{}
	}

	writeJSON(w, http.StatusOK, friends)
}

func (h *ConversationHandler) ClearChat(w http.ResponseWriter, r *http.Request) {
	userIDStr, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	actingUserID, err := uuid.Parse(userIDStr)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	conversationID, err := uuid.Parse(chi.URLParam(r, "conversationId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid conversation ID")
		return
	}

	err = h.conversations.ClearChat(r.Context(), actingUserID, conversationID)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, "You are not a participant in this conversation")
		return
	}
	if errors.Is(err, service.ErrConversationNotFound) {
		writeError(w, http.StatusNotFound, "Conversation not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to clear chat")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Chat cleared successfully",
	})
}

func (h *ConversationHandler) PinChat(w http.ResponseWriter, r *http.Request) {
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

	err = h.conversations.PinChat(r.Context(), userID, conversationID)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrPinLimitReached) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to pin chat")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Chat pinned",
	})
}

func (h *ConversationHandler) UnpinChat(w http.ResponseWriter, r *http.Request) {
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

	err = h.conversations.UnpinChat(r.Context(), userID, conversationID)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to unpin chat")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Chat unpinned",
	})
}

func (h *ConversationHandler) MuteChat(w http.ResponseWriter, r *http.Request) {
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

	err = h.conversations.MuteChat(r.Context(), userID, conversationID)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to mute chat")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Chat muted",
	})
}

func (h *ConversationHandler) UnmuteChat(w http.ResponseWriter, r *http.Request) {
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

	err = h.conversations.UnmuteChat(r.Context(), userID, conversationID)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to unmute chat")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Chat unmuted",
	})
}

func (h *ConversationHandler) SetConversationBackground(w http.ResponseWriter, r *http.Request) {
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

	var (
		backgroundType  string
		backgroundValue string
	)

	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		if err := r.ParseMultipartForm(maxBackgroundMultipartBytes); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid multipart form")
			return
		}

		backgroundType = strings.TrimSpace(r.FormValue("type"))
		if backgroundType != service.BackgroundTypeCustom {
			writeError(w, http.StatusBadRequest, "Custom background requires type \"custom\"")
			return
		}

		file, header, fileErr := r.FormFile("image")
		switch {
		case fileErr == nil:
			defer file.Close()
		case errors.Is(fileErr, http.ErrMissingFile):
			writeError(w, http.StatusBadRequest, "Image file is required for custom background")
			return
		default:
			writeError(w, http.StatusBadRequest, "Expected a file field named \"image\"")
			return
		}

		if err := validateStatusImageFile(file); err != nil {
			if errors.Is(err, service.ErrInvalidMessageImageContentType) ||
				errors.Is(err, service.ErrInvalidMessageImageFileSize) {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
			writeError(w, http.StatusBadRequest, "Invalid image file")
			return
		}

		if h.cloudinary == nil {
			writeError(w, http.StatusInternalServerError, "Image upload is not configured")
			return
		}

		imageURL, uploadErr := h.cloudinary.UploadImage(
			r.Context(),
			file,
			header.Filename,
			cloudinary.BackgroundUploadFolder,
		)
		if uploadErr != nil {
			writeError(w, http.StatusInternalServerError, "Failed to upload background image")
			return
		}

		backgroundValue = imageURL
	} else {
		var body setBackgroundRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			if !errors.Is(err, io.EOF) {
				writeError(w, http.StatusBadRequest, "Invalid request body")
				return
			}
		}

		backgroundType = strings.TrimSpace(body.Type)
		backgroundValue = strings.TrimSpace(body.Value)

		if backgroundType != service.BackgroundTypePreset {
			writeError(w, http.StatusBadRequest, "Preset background requires type \"preset\"")
			return
		}
	}

	err = h.conversations.SetBackground(
		r.Context(),
		userID,
		conversationID,
		backgroundType,
		backgroundValue,
	)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrInvalidBackgroundType) ||
		errors.Is(err, service.ErrInvalidBackgroundPreset) ||
		errors.Is(err, service.ErrInvalidBackgroundValue) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update background")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message":         "Background updated",
		"backgroundType":  backgroundType,
		"backgroundValue": backgroundValue,
	})
}

func (h *ConversationHandler) ResetConversationBackground(w http.ResponseWriter, r *http.Request) {
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

	err = h.conversations.ResetBackground(r.Context(), userID, conversationID)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to reset background")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message":        "Background reset",
		"backgroundType": service.BackgroundTypeDefault,
	})
}

func (h *ConversationHandler) GetConversationHeaderInfo(w http.ResponseWriter, r *http.Request) {
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

	info, err := h.conversations.GetConversationHeaderInfo(r.Context(), userID, conversationID)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, "You are not a participant in this conversation")
		return
	}
	if errors.Is(err, service.ErrConversationNotFound) {
		writeError(w, http.StatusNotFound, "Conversation not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch conversation info")
		return
	}

	writeJSON(w, http.StatusOK, info)
}

package handler

import (
	"context"
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

type ConversationHandler struct {
	conversations *service.ConversationService
}

func NewConversationHandler(conversations *service.ConversationService) *ConversationHandler {
	return &ConversationHandler{conversations: conversations}
}

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
		errors.Is(err, service.ErrConversationBlocked) {
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

func (h *ConversationHandler) RemoveConnection(w http.ResponseWriter, r *http.Request) {
	h.manageConversation(w, r, h.conversations.RemoveConnection)
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

type CreateGroupBody struct {
	Name      string   `json:"name"`
	MemberIDs []string `json:"memberIds"`
}

func (h *ConversationHandler) CreateGroup(w http.ResponseWriter, r *http.Request) {
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

	var req CreateGroupBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	memberIDs := make([]uuid.UUID, 0, len(req.MemberIDs))
	for _, memberIDStr := range req.MemberIDs {
		memberID, parseErr := uuid.Parse(strings.TrimSpace(memberIDStr))
		if parseErr != nil {
			writeError(w, http.StatusBadRequest, "Invalid member ID")
			return
		}
		memberIDs = append(memberIDs, memberID)
	}

	group, err := h.conversations.CreateGroup(r.Context(), userID, req.Name, memberIDs)
	if errors.Is(err, service.ErrInvalidGroupName) ||
		errors.Is(err, service.ErrGroupNameTooLong) ||
		errors.Is(err, service.ErrGroupMembersRequired) ||
		errors.Is(err, service.ErrGroupMemberNotFound) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create group")
		return
	}

	writeJSON(w, http.StatusCreated, group)
}

type GroupInfoResponse struct {
	Group   *models.Conversation       `json:"group"`
	Members []models.GroupMemberDetail `json:"members"`
}

func (h *ConversationHandler) GetGroupInfo(w http.ResponseWriter, r *http.Request) {
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

	group, members, err := h.conversations.GetGroupInfo(r.Context(), userID, conversationID)
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrGroupNotFound) {
		writeError(w, http.StatusNotFound, "Group not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch group info")
		return
	}

	if members == nil {
		members = []models.GroupMemberDetail{}
	}

	writeJSON(w, http.StatusOK, GroupInfoResponse{
		Group:   group,
		Members: members,
	})
}

type UpdateGroupInfoBody struct {
	Name      string  `json:"name"`
	AvatarURL *string `json:"avatarUrl"`
}

func (h *ConversationHandler) UpdateGroupInfo(w http.ResponseWriter, r *http.Request) {
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

	var req UpdateGroupInfoBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	err = h.conversations.UpdateGroupInfo(
		r.Context(),
		userID,
		conversationID,
		req.Name,
		req.AvatarURL,
	)
	if errors.Is(err, service.ErrNotGroupAdmin) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrInvalidGroupName) ||
		errors.Is(err, service.ErrGroupNameTooLong) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if errors.Is(err, service.ErrGroupNotFound) {
		writeError(w, http.StatusNotFound, "Group not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update group info")
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *ConversationHandler) UpdateGroupAvatar(w http.ResponseWriter, r *http.Request) {
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

	if err := r.ParseMultipartForm(5 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid multipart form")
		return
	}

	file, header, err := r.FormFile("avatar")
	if err != nil {
		if errors.Is(err, http.ErrMissingFile) {
			writeError(w, http.StatusBadRequest, "Avatar file is required in the \"avatar\" field")
			return
		}
		writeError(w, http.StatusBadRequest, "Expected a file field named \"avatar\"")
		return
	}
	defer file.Close()

	group, err := h.conversations.UpdateGroupAvatar(
		r.Context(),
		userID,
		conversationID,
		file,
		header.Filename,
	)
	if errors.Is(err, service.ErrNotGroupAdmin) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrInvalidMessageImageFileSize) ||
		errors.Is(err, service.ErrInvalidMessageImageContentType) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if errors.Is(err, service.ErrGroupNotFound) {
		writeError(w, http.StatusNotFound, "Group not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update group avatar")
		return
	}

	writeJSON(w, http.StatusOK, group)
}

type AddGroupMembersBody struct {
	MemberIDs []string `json:"memberIds"`
}

func (h *ConversationHandler) AddGroupMembers(w http.ResponseWriter, r *http.Request) {
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

	var req AddGroupMembersBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	memberIDs := make([]uuid.UUID, 0, len(req.MemberIDs))
	for _, memberIDStr := range req.MemberIDs {
		memberID, parseErr := uuid.Parse(strings.TrimSpace(memberIDStr))
		if parseErr != nil {
			writeError(w, http.StatusBadRequest, "Invalid member ID")
			return
		}
		memberIDs = append(memberIDs, memberID)
	}

	err = h.conversations.AddGroupMembers(r.Context(), userID, conversationID, memberIDs)
	if errors.Is(err, service.ErrNotGroupAdmin) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrGroupAddMembersRequired) ||
		errors.Is(err, service.ErrGroupMemberNotFound) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to add group members")
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *ConversationHandler) RemoveGroupMember(w http.ResponseWriter, r *http.Request) {
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

	targetUserID, err := uuid.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	err = h.conversations.RemoveGroupMember(r.Context(), userID, conversationID, targetUserID)
	if errors.Is(err, service.ErrNotGroupAdmin) ||
		errors.Is(err, service.ErrUseLeaveGroupInstead) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrNotGroupMember) {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to remove group member")
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *ConversationHandler) LeaveGroup(w http.ResponseWriter, r *http.Request) {
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

	err = h.conversations.LeaveGroup(r.Context(), userID, conversationID)
	if errors.Is(err, service.ErrNotGroupMember) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to leave group")
		return
	}

	w.WriteHeader(http.StatusOK)
}

type UpdateMemberRoleBody struct {
	Role string `json:"role"`
}

func (h *ConversationHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
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

	targetUserID, err := uuid.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	var req UpdateMemberRoleBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	err = h.conversations.UpdateMemberRole(
		r.Context(),
		userID,
		conversationID,
		targetUserID,
		req.Role,
	)
	if errors.Is(err, service.ErrNotGroupAdmin) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if errors.Is(err, service.ErrInvalidGroupMemberRole) ||
		errors.Is(err, service.ErrWouldLeaveZeroAdmins) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if errors.Is(err, service.ErrNotGroupMember) {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update member role")
		return
	}

	w.WriteHeader(http.StatusOK)
}

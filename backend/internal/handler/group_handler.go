package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/service"
)

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
		errors.Is(err, service.ErrGroupMemberNotFound) ||
		errors.Is(err, service.ErrCannotAddSystemUserToGroup) {
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

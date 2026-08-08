package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/service"
)

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

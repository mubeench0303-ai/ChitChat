package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/service"
)

func (h *AuthHandler) SearchUsers(w http.ResponseWriter, r *http.Request) {
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

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		writeError(w, http.StatusBadRequest, "Search query is required")
		return
	}

	results, err := h.auth.SearchUsers(r.Context(), userID, query)
	if errors.Is(err, service.ErrInvalidSearchQuery) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to search users")
		return
	}

	if results == nil {
		results = []models.UserSearchResult{}
	}

	writeJSON(w, http.StatusOK, results)
}

func (h *AuthHandler) GetPublicProfile(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	username := strings.TrimSpace(chi.URLParam(r, "username"))
	if username == "" {
		writeError(w, http.StatusBadRequest, "Username is required")
		return
	}

	profile, err := h.auth.GetPublicProfile(r.Context(), username)
	if errors.Is(err, service.ErrPublicProfileNotFound) {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}
	if errors.Is(err, service.ErrUserNoLongerExists) {
		writeError(w, http.StatusGone, "This user no longer exists")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch profile")
		return
	}

	writeJSON(w, http.StatusOK, profile)
}

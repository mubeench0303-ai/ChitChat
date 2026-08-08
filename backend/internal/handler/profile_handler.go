package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/service"
)

type UpdateProfileRequest struct {
	FullName string `json:"fullName"`
	Username string `json:"username"`
	Bio      string `json:"bio"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"currentPassword" validate:"required"`
	NewPassword     string `json:"newPassword" validate:"required,min=8"`
}

type DeleteAccountRequest struct {
	Password string `json:"password" validate:"required"`
}

func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
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

	var req UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	user, err := h.auth.UpdateProfile(r.Context(), userID, req.FullName, req.Username, req.Bio)
	if errors.Is(err, service.ErrUsernameAlreadyExists) {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	if errors.Is(err, service.ErrInvalidFullName) ||
		errors.Is(err, service.ErrInvalidUsername) ||
		errors.Is(err, service.ErrBioTooLong) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if errors.Is(err, service.ErrUserNotFound) {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update profile")
		return
	}

	writeJSON(w, http.StatusOK, toMeUserResponse(user))
}

func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
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

	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.validator.Struct(req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"message": "Validation failed",
			"errors":  validationErrors(err),
		})
		return
	}

	err = h.auth.ChangePassword(r.Context(), userID, req.CurrentPassword, req.NewPassword)
	if errors.Is(err, service.ErrIncorrectCurrentPassword) ||
		errors.Is(err, service.ErrNewPasswordSameAsCurrent) ||
		errors.Is(err, service.ErrInvalidPasswordStrength) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if errors.Is(err, service.ErrUserNotFound) {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to change password")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Password changed successfully.",
	})
}

func (h *AuthHandler) UpdateAvatar(w http.ResponseWriter, r *http.Request) {
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

	if err := r.ParseMultipartForm(3 << 20); err != nil {
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

	user, err := h.auth.UpdateAvatar(r.Context(), userID, file, header.Filename)
	if errors.Is(err, service.ErrInvalidAvatarFileSize) ||
		errors.Is(err, service.ErrInvalidAvatarContentType) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if errors.Is(err, service.ErrUserNotFound) {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to update avatar")
		return
	}

	writeJSON(w, http.StatusOK, toMeUserResponse(user))
}

func (h *AuthHandler) RemoveAvatar(w http.ResponseWriter, r *http.Request) {
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

	user, err := h.auth.RemoveAvatar(r.Context(), userID)
	if errors.Is(err, service.ErrNoAvatar) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if errors.Is(err, service.ErrUserNotFound) {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to remove avatar")
		return
	}

	writeJSON(w, http.StatusOK, toMeUserResponse(user))
}

func (h *AuthHandler) CheckUsername(w http.ResponseWriter, r *http.Request) {
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

	username := strings.TrimSpace(r.URL.Query().Get("username"))
	if username == "" {
		writeError(w, http.StatusBadRequest, "Username is required")
		return
	}

	available, err := h.auth.CheckUsernameAvailability(r.Context(), userID, username)
	if errors.Is(err, service.ErrInvalidUsername) {
		writeJSON(w, http.StatusOK, map[string]bool{"available": false})
		return
	}
	if errors.Is(err, service.ErrUserNotFound) {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to check username")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"available": available})
}

func (h *AuthHandler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
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

	var req DeleteAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.validator.Struct(req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"message": "Validation failed",
			"errors":  validationErrors(err),
		})
		return
	}

	err = h.auth.DeleteAccount(r.Context(), userID, req.Password)
	if errors.Is(err, service.ErrIncorrectCurrentPassword) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if errors.Is(err, service.ErrUserNotFound) {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to delete account")
		return
	}

	clearAuthCookie(w)

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Account deleted successfully",
	})
}

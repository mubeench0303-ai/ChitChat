package handler

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/repository"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/service"
)

type AuthHandler struct {
	auth         *service.AuthService
	users        *repository.UserRepository
	validator    *validator.Validate
	cookieSecure bool
}

func NewAuthHandler(auth *service.AuthService, users *repository.UserRepository, cookieSecure bool) *AuthHandler {
	return &AuthHandler{
		auth:         auth,
		users:        users,
		validator:    validator.New(),
		cookieSecure: cookieSecure,
	}
}

type SignupRequest struct {
	FullName string `json:"full_name" validate:"required,min=2,max=255"`
	Username string `json:"username" validate:"required,min=2,max=255"`
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
}

type VerifyEmailRequest struct {
	Email string `json:"email" validate:"required,email"`
	Code  string `json:"code" validate:"required,len=6"`
}

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type ResendVerificationRequest struct {
	Email string `json:"email" validate:"required,email"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email" validate:"required,email"`
}

type ResetPasswordRequest struct {
	Email       string `json:"email" validate:"required,email"`
	Code        string `json:"code" validate:"required,len=6"`
	NewPassword string `json:"new_password" validate:"required,min=8"`
}

func (h *AuthHandler) authCookie(value string, maxAge int) *http.Cookie {
	cookie := &http.Cookie{
		Name:     middleware.AuthTokenCookieName,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
	}

	if h.cookieSecure {
		cookie.SameSite = http.SameSiteNoneMode
	}

	return cookie
}

func (h *AuthHandler) clearAuthCookie(w http.ResponseWriter) {
	cookie := h.authCookie("", -1)
	cookie.Expires = time.Unix(0, 0)
	http.SetCookie(w, cookie)
}

type userResponse struct {
	ID         string  `json:"id"`
	Username   string  `json:"username"`
	FullName   string  `json:"full_name"`
	Email      string  `json:"email"`
	IsVerified bool    `json:"isVerified"`
	AvatarURL  *string `json:"avatarUrl,omitempty"`
	CreatedAt  string  `json:"createdAt"`
}

type loginUserResponse struct {
	ID         string  `json:"id"`
	FullName   string  `json:"full_name"`
	Username   string  `json:"username"`
	Email      string  `json:"email"`
	AvatarURL  *string `json:"avatar_url"`
	IsVerified bool    `json:"is_verified"`
}

type meUserResponse struct {
	ID         string  `json:"id"`
	FullName   string  `json:"fullName"`
	Username   string  `json:"username"`
	Email      string  `json:"email"`
	Bio        *string `json:"bio"`
	AvatarURL  *string `json:"avatarUrl"`
	IsOnline                 bool    `json:"isOnline"`
	LastSeen                 *string `json:"lastSeen"`
	NotificationSoundEnabled bool    `json:"notificationSoundEnabled"`
	IsVerified               bool    `json:"isVerified"`
	CreatedAt  string  `json:"createdAt"`
	UpdatedAt  string  `json:"updatedAt"`
}

func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	var req SignupRequest
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

	user, err := h.auth.Signup(r.Context(), req.FullName, req.Username, req.Email, req.Password)
	if errors.Is(err, service.ErrEmailAlreadyExists) || errors.Is(err, service.ErrUsernameAlreadyExists) {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to create account")
		return
	}

	if user.VerificationResent {
		writeJSON(w, http.StatusOK, map[string]any{
			"user":                 toUserResponse(user.User),
			"message":              "A new verification code has been sent to your email.",
			"verification_resent": true,
		})
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"user":    toUserResponse(user.User),
		"message": "Account created successfully.",
	})
}

func (h *AuthHandler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req VerifyEmailRequest
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

	err := h.auth.VerifyEmail(r.Context(), req.Email, req.Code)
	if errors.Is(err, service.ErrAlreadyVerified) {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	if errors.Is(err, service.ErrInvalidVerificationCode) || errors.Is(err, service.ErrExpiredVerificationCode) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to verify email")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Email verified successfully.",
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
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

	result, err := h.auth.Login(r.Context(), req.Email, req.Password)
	if errors.Is(err, service.ErrInvalidCredentials) {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	if errors.Is(err, service.ErrAccountNoLongerExists) {
		writeError(w, http.StatusForbidden, "This account no longer exists")
		return
	}
	if errors.Is(err, service.ErrEmailNotVerified) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to log in")
		return
	}

	http.SetCookie(w, h.authCookie(result.Token, 86400))

	writeJSON(w, http.StatusOK, map[string]any{
		"message": "Login successful",
		"user":    toLoginUserResponse(result.User),
	})
}

func (h *AuthHandler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	var req ResendVerificationRequest
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

	err := h.auth.ResendVerificationCode(r.Context(), req.Email)
	if errors.Is(err, service.ErrUserNotFound) {
		writeError(w, http.StatusNotFound, "User not found.")
		return
	}
	if errors.Is(err, service.ErrAlreadyVerified) {
		writeError(w, http.StatusConflict, "Email is already verified.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Internal server error.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "A new verification code has been sent to your email.",
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	user, err := h.users.GetUserByID(r.Context(), userID)
	if errors.Is(err, repository.ErrNotFound) {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to fetch user profile")
		return
	}

	writeJSON(w, http.StatusOK, toMeUserResponse(user))
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	h.clearAuthCookie(w)

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Logged out successfully.",
	})
}

func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req ForgotPasswordRequest
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

	if err := h.auth.ForgotPassword(r.Context(), req.Email); err != nil {
		writeError(w, http.StatusInternalServerError, "Internal server error.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "If the email exists, a password reset code has been sent.",
	})
}

func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req ResetPasswordRequest
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

	err := h.auth.ResetPassword(r.Context(), req.Email, req.Code, req.NewPassword)
	if errors.Is(err, service.ErrInvalidVerificationCode) || errors.Is(err, service.ErrExpiredVerificationCode) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Internal server error.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Password has been reset successfully.",
	})
}

func toUserResponse(user *models.User) userResponse {
	return userResponse{
		ID:         user.ID,
		Username:   user.Username,
		FullName:   user.FullName,
		Email:      user.Email,
		IsVerified: user.IsVerified,
		AvatarURL:  user.AvatarURL,
		CreatedAt:  user.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

func toLoginUserResponse(user *models.User) loginUserResponse {
	return loginUserResponse{
		ID:         user.ID,
		FullName:   user.FullName,
		Username:   user.Username,
		Email:      user.Email,
		AvatarURL:  user.AvatarURL,
		IsVerified: user.IsVerified,
	}
}

func toMeUserResponse(user *models.User) meUserResponse {
	response := meUserResponse{
		ID:         user.ID,
		FullName:   user.FullName,
		Username:   user.Username,
		Email:      user.Email,
		Bio:        user.Bio,
		AvatarURL:                user.AvatarURL,
		IsOnline:                 user.IsOnline,
		IsVerified:               user.IsVerified,
		NotificationSoundEnabled: user.NotificationSoundEnabled,
		CreatedAt:                user.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:  user.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}

	if user.LastSeen != nil {
		formatted := user.LastSeen.Format("2006-01-02T15:04:05Z07:00")
		response.LastSeen = &formatted
	}

	return response
}

func validationErrors(err error) map[string]string {
	fieldErrors := make(map[string]string)

	var validationErrs validator.ValidationErrors
	if !errors.As(err, &validationErrs) {
		fieldErrors["request"] = "Invalid request"
		return fieldErrors
	}

	for _, fieldErr := range validationErrs {
		fieldErrors[validationFieldName(fieldErr.Field())] = validationMessage(fieldErr)
	}

	return fieldErrors
}

func validationFieldName(field string) string {
	switch field {
	case "FullName":
		return "full_name"
	case "NewPassword":
		return "new_password"
	default:
		return strings.ToLower(field)
	}
}

func validationMessage(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return "This field is required"
	case "email":
		return "Must be a valid email address"
	case "min":
		return "Value is too short"
	case "max":
		return "Value is too long"
	default:
		return "Invalid value"
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"message": message})
}

func parseFormDurationSeconds(raw string) (int, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, true
	}

	parsed, err := strconv.ParseFloat(raw, 64)
	if err != nil || parsed < 0 {
		return 0, false
	}

	return int(math.Ceil(parsed)), true
}

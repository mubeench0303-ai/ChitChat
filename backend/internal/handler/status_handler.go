package handler

import (
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/mubeench0303-ai/ChitChat/backend/internal/middleware"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/models"
	"github.com/mubeench0303-ai/ChitChat/backend/internal/service"
	"github.com/mubeench0303-ai/ChitChat/backend/pkg/cloudinary"
)

const maxStatusMultipartBytes = 6 << 20

const statusImageUploadFolder = "chitchat/statuses"

type StatusHandler struct {
	statuses   *service.StatusService
	cloudinary *cloudinary.Client
}

func NewStatusHandler(
	statuses *service.StatusService,
	cloudinaryClient *cloudinary.Client,
) *StatusHandler {
	return &StatusHandler{
		statuses:   statuses,
		cloudinary: cloudinaryClient,
	}
}

func (h *StatusHandler) CreateStatus(w http.ResponseWriter, r *http.Request) {
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

	if err := r.ParseMultipartForm(maxStatusMultipartBytes); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid multipart form")
		return
	}

	statusType := strings.TrimSpace(r.FormValue("type"))
	content := strings.TrimSpace(r.FormValue("content"))
	backgroundColor := strings.TrimSpace(r.FormValue("backgroundColor"))

	switch statusType {
	case models.StatusTypeText:
		status, createErr := h.statuses.CreateTextStatus(
			r.Context(),
			userID,
			content,
			backgroundColor,
		)
		if errors.Is(createErr, service.ErrStatusTextRequired) {
			writeError(w, http.StatusBadRequest, createErr.Error())
			return
		}
		if createErr != nil {
			writeError(w, http.StatusInternalServerError, "Failed to create status")
			return
		}

		writeJSON(w, http.StatusCreated, status)
		return

	case models.StatusTypeImage:
		file, header, fileErr := r.FormFile("image")
		switch {
		case fileErr == nil:
			defer file.Close()
		case errors.Is(fileErr, http.ErrMissingFile):
			writeError(w, http.StatusBadRequest, "Image file is required for image status")
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
			statusImageUploadFolder,
		)
		if uploadErr != nil {
			writeError(w, http.StatusInternalServerError, "Failed to upload status image")
			return
		}

		status, createErr := h.statuses.CreateImageStatus(
			r.Context(),
			userID,
			imageURL,
			content,
		)
		if errors.Is(createErr, service.ErrStatusImageRequired) {
			writeError(w, http.StatusBadRequest, createErr.Error())
			return
		}
		if createErr != nil {
			writeError(w, http.StatusInternalServerError, "Failed to create status")
			return
		}

		writeJSON(w, http.StatusCreated, status)
		return

	default:
		writeError(w, http.StatusBadRequest, service.ErrInvalidStatusType.Error())
		return
	}
}

func (h *StatusHandler) GetMyStatuses(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseAuthenticatedUserID(w, r)
	if !ok {
		return
	}

	statuses, err := h.statuses.GetMyStatuses(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to load statuses")
		return
	}

	writeJSON(w, http.StatusOK, statuses)
}

func (h *StatusHandler) GetStatusFeed(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseAuthenticatedUserID(w, r)
	if !ok {
		return
	}

	feed, err := h.statuses.GetConnectionsStatuses(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to load status feed")
		return
	}

	if feed == nil {
		feed = []models.StatusFeedEntry{}
	}

	writeJSON(w, http.StatusOK, feed)
}

func (h *StatusHandler) MarkStatusViewed(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseAuthenticatedUserID(w, r)
	if !ok {
		return
	}

	statusID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid status ID")
		return
	}

	err = h.statuses.MarkStatusViewed(r.Context(), statusID, userID)
	if errors.Is(err, service.ErrStatusNotFound) {
		writeError(w, http.StatusNotFound, "Status not found")
		return
	}
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to record status view")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Status view recorded",
	})
}

func (h *StatusHandler) GetStatusViewers(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseAuthenticatedUserID(w, r)
	if !ok {
		return
	}

	statusID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid status ID")
		return
	}

	viewers, err := h.statuses.GetStatusViewersList(r.Context(), userID, statusID)
	if errors.Is(err, service.ErrStatusNotFound) {
		writeError(w, http.StatusNotFound, "Status not found")
		return
	}
	if errors.Is(err, service.ErrNotAuthorized) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to load status viewers")
		return
	}

	writeJSON(w, http.StatusOK, viewers)
}

func (h *StatusHandler) DeleteStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := parseAuthenticatedUserID(w, r)
	if !ok {
		return
	}

	statusID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid status ID")
		return
	}

	err = h.statuses.DeleteMyStatus(r.Context(), userID, statusID)
	if errors.Is(err, service.ErrStatusNotFound) {
		writeError(w, http.StatusNotFound, "Status not found")
		return
	}
	if errors.Is(err, service.ErrNotStatusOwner) {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to delete status")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Status deleted",
	})
}

func parseAuthenticatedUserID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	userIDStr, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return uuid.Nil, false
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Unauthorized")
		return uuid.Nil, false
	}

	return userID, true
}

func validateStatusImageFile(file multipart.File) error {
	header := make([]byte, 512)
	n, err := file.Read(header)
	if err != nil && !errors.Is(err, io.EOF) {
		return err
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return err
	}

	contentType := http.DetectContentType(header[:n])
	switch contentType {
	case "image/jpeg", "image/png", "image/webp":
	default:
		return service.ErrInvalidMessageImageContentType
	}

	size, err := file.Seek(0, io.SeekEnd)
	if err != nil {
		return err
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return err
	}

	if size > 5<<20 {
		return service.ErrInvalidMessageImageFileSize
	}

	if size == 0 {
		return service.ErrInvalidMessageImageFileSize
	}

	return nil
}

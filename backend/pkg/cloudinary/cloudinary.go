package cloudinary

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	AvatarUploadFolder      = "chitchat/avatars"
	BackgroundUploadFolder  = "chitchat/backgrounds"
)

type Client struct {
	cloudName  string
	apiKey     string
	apiSecret  string
	httpClient *http.Client
}

func NewClient(cloudName, apiKey, apiSecret string) *Client {
	return &Client{
		cloudName:  cloudName,
		apiKey:     apiKey,
		apiSecret:  apiSecret,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

type uploadResponse struct {
	SecureURL string `json:"secure_url"`
	Error     *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (c *Client) UploadImage(
	ctx context.Context,
	file multipart.File,
	filename string,
	folder string,
) (string, error) {
	if c.cloudName == "" || c.apiKey == "" || c.apiSecret == "" {
		return "", fmt.Errorf("cloudinary: client is not configured")
	}

	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	paramsToSign := fmt.Sprintf("folder=%s&timestamp=%s", folder, timestamp)
	signature := sign(paramsToSign, c.apiSecret)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	filePart, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", fmt.Errorf("cloudinary: failed to create upload form: %w", err)
	}

	if _, err := io.Copy(filePart, file); err != nil {
		return "", fmt.Errorf("cloudinary: failed to read upload file: %w", err)
	}

	if err := writer.WriteField("api_key", c.apiKey); err != nil {
		return "", fmt.Errorf("cloudinary: failed to write api_key field: %w", err)
	}
	if err := writer.WriteField("timestamp", timestamp); err != nil {
		return "", fmt.Errorf("cloudinary: failed to write timestamp field: %w", err)
	}
	if err := writer.WriteField("signature", signature); err != nil {
		return "", fmt.Errorf("cloudinary: failed to write signature field: %w", err)
	}
	if err := writer.WriteField("folder", folder); err != nil {
		return "", fmt.Errorf("cloudinary: failed to write folder field: %w", err)
	}

	if err := writer.Close(); err != nil {
		return "", fmt.Errorf("cloudinary: failed to finalize upload form: %w", err)
	}

	uploadURL := fmt.Sprintf(
		"https://api.cloudinary.com/v1_1/%s/image/upload",
		c.cloudName,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL, body)
	if err != nil {
		return "", fmt.Errorf("cloudinary: failed to create upload request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("cloudinary: upload request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("cloudinary: failed to read upload response: %w", err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("cloudinary: API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var result uploadResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("cloudinary: failed to decode upload response: %w", err)
	}

	if result.Error != nil {
		return "", fmt.Errorf("cloudinary: %s", result.Error.Message)
	}

	if result.SecureURL == "" {
		return "", fmt.Errorf("cloudinary: upload response did not include a secure URL")
	}

	return result.SecureURL, nil
}

type destroyResponse struct {
	Result string `json:"result"`
	Error  *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (c *Client) DeleteImage(ctx context.Context, imageURL string) error {
	if c.cloudName == "" || c.apiKey == "" || c.apiSecret == "" {
		return fmt.Errorf("cloudinary: client is not configured")
	}

	if !strings.Contains(imageURL, "res.cloudinary.com") {
		return nil
	}

	publicID, err := publicIDFromURL(imageURL)
	if err != nil {
		return err
	}

	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	paramsToSign := fmt.Sprintf("public_id=%s&timestamp=%s", publicID, timestamp)
	signature := sign(paramsToSign, c.apiSecret)

	form := url.Values{}
	form.Set("public_id", publicID)
	form.Set("api_key", c.apiKey)
	form.Set("timestamp", timestamp)
	form.Set("signature", signature)

	destroyURL := fmt.Sprintf(
		"https://api.cloudinary.com/v1_1/%s/image/destroy",
		c.cloudName,
	)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		destroyURL,
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return fmt.Errorf("cloudinary: failed to create delete request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("cloudinary: delete request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("cloudinary: failed to read delete response: %w", err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("cloudinary: API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var result destroyResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return fmt.Errorf("cloudinary: failed to decode delete response: %w", err)
	}

	if result.Error != nil {
		return fmt.Errorf("cloudinary: %s", result.Error.Message)
	}

	switch result.Result {
	case "ok", "not found":
		return nil
	default:
		return fmt.Errorf("cloudinary: unexpected delete result %q", result.Result)
	}
}

func publicIDFromURL(imageURL string) (string, error) {
	const marker = "/upload/"
	idx := strings.Index(imageURL, marker)
	if idx == -1 {
		return "", fmt.Errorf("cloudinary: url does not contain upload path")
	}

	parts := strings.Split(imageURL[idx+len(marker):], "/")
	start := 0

	for start < len(parts) {
		part := parts[start]
		if isCloudinaryVersionSegment(part) {
			start++
			continue
		}
		break
	}

	if start >= len(parts) {
		return "", fmt.Errorf("cloudinary: could not parse public id from url")
	}

	publicID := strings.Join(parts[start:], "/")
	if dot := strings.LastIndex(publicID, "."); dot != -1 {
		publicID = publicID[:dot]
	}

	if publicID == "" {
		return "", fmt.Errorf("cloudinary: empty public id")
	}

	return publicID, nil
}

func isCloudinaryVersionSegment(part string) bool {
	if !strings.HasPrefix(part, "v") || len(part) <= 1 {
		return false
	}

	for _, r := range part[1:] {
		if r < '0' || r > '9' {
			return false
		}
	}

	return true
}

func sign(params, apiSecret string) string {
	hash := sha1.Sum([]byte(params + apiSecret))
	return hex.EncodeToString(hash[:])
}

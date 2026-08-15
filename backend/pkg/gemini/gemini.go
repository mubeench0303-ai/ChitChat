package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const ModelName = "gemini-3.5-flash"

const generateContentPath = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent"

const defaultHTTPTimeout = 45 * time.Second

var (
	ErrMissingAPIKey = errors.New("gemini: API key is not configured")
	ErrRateLimited   = errors.New("gemini: rate limit or quota exceeded")
	ErrEmptyResponse = errors.New("gemini: empty response from model")
)

type GeminiMessage struct {
	Role    string
	Content string
}

type Client struct {
	apiKey     string
	httpClient *http.Client
}

func NewClient(apiKey string) *Client {
	return &Client{
		apiKey: strings.TrimSpace(apiKey),
		httpClient: &http.Client{
			Timeout: defaultHTTPTimeout,
		},
	}
}

type generateContentRequest struct {
	SystemInstruction *contentBlock   `json:"systemInstruction,omitempty"`
	Contents          []contentEntry  `json:"contents"`
}

type contentBlock struct {
	Parts []textPart `json:"parts"`
}

type contentEntry struct {
	Role  string     `json:"role"`
	Parts []textPart `json:"parts"`
}

type textPart struct {
	Text string `json:"text"`
}

type generateContentResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	Error *apiError `json:"error,omitempty"`
}

type apiError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Status  string `json:"status"`
}

func (c *Client) GenerateReply(ctx context.Context, messages []GeminiMessage) (string, error) {
	if c == nil || c.apiKey == "" {
		return "", ErrMissingAPIKey
	}

	if len(messages) == 0 {
		return "", fmt.Errorf("gemini: at least one message is required")
	}

	contents := make([]contentEntry, 0, len(messages))
	for _, message := range messages {
		role := strings.TrimSpace(message.Role)
		content := strings.TrimSpace(message.Content)
		if role == "" || content == "" {
			continue
		}

		contents = append(contents, contentEntry{
			Role: role,
			Parts: []textPart{
				{Text: content},
			},
		})
	}

	if len(contents) == 0 {
		return "", fmt.Errorf("gemini: no valid messages to send")
	}

	requestBody := generateContentRequest{
		SystemInstruction: &contentBlock{
			Parts: []textPart{
				{
					Text: "You are the AI Assistant in ChitChat, a friendly messaging app. " +
						"Reply concisely and helpfully in plain text. Keep responses conversational and suitable for chat.",
				},
			},
		},
		Contents: contents,
	}

	payload, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("gemini: failed to encode request: %w", err)
	}

	endpoint := fmt.Sprintf(generateContentPath+"?key=%s", ModelName, c.apiKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("gemini: failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("gemini: request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("gemini: failed to read response: %w", err)
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		return "", fmt.Errorf("%w: status=%d body=%s", ErrRateLimited, resp.StatusCode, truncateBody(body))
	}

	var parsed generateContentResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("gemini: failed to decode response: %w", err)
	}

	if parsed.Error != nil {
		if isRateLimitError(parsed.Error) {
			return "", fmt.Errorf("%w: %s", ErrRateLimited, parsed.Error.Message)
		}
		return "", fmt.Errorf("gemini: api error (%d %s): %s", parsed.Error.Code, parsed.Error.Status, parsed.Error.Message)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if resp.StatusCode == http.StatusTooManyRequests {
			return "", fmt.Errorf("%w: status=%d body=%s", ErrRateLimited, resp.StatusCode, truncateBody(body))
		}
		return "", fmt.Errorf("gemini: unexpected status %d: %s", resp.StatusCode, truncateBody(body))
	}

	for _, candidate := range parsed.Candidates {
		var parts []string
		for _, part := range candidate.Content.Parts {
			text := strings.TrimSpace(part.Text)
			if text != "" {
				parts = append(parts, text)
			}
		}
		if len(parts) > 0 {
			return strings.Join(parts, "\n"), nil
		}
	}

	return "", ErrEmptyResponse
}

func isRateLimitError(apiErr *apiError) bool {
	if apiErr == nil {
		return false
	}

	status := strings.ToUpper(strings.TrimSpace(apiErr.Status))
	message := strings.ToLower(apiErr.Message)

	return apiErr.Code == 429 ||
		status == "RESOURCE_EXHAUSTED" ||
		strings.Contains(message, "quota") ||
		strings.Contains(message, "rate limit")
}

func truncateBody(body []byte) string {
	text := strings.TrimSpace(string(body))
	if len(text) <= 512 {
		return text
	}
	return text[:512] + "..."
}

func IsRateLimitError(err error) bool {
	return errors.Is(err, ErrRateLimited)
}

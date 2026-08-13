package email

import (
	"context"
	"fmt"
	"strings"

	pingram "github.com/pingram-io/pingram-go"
)

type Client struct {
	apiKey            string
	client            *pingram.Client
	fromName          string
	fromAddress       string
	emailVerifyType   string
	passwordResetType string
}

func NewClient(
	apiKey string,
	region string,
	fromName string,
	fromAddress string,
	emailVerifyType string,
	passwordResetType string,
) *Client {
	opts := make([]pingram.ClientOption, 0, 1)
	switch strings.ToLower(strings.TrimSpace(region)) {
	case "eu":
		opts = append(opts, pingram.WithRegion(pingram.RegionEU))
	case "ca":
		opts = append(opts, pingram.WithRegion(pingram.RegionCA))
	}

	if strings.TrimSpace(emailVerifyType) == "" {
		emailVerifyType = "email_verify"
	}

	if strings.TrimSpace(passwordResetType) == "" {
		passwordResetType = "password_reset"
	}

	return &Client{
		apiKey:            strings.TrimSpace(apiKey),
		client:            pingram.NewClient(apiKey, opts...),
		fromName:          strings.TrimSpace(fromName),
		fromAddress:       strings.TrimSpace(fromAddress),
		emailVerifyType:   emailVerifyType,
		passwordResetType: passwordResetType,
	}
}

func (c *Client) SendVerificationEmail(toEmail, code string) error {
	subject := "Verify your ChitChat account"
	htmlContent, err := renderVerificationEmail(code)
	if err != nil {
		return fmt.Errorf("pingram: failed to render verification email: %w", err)
	}

	previewText := fmt.Sprintf("Your verification code is %s. It expires in 10 minutes.", code)

	return c.sendEmail(c.emailVerifyType, toEmail, subject, htmlContent, previewText)
}

func (c *Client) SendPasswordResetEmail(toEmail, code string) error {
	subject := "Reset your ChitChat password"
	htmlContent, err := renderPasswordResetEmail(code)
	if err != nil {
		return fmt.Errorf("pingram: failed to render password reset email: %w", err)
	}

	previewText := fmt.Sprintf("Your password reset code is %s. It expires in 10 minutes.", code)

	return c.sendEmail(c.passwordResetType, toEmail, subject, htmlContent, previewText)
}

func (c *Client) sendEmail(emailType, toEmail, subject, htmlContent, previewText string) error {
	if c.apiKey == "" {
		return fmt.Errorf("pingram: PINGRAM_API_KEY is not configured")
	}

	if c.client == nil {
		return fmt.Errorf("pingram: mail client is not configured")
	}

	body := pingram.NewSendEmailRequest(emailType, toEmail, subject, htmlContent)

	if c.fromName != "" {
		body.FromName = pingram.PtrString(c.fromName)
	}

	if c.fromAddress != "" {
		body.FromAddress = pingram.PtrString(c.fromAddress)
	}

	if previewText != "" {
		body.PreviewText = pingram.PtrString(previewText)
	}

	_, _, err := c.client.EmailAPI.
		EmailSend(context.Background()).
		SendEmailRequest(*body).
		Execute()
	if err != nil {
		return fmt.Errorf("pingram: failed to send email: %w", err)
	}

	return nil
}

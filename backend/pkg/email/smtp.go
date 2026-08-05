package email

import (
	"fmt"
	"net/smtp"
	"strconv"
	"strings"
)

type Client struct {
	host     string
	port     int
	username string
	password string
	from     string
	fromName string
}

func NewClient(host string, port int, username, password, from, fromName string) *Client {
	return &Client{
		host:     host,
		port:     port,
		username: username,
		password: password,
		from:     from,
		fromName: fromName,
	}
}

func (c *Client) SendVerificationEmail(toEmail, code string) error {
	subject := "Verify your ChitChat account"
	htmlContent := fmt.Sprintf(
		"<p>Your verification code is <strong>%s</strong>.</p><p>This code expires in 10 minutes.</p>",
		code,
	)

	return c.send(toEmail, subject, htmlContent)
}

func (c *Client) SendPasswordResetEmail(toEmail, code string) error {
	subject := "Reset your ChitChat password"
	htmlContent := fmt.Sprintf(
		"<p>Your password reset code is <strong>%s</strong>.</p><p>This code expires in 10 minutes.</p>",
		code,
	)

	return c.send(toEmail, subject, htmlContent)
}

func (c *Client) send(toEmail, subject, htmlContent string) error {
	if c.host == "" || c.username == "" || c.password == "" {
		return fmt.Errorf("smtp: mail is not configured")
	}

	from := c.from
	if from == "" {
		from = c.username
	}

	fromHeader := from
	if c.fromName != "" {
		fromHeader = fmt.Sprintf("%s <%s>", c.fromName, from)
	}

	var message strings.Builder
	message.WriteString("From: " + fromHeader + "\r\n")
	message.WriteString("To: " + toEmail + "\r\n")
	message.WriteString("Subject: " + subject + "\r\n")
	message.WriteString("MIME-Version: 1.0\r\n")
	message.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	message.WriteString("\r\n")
	message.WriteString(htmlContent)

	addr := c.host + ":" + strconv.Itoa(c.port)
	auth := smtp.PlainAuth("", c.username, c.password, c.host)

	if err := smtp.SendMail(addr, auth, from, []string{toEmail}, []byte(message.String())); err != nil {
		return fmt.Errorf("smtp: failed to send email: %w", err)
	}

	return nil
}

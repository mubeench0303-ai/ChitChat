package email

import (
	"fmt"
	htmltemplate "html/template"
	"strings"
)

const (
	brandAccentStart = "#e6404d"
	brandAccentEnd   = "#ff7347"
	brandTextPrimary = "#111111"
	brandTextMuted   = "#666666"
	brandSurface     = "#f3f3f3"
	brandBorder      = "#eeeeee"
)

type otpEmailContent struct {
	Preheader     string
	Title         string
	Heading       string
	Intro         string
	Code          string
	ExpiryMinutes int
	FooterNote    string
}

func renderVerificationEmail(code string) (string, error) {
	return renderOTPEmail(otpEmailContent{
		Preheader:     fmt.Sprintf("Your ChitChat verification code is %s", code),
		Title:         "Verify your email",
		Heading:       "Welcome to ChitChat",
		Intro:         "Thanks for signing up. Enter the code below to verify your email and start chatting.",
		Code:          code,
		ExpiryMinutes: 10,
		FooterNote:    "If you didn't create a ChitChat account, you can safely ignore this email.",
	})
}

func renderPasswordResetEmail(code string) (string, error) {
	return renderOTPEmail(otpEmailContent{
		Preheader:     "Reset your ChitChat password",
		Title:         "Reset your password",
		Heading:       "Password reset requested",
		Intro:         "We received a request to reset your password. Use the code below to choose a new one.",
		Code:          code,
		ExpiryMinutes: 10,
		FooterNote:    "If you didn't request a password reset, you can safely ignore this email.",
	})
}

func renderOTPEmail(content otpEmailContent) (string, error) {
	safeCode := htmltemplate.HTMLEscapeString(content.Code)
	safePreheader := htmltemplate.HTMLEscapeString(content.Preheader)
	safeTitle := htmltemplate.HTMLEscapeString(content.Title)
	safeHeading := htmltemplate.HTMLEscapeString(content.Heading)
	safeIntro := htmltemplate.HTMLEscapeString(content.Intro)
	safeFooter := htmltemplate.HTMLEscapeString(content.FooterNote)

	codeDigits := strings.Split(content.Code, "")
	digitBoxes := make([]string, 0, len(codeDigits))
	for _, digit := range codeDigits {
		digitBoxes = append(digitBoxes, fmt.Sprintf(
			`<td style="width:44px;height:52px;background-color:#ffffff;border:1px solid %s;border-radius:12px;text-align:center;font-size:24px;font-weight:700;color:%s;line-height:52px;">%s</td>`,
			brandBorder,
			brandTextPrimary,
			htmltemplate.HTMLEscapeString(digit),
		))
	}
	if len(digitBoxes) == 0 {
		digitBoxes = append(digitBoxes, fmt.Sprintf(
			`<td colspan="6" style="padding:16px 20px;background-color:#ffffff;border:1px solid %s;border-radius:14px;text-align:center;font-size:28px;font-weight:700;letter-spacing:0.28em;color:%s;">%s</td>`,
			brandBorder,
			brandTextPrimary,
			safeCode,
		))
	} else {
		spacers := make([]string, 0, len(digitBoxes)*2-1)
		for i, box := range digitBoxes {
			spacers = append(spacers, box)
			if i < len(digitBoxes)-1 {
				spacers = append(spacers, `<td style="width:8px;font-size:0;line-height:0;">&nbsp;</td>`)
			}
		}
		digitBoxes = []string{strings.Join(spacers, "")}
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>%s</title>
</head>
<body style="margin:0;padding:0;background-color:%s;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:%s;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">%s</div>
  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="background-color:%s;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="border-radius:16px;background:linear-gradient(135deg,%s 0%%,%s 100%%);padding:12px 18px;">
                    <span style="font-size:18px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;">ChitChat</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border:1px solid %s;border-radius:20px;padding:32px 28px;box-shadow:0 18px 40px rgba(230,64,77,0.08);">
              <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:%s;">%s</p>
              <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:%s;">%s</h1>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:%s;">%s</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%%" style="margin:0 0 24px;">
                <tr>
                  <td align="center" style="padding:18px 12px;border-radius:16px;background-color:rgba(230,64,77,0.06);border:1px solid rgba(230,64,77,0.10);">
                    <p style="margin:0 0 14px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:%s;">Your code</p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                      <tr>%s</tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:%s;">This code expires in <strong style="color:%s;">%d minutes</strong>.</p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:%s;">For your security, never share this code with anyone.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:%s;">%s</p>
              <p style="margin:0;font-size:12px;line-height:1.6;color:#999999;">© ChitChat</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
		safeTitle,
		brandSurface,
		brandTextPrimary,
		safePreheader,
		brandSurface,
		brandAccentStart,
		brandAccentEnd,
		brandBorder,
		brandAccentStart,
		safeTitle,
		brandTextPrimary,
		safeHeading,
		brandTextMuted,
		safeIntro,
		brandAccentStart,
		digitBoxes[0],
		brandTextMuted,
		brandAccentStart,
		content.ExpiryMinutes,
		brandTextMuted,
		brandTextMuted,
		safeFooter,
	)

	return html, nil
}

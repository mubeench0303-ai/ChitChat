package models

import "time"

type VerificationCode struct {
	ID        string
	UserID    string
	Code      string
	Type      string
	ExpiresAt time.Time
	UsedAt    *time.Time
	CreatedAt time.Time
}

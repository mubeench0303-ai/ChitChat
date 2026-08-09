package models

import "time"

const (
	StatusTypeText  = "text"
	StatusTypeImage = "image"
)

type Status struct {
	ID              string     `json:"id"`
	UserID          string     `json:"userId"`
	Type            string     `json:"type"`
	Content         *string    `json:"content,omitempty"`
	ImageURL        *string    `json:"imageUrl,omitempty"`
	BackgroundColor *string    `json:"backgroundColor,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
}

type StatusViewer struct {
	ID        string     `json:"id"`
	ViewerID  string     `json:"viewerId"`
	FullName  string     `json:"fullName"`
	Username  string     `json:"username"`
	AvatarURL *string    `json:"avatarUrl,omitempty"`
	ViewedAt  time.Time  `json:"viewedAt"`
}

type StatusFeedEntry struct {
	UserID    string   `json:"userId"`
	FullName  string   `json:"fullName"`
	Username  string   `json:"username"`
	AvatarURL *string  `json:"avatarUrl,omitempty"`
	Statuses  []Status `json:"statuses"`
}

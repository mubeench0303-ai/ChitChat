package models

import "time"

type User struct {
	ID           string     `json:"id"`
	Username     string     `json:"username"`
	FullName     string     `json:"fullName"`
	Email        string     `json:"email"`
	PasswordHash string     `json:"-"`
	IsVerified   bool       `json:"isVerified"`
	AvatarURL    *string    `json:"avatarUrl,omitempty"`
	Bio          *string    `json:"bio,omitempty"`
	IsOnline     bool       `json:"isOnline"`
	LastSeen     *time.Time `json:"lastSeen,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

type UserSearchResult struct {
	ID        string  `json:"id"`
	FullName  string  `json:"fullName"`
	Username  string  `json:"username"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
}

type PublicProfile struct {
	ID        string  `json:"id"`
	FullName  string  `json:"fullName"`
	Username  string  `json:"username"`
	Bio       *string `json:"bio"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
}

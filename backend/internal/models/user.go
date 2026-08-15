package models

import "time"

const DeletedUserDisplayName = "Deleted User"

type User struct {
	ID           string     `json:"id"`
	Username     string     `json:"username"`
	FullName     string     `json:"fullName"`
	Email        string     `json:"email"`
	PasswordHash string     `json:"-"`
	IsVerified   bool       `json:"isVerified"`
	AvatarURL    *string    `json:"avatarUrl,omitempty"`
	Bio          *string    `json:"bio,omitempty"`
	IsOnline                  bool       `json:"isOnline"`
	LastSeen                  *time.Time `json:"lastSeen,omitempty"`
	NotificationSoundEnabled  bool       `json:"notificationSoundEnabled"`
	IsDeleted                 bool       `json:"isDeleted"`
	IsSystem                  bool       `json:"-"`
	DeletedAt    *time.Time `json:"deletedAt,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

type UserSearchResult struct {
	ID        string  `json:"id"`
	FullName  string  `json:"fullName"`
	Username  string  `json:"username"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
}

const (
	RelationshipStatusNone     = "none"
	RelationshipStatusPending  = "pending"
	RelationshipStatusAccepted = "accepted"
	RelationshipStatusBlocked  = "blocked"
)

type PublicProfile struct {
	ID                 string  `json:"id"`
	FullName           string  `json:"fullName"`
	Username           string  `json:"username"`
	Bio                *string `json:"bio"`
	AvatarURL          *string `json:"avatarUrl,omitempty"`
	RelationshipStatus string  `json:"relationshipStatus"`
	ConversationID     *string `json:"conversationId,omitempty"`
}

type FriendResponse struct {
	ID             string  `json:"id"`
	FullName       string  `json:"fullName"`
	Username       string  `json:"username"`
	AvatarURL      *string `json:"avatarUrl,omitempty"`
	IsOnline       *bool   `json:"isOnline,omitempty"`
	ConversationID string  `json:"conversationId"`
}

const (
	PrivacyVisibilityEveryone          = "everyone"
	PrivacyVisibilityConnections       = "connections"
	PrivacyVisibilityConnectionsExcept = "connections_except"
	PrivacyVisibilityNobody            = "nobody"
)

const (
	PrivacyFieldLastSeenAndOnline = "last_seen_and_online"
	PrivacyFieldProfilePhoto      = "profile_photo"
	PrivacyFieldBio               = "bio"
	PrivacyFieldStatus            = "status"
)

type PrivacySettings struct {
	LastSeenAndOnline string `json:"lastSeenAndOnline"`
	ProfilePhoto      string `json:"profilePhoto"`
	Bio               string `json:"bio"`
	Status            string `json:"status"`
}

type PrivacyExceptionUser struct {
	ID        string  `json:"id"`
	FullName  string  `json:"fullName"`
	Username  string  `json:"username"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
}

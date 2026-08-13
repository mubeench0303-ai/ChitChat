package models

import "time"

const (
	ConversationTypeDirect = "direct"
	ConversationTypeGroup  = "group"

	ConversationStatusPending  = "pending"
	ConversationStatusAccepted = "accepted"
	ConversationStatusBlocked  = "blocked"

	ConversationMemberRoleAdmin  = "admin"
	ConversationMemberRoleMember = "member"
)

type Conversation struct {
	ID            string    `json:"id"`
	Type          string    `json:"type"`
	Name          *string   `json:"name,omitempty"`
	AvatarURL     *string   `json:"avatarUrl,omitempty"`
	CreatedBy     *string   `json:"createdBy,omitempty"`
	DirectPairKey *string   `json:"directPairKey,omitempty"`
	Status        *string   `json:"status,omitempty"`
	RequestedBy   *string   `json:"requestedBy,omitempty"`
	BlockedBy     *string   `json:"blockedBy,omitempty"`
	MemberCount   *int      `json:"memberCount,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type ConversationMember struct {
	ConversationID string    `json:"conversationId"`
	UserID         string    `json:"userId"`
	Role           string    `json:"role"`
	JoinedAt       time.Time `json:"joinedAt"`
}

type GroupMemberDetail struct {
	ID        string    `json:"id"`
	FullName  string    `json:"fullName"`
	Username  string    `json:"username"`
	AvatarURL *string   `json:"avatarUrl,omitempty"`
	Role      string    `json:"role"`
	JoinedAt  time.Time `json:"joinedAt"`
}

type IncomingMessageRequest struct {
	ConversationID        string    `json:"conversationId"`
	RequesterID           string    `json:"requesterId"`
	RequesterFullName     string    `json:"requesterFullName"`
	RequesterUsername     string    `json:"requesterUsername"`
	RequesterAvatarURL    *string   `json:"requesterAvatarUrl,omitempty"`
	LatestMessageContent  string    `json:"latestMessageContent"`
	LatestMessageIsUnsent bool      `json:"-"`
	LatestMessageAt       time.Time `json:"latestMessageAt"`
	RequestedAt           time.Time `json:"requestedAt"`
}

type ConversationWithPreview struct {
	ConversationID        string     `json:"conversationId"`
	Type                  string     `json:"type"`
	RequesterID           string     `json:"requesterId,omitempty"`
	RequesterFullName     string     `json:"requesterFullName,omitempty"`
	RequesterUsername     string     `json:"requesterUsername,omitempty"`
	RequesterAvatarURL    *string    `json:"requesterAvatarUrl,omitempty"`
	GroupName             *string    `json:"groupName,omitempty"`
	GroupAvatarURL        *string    `json:"groupAvatarUrl,omitempty"`
	LatestMessageContent  string     `json:"latestMessageContent"`
	LatestMessageIsUnsent bool       `json:"-"`
	LatestMessageAt       time.Time  `json:"latestMessageAt"`
	RequestedAt           time.Time  `json:"requestedAt"`
	RequesterIsOnline     *bool      `json:"requesterIsOnline,omitempty"`
	RequesterLastSeen     *time.Time `json:"requesterLastSeen,omitempty"`
	UnreadCount           int        `json:"unreadCount"`
	IsPinned              bool       `json:"isPinned"`
	IsMuted               bool       `json:"isMuted"`
}

type BlockedUser struct {
	ConversationID string    `json:"conversationId"`
	FullName       string    `json:"fullName"`
	Username       string    `json:"username"`
	AvatarURL      *string   `json:"avatarUrl,omitempty"`
	BlockedAt      time.Time `json:"blockedAt"`
}

type ConversationHeaderInfo struct {
	Type string `json:"type"`

	ParticipantID        *string    `json:"participantId,omitempty"`
	ParticipantFullName  *string    `json:"participantFullName,omitempty"`
	ParticipantUsername  *string    `json:"participantUsername,omitempty"`
	ParticipantAvatarURL *string    `json:"participantAvatarUrl,omitempty"`
	ParticipantIsOnline  *bool      `json:"participantIsOnline,omitempty"`
	ParticipantLastSeen  *time.Time `json:"participantLastSeen,omitempty"`

	GroupName      *string `json:"groupName,omitempty"`
	GroupAvatarURL *string `json:"groupAvatarUrl,omitempty"`
	MemberCount    *int    `json:"memberCount,omitempty"`

	BackgroundType  string  `json:"backgroundType"`
	BackgroundValue *string `json:"backgroundValue,omitempty"`
}

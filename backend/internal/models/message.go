package models

import "time"

type MessageReplyTo struct {
	ID       string `json:"id"`
	SenderID string `json:"senderId"`
	Content  string `json:"content"`
	IsUnsent bool   `json:"isUnsent,omitempty"`
}

type MessageReplyToStatus struct {
	ID              string  `json:"id"`
	OwnerID         string  `json:"ownerId"`
	Type            string  `json:"type"`
	Content         *string `json:"content,omitempty"`
	ImageURL        *string `json:"imageUrl,omitempty"`
	BackgroundColor *string `json:"backgroundColor,omitempty"`
}

type Message struct {
	ID               string                `json:"id"`
	ConversationID   string                `json:"conversationId"`
	SenderID         string                `json:"senderId"`
	Content          string                `json:"content"`
	ImageURL         *string               `json:"imageUrl,omitempty"`
	IsEdited         bool                  `json:"isEdited"`
	IsUnsent         bool                  `json:"isUnsent"`
	ReplyToMessageID *string               `json:"replyToMessageId,omitempty"`
	ReplyTo          *MessageReplyTo       `json:"replyTo,omitempty"`
	ReplyToStatusID  *string               `json:"replyToStatusId,omitempty"`
	ReplyToStatus    *MessageReplyToStatus `json:"replyToStatus,omitempty"`
	Reactions        []ReactionSummary     `json:"reactions,omitempty"`
	DeliveredAt      *time.Time            `json:"deliveredAt,omitempty"`
	Status           *string               `json:"status,omitempty"`
	TickStatus       *string               `json:"tickStatus,omitempty"`
	CreatedAt        time.Time             `json:"createdAt"`
	UpdatedAt        time.Time             `json:"updatedAt"`
}

type ReactionSummary struct {
	Emoji   string   `json:"emoji"`
	Count   int      `json:"count"`
	UserIDs []string `json:"userIds"`
}

type MemberReadStatus struct {
	UserID      string     `json:"userId"`
	FullName    string     `json:"fullName"`
	Username    string     `json:"username"`
	AvatarURL   *string    `json:"avatarUrl,omitempty"`
	Status      string     `json:"status"`
	DeliveredAt *time.Time `json:"deliveredAt,omitempty"`
	ReadAt      *time.Time `json:"readAt,omitempty"`
}

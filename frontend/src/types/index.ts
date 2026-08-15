export interface User {
  id: string;
  fullName: string;
  username: string;
  email: string;
  bio: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
  lastSeen: string | null;
  notificationSoundEnabled?: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSearchResult {
  id: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
}

export interface PublicProfile {
  id: string;
  fullName: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  relationshipStatus: "none" | "pending" | "accepted" | "blocked";
  conversationId?: string | null;
}

export interface Friend {
  id: string;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
  isOnline?: boolean;
  conversationId: string;
}

export interface BlockedUser {
  conversationId: string;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
  blockedAt: string;
}

export interface IncomingMessageRequest {
  conversationId: string;
  requesterId: string;
  requesterFullName: string;
  requesterUsername: string;
  requesterAvatarUrl?: string | null;
  latestMessageContent: string;
  latestMessageAt: string;
  requestedAt: string;
  requesterIsOnline?: boolean;
  requesterLastSeen?: string | null;
}

export interface ChatConversation {
  conversationId: string;
  type: "direct" | "group";
  requesterId?: string;
  requesterFullName?: string;
  requesterUsername?: string;
  requesterAvatarUrl?: string | null;
  groupName?: string | null;
  groupAvatarUrl?: string | null;
  latestMessageContent: string;
  latestMessageAt: string;
  requestedAt: string;
  requesterIsOnline?: boolean;
  requesterLastSeen?: string | null;
  participantIsSystem?: boolean;
  unreadCount?: number;
  isPinned?: boolean;
  isMuted?: boolean;
}

export interface ConversationHeaderInfo {
  type: "direct" | "group";
  status?: "pending" | "accepted" | "blocked";
  requestedBy?: string;
  participantId?: string;
  participantFullName?: string;
  participantUsername?: string;
  participantAvatarUrl?: string | null;
  participantIsOnline?: boolean;
  participantLastSeen?: string | null;
  participantIsSystem?: boolean;
  groupName?: string | null;
  groupAvatarUrl?: string | null;
  memberCount?: number;
  backgroundType?: "default" | "preset" | "custom";
  backgroundValue?: string | null;
}

export interface GroupConversation {
  id: string;
  type: string;
  name?: string | null;
  avatarUrl?: string | null;
  createdBy?: string | null;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMemberDetail {
  id: string;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
  role: string;
  joinedAt: string;
}

export interface GroupInfoResponse {
  group: GroupConversation;
  members: GroupMemberDetail[];
}

export type MessageType = "text" | "image" | "voice" | "video";

export interface MessageReplyTo {
  id: string;
  senderId: string;
  type?: MessageType;
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  videoUrl?: string | null;
  isUnsent?: boolean;
}

export interface MessageReplyToStatus {
  id: string;
  ownerId: string;
  type: "text" | "image" | "video";
  content?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  videoDurationSeconds?: number | null;
  backgroundColor?: string | null;
}

export type MessageDeliveryStatus = "sent" | "delivered" | "seen";

export type MessageTickStatus = MessageDeliveryStatus;

export type MemberDeliveryStatus = "not_delivered" | "delivered" | "seen";

export interface MemberReadStatus {
  userId: string;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
  status: MemberDeliveryStatus;
  deliveredAt?: string | null;
  readAt?: string | null;
}

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  type?: MessageType;
  content: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  audioDurationSeconds?: number | null;
  videoUrl?: string | null;
  videoDurationSeconds?: number | null;
  isUploading?: boolean;
  isEdited?: boolean;
  isUnsent?: boolean;
  replyToMessageId?: string;
  replyTo?: MessageReplyTo;
  replyToStatusId?: string;
  replyToStatus?: MessageReplyToStatus;
  reactions?: MessageReactionSummary[];
  status?: MessageDeliveryStatus;
  tickStatus?: MessageTickStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MessageUnsentEventPayload {
  conversationId: string;
  messageId: string;
}

export interface MessageEditedEventPayload {
  conversationId: string;
  messageId: string;
  content: string;
  isEdited: boolean;
}

export interface MessageDeliveredEventPayload {
  conversationId: string;
  messageId: string;
}

export interface ConversationReadEventPayload {
  conversationId: string;
  readAt: string;
}

export interface NewMessageEventPayload {
  conversationId: string;
  message: ChatMessage;
}

export interface ReactionUpdatedEventPayload {
  conversationId: string;
  messageId: string;
  reactions: MessageReactionSummary[];
}

export interface TypingEventPayload {
  conversationId: string;
  userId: string;
  senderId?: string;
  senderName?: string;
  isTyping: boolean;
}

export interface MessageTickUpdatedEventPayload {
  conversationId: string;
  messageId: string;
  tickStatus: MessageTickStatus;
}

export interface PresenceEventPayload {
  userId: string;
  isOnline: boolean;
  lastSeen?: string;
}

export interface RequestReceivedEventPayload {
  conversationId: string;
  requesterId: string;
  requesterFullName: string;
  requesterUsername: string;
  requesterAvatarUrl?: string | null;
  latestMessageContent: string;
  latestMessageAt: string;
  requestedAt: string;
}

export type PrivacyVisibility =
  | "everyone"
  | "connections"
  | "connections_except"
  | "nobody";

export type PrivacyFieldKey =
  | "lastSeenAndOnline"
  | "profilePhoto"
  | "bio"
  | "status";

export type PrivacyApiField =
  | "last_seen_and_online"
  | "profile_photo"
  | "bio"
  | "status";

export interface PrivacySettings {
  lastSeenAndOnline: PrivacyVisibility;
  profilePhoto: PrivacyVisibility;
  bio: PrivacyVisibility;
  status: PrivacyVisibility;
}

export interface PrivacyExceptionUser {
  id: string;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
}

export type StatusType = "text" | "image" | "video";

export interface Status {
  id: string;
  userId: string;
  type: StatusType;
  content?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  videoDurationSeconds?: number | null;
  backgroundColor?: string | null;
  createdAt: string;
}

export interface StatusFeedEntry {
  userId: string;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
  statuses: Status[];
}

export interface StatusViewerEntry {
  id: string;
  viewerId: string;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
  viewedAt: string;
}

export interface StatusUserSequence {
  userId: string;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
  isOwn: boolean;
  statuses: Status[];
}

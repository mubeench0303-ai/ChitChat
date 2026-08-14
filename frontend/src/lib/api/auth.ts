import api from "@/lib/axios";
import type {
  LoginInput,
  SignupFormData,
  VerifyEmailInput,
} from "@/lib/validations/auth";
import type {
  ChatConversation,
  ChatMessage,
  ConversationHeaderInfo,
  GroupConversation,
  GroupInfoResponse,
  IncomingMessageRequest,
  MemberReadStatus,
  User,
  BlockedUser,
  Friend,
  PrivacyApiField,
  PrivacyExceptionUser,
  PrivacyFieldKey,
  PrivacySettings,
  PrivacyVisibility,
  Status,
  StatusFeedEntry,
  StatusViewerEntry,
} from "@/types";

export function signup(
  data: SignupFormData
): Promise<{ message: string; verification_resent?: boolean }> {
  const { fullName, username, email, password } = data;

  return api.post<{ message: string; verification_resent?: boolean }>(
    "/auth/signup",
    {
      full_name: fullName,
      username,
      email,
      password,
    }
  );
}

export function verifyEmail(
  data: VerifyEmailInput
): Promise<{ message: string }> {
  return api.post<{ message: string }>("/auth/verify-email", data);
}

export function resendCode(email: string): Promise<{ message: string }> {
  return api.post<{ message: string }>("/auth/resend-verification", { email });
}

export function login(
  data: LoginInput
): Promise<{ message: string; user: User }> {
  return api.post<{ message: string; user: User }>("/auth/login", data);
}

export function logout(): Promise<{ message: string }> {
  return api.post<{ message: string }>("/auth/logout");
}

export function forgotPassword(email: string): Promise<{ message: string }> {
  return api.post<{ message: string }>("/auth/forgot-password", { email });
}

export function resetPassword(data: {
  email: string;
  code: string;
  new_password: string;
}): Promise<{ message: string }> {
  return api.post<{ message: string }>("/auth/reset-password", data);
}

export function getMe(): Promise<User> {
  return api.get<User>("/auth/me");
}

export function updateProfile(data: {
  fullName: string;
  username: string;
  bio?: string;
}): Promise<User> {
  return api.patch<User>("/auth/profile", data);
}

export function checkUsernameAvailability(
  username: string
): Promise<{ available: boolean }> {
  return api.get<{ available: boolean }>("/auth/check-username", {
    params: { username },
  });
}

export function updateAvatar(file: File): Promise<User> {
  const formData = new FormData();
  formData.append("avatar", file);

  return api.patch<User>("/auth/profile/avatar", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
}

export function removeAvatar(): Promise<User> {
  return api.delete<User>("/auth/profile/avatar");
}

export function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  return api.patch<{ message: string }>("/auth/change-password", {
    currentPassword,
    newPassword,
  });
}

export function deleteAccount(
  password: string
): Promise<{ message: string }> {
  return api.delete<{ message: string }>("/auth/account", {
    data: { password },
  });
}

export function getBlockedUsers(): Promise<BlockedUser[]> {
  return api.get<BlockedUser[]>("/users/blocked");
}

export function getFriends(): Promise<Friend[]> {
  return api.get<Friend[]>("/users/friends");
}

export function clearChat(conversationId: string): Promise<{ message: string }> {
  return api.post<{ message: string }>(
    `/conversations/${conversationId}/clear`
  );
}

export function unblockUser(
  conversationId: string
): Promise<{ message: string }> {
  return api.patch<{ message: string }>(
    `/conversations/${conversationId}/unblock`
  );
}

export function getIncomingRequests(): Promise<IncomingMessageRequest[]> {
  return api.get<IncomingMessageRequest[]>("/messages/requests");
}

export function getSentRequests(): Promise<ChatConversation[]> {
  return api.get<ChatConversation[]>("/messages/requests/sent");
}

export function acceptRequest(conversationId: string): Promise<{ message: string }> {
  return api.post<{ message: string }>(
    `/messages/requests/${conversationId}/accept`
  );
}

export function rejectRequest(conversationId: string): Promise<{ message: string }> {
  return api.post<{ message: string }>(
    `/messages/requests/${conversationId}/reject`
  );
}

export function blockRequest(conversationId: string): Promise<{ message: string }> {
  return api.post<{ message: string }>(
    `/messages/requests/${conversationId}/block`
  );
}

export function getChatList(): Promise<ChatConversation[]> {
  return api.get<ChatConversation[]>("/chats");
}

export function removeConnection(conversationId: string): Promise<{ message: string }> {
  return api.delete<{ message: string }>(`/conversations/${conversationId}`);
}

export function blockConnection(conversationId: string): Promise<{ message: string }> {
  return api.post<{ message: string }>(`/conversations/${conversationId}/block`);
}

export function getMessages(conversationId: string): Promise<ChatMessage[]> {
  return api.get<ChatMessage[]>(`/conversations/${conversationId}/messages`);
}

export function getConversationHeaderInfo(
  conversationId: string
): Promise<ConversationHeaderInfo> {
  return api.get<ConversationHeaderInfo>(
    `/conversations/${conversationId}/info`
  );
}

export function markConversationRead(conversationId: string): Promise<void> {
  return api.post<void>(`/conversations/${conversationId}/read`);
}

export function sendMessage(
  conversationId: string,
  params: {
    content?: string;
    image?: File;
    replyToMessageId?: string;
    replyToStatusId?: string;
  }
): Promise<ChatMessage> {
  const formData = new FormData();

  const trimmedContent = params.content?.trim();
  if (trimmedContent) {
    formData.append("content", trimmedContent);
  }

  if (params.image) {
    formData.append("image", params.image);
  }

  if (params.replyToMessageId) {
    formData.append("replyToMessageId", params.replyToMessageId);
  }

  if (params.replyToStatusId) {
    formData.append("replyToStatusId", params.replyToStatusId);
  }

  return api.post<ChatMessage>(
    `/conversations/${conversationId}/messages`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );
}

export function sendVoiceMessage(
  conversationId: string,
  params: {
    audio: Blob;
    durationSeconds: number;
    replyToMessageId?: string;
    replyToStatusId?: string;
  }
): Promise<ChatMessage> {
  const formData = new FormData();
  const extension = params.audio.type.includes("ogg")
    ? "ogg"
    : params.audio.type.includes("mp4")
      ? "m4a"
      : "webm";

  formData.append(
    "audio",
    params.audio,
    `voice-message.${extension}`
  );
  formData.append("durationSeconds", String(params.durationSeconds));

  if (params.replyToMessageId) {
    formData.append("replyToMessageId", params.replyToMessageId);
  }

  if (params.replyToStatusId) {
    formData.append("replyToStatusId", params.replyToStatusId);
  }

  return api.post<ChatMessage>(
    `/conversations/${conversationId}/messages/voice`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );
}

export function sendVideoMessage(
  conversationId: string,
  params: {
    video: File;
    durationSeconds: number;
    replyToMessageId?: string;
    replyToStatusId?: string;
    onUploadProgress?: (percent: number) => void;
  }
): Promise<ChatMessage> {
  const formData = new FormData();
  formData.append("video", params.video);
  formData.append("durationSeconds", String(Math.ceil(params.durationSeconds)));

  if (params.replyToMessageId) {
    formData.append("replyToMessageId", params.replyToMessageId);
  }

  if (params.replyToStatusId) {
    formData.append("replyToStatusId", params.replyToStatusId);
  }

  return api.post<ChatMessage>(
    `/conversations/${conversationId}/messages/video`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (event) => {
        if (!params.onUploadProgress || !event.total) {
          return;
        }

        params.onUploadProgress(
          Math.round((event.loaded * 100) / event.total)
        );
      },
    }
  );
}

export function deleteMessageForMe(messageId: string): Promise<void> {
  return api.delete<void>(`/messages/${messageId}/for-me`);
}

export function editMessage(
  messageId: string,
  content: string
): Promise<ChatMessage> {
  return api.patch<ChatMessage>(`/messages/${messageId}`, { content });
}

export function unsendMessage(messageId: string): Promise<{ message: string }> {
  return api.post<{ message: string }>(`/messages/${messageId}/unsend`);
}

export function toggleReaction(
  messageId: string,
  emoji: string
): Promise<void> {
  return api.post<void>(`/messages/${messageId}/reactions`, { emoji });
}

export function getMessageInfo(messageId: string): Promise<MemberReadStatus[]> {
  return api.get<MemberReadStatus[]>(`/messages/${messageId}/info`);
}

export function createGroup(
  name: string,
  memberIds: string[]
): Promise<GroupConversation> {
  return api.post<GroupConversation>("/groups", { name, memberIds });
}

export function getGroupInfo(conversationId: string): Promise<GroupInfoResponse> {
  return api.get<GroupInfoResponse>(`/groups/${conversationId}`);
}

export function updateGroupInfo(
  conversationId: string,
  name: string
): Promise<void> {
  return api.patch<void>(`/groups/${conversationId}`, { name });
}

export function updateGroupAvatar(
  conversationId: string,
  file: File
): Promise<GroupConversation> {
  const formData = new FormData();
  formData.append("avatar", file);

  return api.patch<GroupConversation>(`/groups/${conversationId}/avatar`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
}

export function addGroupMembers(
  conversationId: string,
  memberIds: string[]
): Promise<void> {
  return api.post<void>(`/groups/${conversationId}/members`, { memberIds });
}

export function removeGroupMember(
  conversationId: string,
  userId: string
): Promise<void> {
  return api.delete<void>(`/groups/${conversationId}/members/${userId}`);
}

export function leaveGroup(conversationId: string): Promise<void> {
  return api.post<void>(`/groups/${conversationId}/leave`);
}

export function updateMemberRole(
  conversationId: string,
  userId: string,
  role: "admin" | "member"
): Promise<void> {
  return api.patch<void>(`/groups/${conversationId}/members/${userId}/role`, {
    role,
  });
}

export function getPrivacySettings(): Promise<PrivacySettings> {
  return api.get<PrivacySettings>("/settings/privacy");
}

export function updatePrivacySetting(
  field: PrivacyApiField,
  visibility: PrivacyVisibility
): Promise<{ message: string }> {
  return api.patch<{ message: string }>(`/settings/privacy/${field}`, {
    visibility,
  });
}

export function getPrivacyExceptions(
  field: PrivacyApiField
): Promise<PrivacyExceptionUser[]> {
  return api.get<PrivacyExceptionUser[]>(
    `/settings/privacy/${field}/exceptions`
  );
}

export function addPrivacyException(
  field: PrivacyApiField,
  excludedUserId: string
): Promise<{ message: string }> {
  return api.post<{ message: string }>(
    `/settings/privacy/${field}/exceptions`,
    { excludedUserId }
  );
}

export function removePrivacyException(
  field: PrivacyApiField,
  excludedUserId: string
): Promise<{ message: string }> {
  return api.delete<{ message: string }>(
    `/settings/privacy/${field}/exceptions/${excludedUserId}`
  );
}

export function createStatus(
  formData: FormData,
  options?: { onUploadProgress?: (percent: number) => void }
): Promise<Status> {
  return api.post<Status>("/statuses", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    onUploadProgress: (event) => {
      if (!options?.onUploadProgress || !event.total) {
        return;
      }

      options.onUploadProgress(
        Math.round((event.loaded * 100) / event.total)
      );
    },
  });
}

export function getMyStatuses(): Promise<Status[]> {
  return api.get<Status[]>("/statuses/me");
}

export function getStatusFeed(): Promise<StatusFeedEntry[]> {
  return api.get<StatusFeedEntry[]>("/statuses/feed");
}

export function markStatusViewed(
  statusId: string
): Promise<{ message: string }> {
  return api.post<{ message: string }>(`/statuses/${statusId}/view`);
}

export function getStatusViewers(
  statusId: string
): Promise<StatusViewerEntry[]> {
  return api.get<StatusViewerEntry[]>(`/statuses/${statusId}/viewers`);
}

export function deleteStatus(statusId: string): Promise<{ message: string }> {
  return api.delete<{ message: string }>(`/statuses/${statusId}`);
}

export function pinConversation(
  conversationId: string
): Promise<{ message: string }> {
  return api.post<{ message: string }>(
    `/conversations/${conversationId}/pin`
  );
}

export function unpinConversation(
  conversationId: string
): Promise<{ message: string }> {
  return api.delete<{ message: string }>(
    `/conversations/${conversationId}/pin`
  );
}

export {
  muteConversation,
  unmuteConversation,
  updateNotificationSound,
} from "./notifications";

export interface ConversationBackgroundResponse {
  message: string;
  backgroundType: "default" | "preset" | "custom";
  backgroundValue?: string;
}

export function setConversationBackgroundPreset(
  conversationId: string,
  presetId: string
): Promise<ConversationBackgroundResponse> {
  return api.put<ConversationBackgroundResponse>(
    `/conversations/${conversationId}/background`,
    { type: "preset", value: presetId }
  );
}

export function setConversationBackgroundCustom(
  conversationId: string,
  image: File
): Promise<ConversationBackgroundResponse> {
  const formData = new FormData();
  formData.append("type", "custom");
  formData.append("image", image);

  return api.put<ConversationBackgroundResponse>(
    `/conversations/${conversationId}/background`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );
}

export function resetConversationBackground(
  conversationId: string
): Promise<ConversationBackgroundResponse> {
  return api.delete<ConversationBackgroundResponse>(
    `/conversations/${conversationId}/background`
  );
}

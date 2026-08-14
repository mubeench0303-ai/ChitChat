import api from "@/lib/axios";

export function muteConversation(
  conversationId: string
): Promise<{ message: string }> {
  return api.post<{ message: string }>(
    `/conversations/${conversationId}/mute`
  );
}

export function unmuteConversation(
  conversationId: string
): Promise<{ message: string }> {
  return api.delete<{ message: string }>(
    `/conversations/${conversationId}/mute`
  );
}

export function updateNotificationSound(
  enabled: boolean
): Promise<{ message: string }> {
  return api.patch<{ message: string }>("/settings/notification-sound", {
    enabled,
  });
}

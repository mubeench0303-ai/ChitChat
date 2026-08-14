"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { getChatList } from "@/lib/api/auth";
import { playNotificationSound } from "@/lib/notification-sound";
import { subscribe } from "@/lib/ws/socket";
import { useAuthStore } from "@/store/auth-store";
import { useChatListStore } from "@/store/chat-list-store";
import type { ChatConversation, ChatMessage, NewMessageEventPayload } from "@/types";

function getOpenConversationId(pathname: string) {
  const match = pathname.match(/^\/chat\/([^/]+)$/);
  return match?.[1] ?? null;
}

function getConversationDisplayName(conversation: ChatConversation) {
  if (conversation.type === "group") {
    return conversation.groupName?.trim() || "Group";
  }

  return conversation.requesterFullName?.trim() || "Chat";
}

function formatNotificationPreview(message: ChatMessage) {
  if (message.isUnsent) {
    return "Message unsent";
  }

  if (message.imageUrl) {
    return "📷 Photo";
  }

  if (message.type === "voice" || message.audioUrl) {
    return "🎤 Voice message";
  }

  const content = message.content.trim();
  if (!content) {
    return "New message";
  }

  if (content.length <= 72) {
    return content;
  }

  return `${content.slice(0, 71)}…`;
}

function shouldSuppressNotification(
  event: NewMessageEventPayload,
  currentUserId: string,
  openConversationId: string | null
) {
  if (event.message.senderId === currentUserId) {
    return true;
  }

  if (openConversationId === event.conversationId) {
    return true;
  }

  return useChatListStore.getState().isMuted(event.conversationId);
}

function showNewMessageNotification(
  event: NewMessageEventPayload,
  router: ReturnType<typeof useRouter>
) {
  const { getConversation } = useChatListStore.getState();
  const conversation = getConversation(event.conversationId);
  const isGroup = conversation?.type === "group";
  const senderName = event.message.senderName?.trim() || "Someone";
  const title =
    isGroup && conversation
      ? getConversationDisplayName(conversation)
      : senderName;
  const description = isGroup
    ? `${senderName}: ${formatNotificationPreview(event.message)}`
    : formatNotificationPreview(event.message);

  toast(title, {
    description,
    className: "cursor-pointer",
    onClick: () => {
      router.push(`/chat/${event.conversationId}`);
    },
  });

  const soundEnabled =
    useAuthStore.getState().user?.notificationSoundEnabled ?? true;
  if (soundEnabled) {
    void playNotificationSound();
  }
}

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const setStoreConversations = useChatListStore((state) => state.setConversations);

  useEffect(() => {
    if (!currentUserId) {
      setStoreConversations([]);
      return;
    }

    let cancelled = false;

    async function loadChatList() {
      try {
        const conversations = await getChatList();
        if (!cancelled) {
          setStoreConversations(conversations);
        }
      } catch {
        if (!cancelled) {
          setStoreConversations([]);
        }
      }
    }

    void loadChatList();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, setStoreConversations]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    const unsubscribe = subscribe("new_message", (payload) => {
      const event = payload as NewMessageEventPayload;
      const openConversationId = getOpenConversationId(pathname);

      if (
        shouldSuppressNotification(event, currentUserId, openConversationId)
      ) {
        return;
      }

      showNewMessageNotification(event, router);
    });

    return unsubscribe;
  }, [currentUserId, pathname, router]);

  return children;
}

import { create } from "zustand";

import type { ChatConversation } from "@/types";

interface ChatListState {
  conversations: ChatConversation[];
  mutedConversationIds: Record<string, true>;
  setConversations: (conversations: ChatConversation[]) => void;
  setMuted: (conversationId: string, isMuted: boolean) => void;
  isMuted: (conversationId: string) => boolean;
  getConversation: (conversationId: string) => ChatConversation | undefined;
}

function mutedIdsFromConversations(conversations: ChatConversation[]) {
  return Object.fromEntries(
    conversations
      .filter((conversation) => conversation.isMuted)
      .map((conversation) => [conversation.conversationId, true as const])
  );
}

export const useChatListStore = create<ChatListState>((set, get) => ({
  conversations: [],
  mutedConversationIds: {},

  setConversations: (conversations) =>
    set((state) => {
      if (conversations.length === 0) {
        return {
          conversations: [],
          mutedConversationIds: {},
        };
      }

      const apiMutedIds = mutedIdsFromConversations(conversations);

      return {
        conversations: conversations.map((conversation) => ({
          ...conversation,
          isMuted:
            state.mutedConversationIds[conversation.conversationId] === true ||
            apiMutedIds[conversation.conversationId] === true,
        })),
        mutedConversationIds: {
          ...apiMutedIds,
          ...state.mutedConversationIds,
        },
      };
    }),

  setMuted: (conversationId, isMuted) =>
    set((state) => {
      const nextMutedIds = { ...state.mutedConversationIds };

      if (isMuted) {
        nextMutedIds[conversationId] = true;
      } else {
        delete nextMutedIds[conversationId];
      }

      return {
        mutedConversationIds: nextMutedIds,
        conversations: state.conversations.map((conversation) =>
          conversation.conversationId === conversationId
            ? { ...conversation, isMuted }
            : conversation
        ),
      };
    }),

  isMuted: (conversationId) => {
    const state = get();

    if (state.mutedConversationIds[conversationId]) {
      return true;
    }

    return (
      state.conversations.find(
        (conversation) => conversation.conversationId === conversationId
      )?.isMuted ?? false
    );
  },

  getConversation: (conversationId) =>
    get().conversations.find(
      (conversation) => conversation.conversationId === conversationId
    ),
}));

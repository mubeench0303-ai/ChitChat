"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BellOff, Loader2, MoreVertical, Pin, Search, Trash2, Users, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";

import {
  signupGradientBgClass,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
import { CreateGroupDialog } from "@/components/chat/create-group-dialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  blockConnection,
  clearChat,
  getChatList,
  pinConversation,
  removeConnection,
  unpinConversation,
} from "@/lib/api/auth";
import { muteConversation, unmuteConversation } from "@/lib/api/notifications";
import { getApiErrorStatus } from "@/lib/api/errors";
import { subscribe } from "@/lib/ws/socket";
import { useAuthStore } from "@/store/auth-store";
import { useChatListStore } from "@/store/chat-list-store";
import type { ChatConversation, NewMessageEventPayload, PresenceEventPayload } from "@/types";
import { cn } from "@/lib/utils";

type ConfirmAction = "remove" | "block" | "clear";
type ChatFilter = "all" | "unread" | "groups" | "direct";

const DEBOUNCE_MS = 400;
const PIN_LIMIT_MESSAGE =
  "You can only pin up to 3 chats — unpin one first.";

function sortChatList(conversations: ChatConversation[]) {
  return [...conversations].sort((left, right) => {
    const leftPinned = left.isPinned ?? false;
    const rightPinned = right.isPinned ?? false;

    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }

    return (
      new Date(right.latestMessageAt).getTime() -
      new Date(left.latestMessageAt).getTime()
    );
  });
}

const FILTER_OPTIONS: Array<{ id: ChatFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "groups", label: "Groups" },
  { id: "direct", label: "Direct" },
];

function getConversationDisplayName(conversation: ChatConversation) {
  if (conversation.type === "group") {
    return conversation.groupName?.trim() || "Group";
  }

  return conversation.requesterFullName?.trim() || "Chat";
}

function getConversationSearchText(conversation: ChatConversation) {
  if (conversation.type === "group") {
    return conversation.groupName?.trim() || "Group";
  }

  return [
    conversation.requesterFullName,
    conversation.requesterUsername,
  ]
    .filter(Boolean)
    .join(" ");
}

function matchesChatFilter(conversation: ChatConversation, filter: ChatFilter) {
  switch (filter) {
    case "unread":
      return (conversation.unreadCount ?? 0) > 0;
    case "groups":
      return conversation.type === "group";
    case "direct":
      return conversation.type === "direct";
    default:
      return true;
  }
}

function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();

  if (Number.isNaN(diffMs)) {
    return "";
  }

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return "just now";
  }

  if (diffMin < 60) {
    return `${diffMin}m`;
  }

  if (diffHour < 24) {
    return `${diffHour}h`;
  }

  if (diffDay < 7) {
    return `${diffDay}d`;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function truncatePreview(content: string, maxLength = 72) {
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function formatLatestMessagePreview(
  conversation: ChatConversation,
  message: NewMessageEventPayload["message"],
  currentUserId?: string
) {
  const content = message.content.trim();

  if (conversation.type !== "group") {
    return truncatePreview(content);
  }

  const prefix =
    message.senderId === currentUserId
      ? "You"
      : message.senderName?.trim() || "Someone";

  return truncatePreview(`${prefix}: ${content}`);
}

function OnlineDot() {
  return (
    <span
      aria-hidden
      className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-surface-1 bg-success"
    />
  );
}

function formatUnreadBadgeCount(count: number) {
  if (count > 9) {
    return "9+";
  }

  return String(count);
}

function ChatRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3.5">
      <Skeleton className="size-12 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-full max-w-xs" />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Skeleton className="h-3 w-8" />
        <Skeleton className="size-5 rounded-full" />
      </div>
    </div>
  );
}

function ChatListHeader({
  searchQuery,
  activeFilter,
  onSearchChange,
  onFilterChange,
  onNewGroup,
}: {
  searchQuery: string;
  activeFilter: ChatFilter;
  onSearchChange: (value: string) => void;
  onFilterChange: (filter: ChatFilter) => void;
  onNewGroup: () => void;
}) {
  return (
    <header className="mb-6 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[1.2px]">
            <i
              className={cn(
                "block h-0.5 w-[18px] rounded-full",
                signupGradientBgClass
              )}
            />
            <span className={signupGradientTextClass}>Messages</span>
          </span>
          <h1 className="mt-2.5 text-[clamp(1.75rem,5vw,2.25rem)] font-semibold leading-tight tracking-[-0.04em] text-text-primary">
            Chats
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
            Your conversations in one place
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto lg:max-w-md">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
              strokeWidth={2}
            />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search chats..."
              autoComplete="off"
              className="h-9 border-border/70 bg-surface-1/50 pl-9"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 gap-2 bg-accent text-white hover:bg-accent-hover"
            onClick={onNewGroup}
          >
            <UserRoundPlus className="size-4" strokeWidth={2} />
            New Group
          </Button>
        </div>
      </div>

      <div
        className="flex flex-wrap gap-1.5 rounded-xl border border-border/70 bg-surface-1/40 p-1"
        role="tablist"
        aria-label="Filter chats"
      >
        {FILTER_OPTIONS.map((option) => {
          const isActive = activeFilter === option.id;

          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onFilterChange(option.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-ui",
                isActive
                  ? "bg-accent-subtle text-accent shadow-sm"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}

function ChatRow({
  conversation,
  rowError,
  isActionLoading,
  onOpen,
  onViewProfile,
  onRemove,
  onBlock,
  onClear,
  onTogglePin,
  onToggleMute,
}: {
  conversation: ChatConversation;
  rowError: string | null;
  isActionLoading: boolean;
  onOpen: () => void;
  onViewProfile: () => void;
  onRemove: () => void;
  onBlock: () => void;
  onClear: () => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
}) {
  const isGroup = conversation.type === "group";
  const isPinned = conversation.isPinned ?? false;
  const isMuted = conversation.isMuted ?? false;
  const displayName = getConversationDisplayName(conversation);
  const displayAvatarUrl = isGroup
    ? conversation.groupAvatarUrl
    : conversation.requesterAvatarUrl;
  const unreadCount = conversation.unreadCount ?? 0;
  const hasUnread = unreadCount > 0;

  return (
    <div className="rounded-[13px] border border-border/70 bg-surface-1/50 transition-ui hover:bg-surface-1/80">
      <div className="flex items-center gap-3 px-3.5 py-3.5">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <div className="relative shrink-0">
            <Avatar className="size-12">
              {displayAvatarUrl ? (
                <AvatarImage src={displayAvatarUrl} alt={displayName} />
              ) : null}
              <AvatarFallback
                className={cn(
                  "text-sm font-semibold text-white",
                  signupGradientBgClass
                )}
              >
                {isGroup ? (
                  <Users className="size-5" strokeWidth={2} />
                ) : (
                  getInitials(displayName)
                )}
              </AvatarFallback>
            </Avatar>
            {!isGroup && conversation.requesterIsOnline === true ? <OnlineDot /> : null}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text-primary">
              {displayName}
            </p>
            <p
              className={cn(
                "mt-0.5 truncate text-[13px] leading-snug",
                hasUnread
                  ? "font-medium text-text-primary"
                  : "font-normal text-text-secondary"
              )}
            >
              {truncatePreview(conversation.latestMessageContent)}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5 self-start pt-0.5">
            <div className="flex items-center gap-1">
              {isMuted ? (
                <BellOff
                  className="size-3.5 text-text-muted"
                  strokeWidth={2}
                  aria-label="Muted chat"
                />
              ) : null}
              {isPinned ? (
                <Pin
                  className="size-3.5 text-accent"
                  strokeWidth={2}
                  aria-label="Pinned chat"
                />
              ) : null}
              <span className="text-[11px] font-medium text-text-muted">
                {formatRelativeTime(conversation.latestMessageAt)}
              </span>
            </div>
            {hasUnread ? (
              <span
                className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold leading-none text-white"
                aria-label={`${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`}
              >
                {formatUnreadBadgeCount(unreadCount)}
              </span>
            ) : (
              <span className="min-h-5" aria-hidden />
            )}
          </div>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 self-center"
                disabled={isActionLoading}
                aria-label="Conversation options"
              />
            }
          >
            {isActionLoading ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={2} />
            ) : (
              <MoreVertical className="size-4" strokeWidth={2} />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {!isGroup ? (
              <>
                <DropdownMenuItem onClick={onViewProfile}>
                  View Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem onClick={onTogglePin}>
              <Pin className="size-4" strokeWidth={2} />
              {isPinned ? "Unpin Chat" : "Pin Chat"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleMute}>
              <BellOff className="size-4" strokeWidth={2} />
              {isMuted ? "Unmute Notifications" : "Mute Notifications"}
            </DropdownMenuItem>
            {!isGroup ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onClear}>
                  <Trash2 className="size-4" strokeWidth={2} />
                  Delete All Chat
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onRemove}>
                  Remove Connection
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onBlock}>
                  Block User
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {rowError ? (
        <p className="border-t border-border/70 px-3.5 py-2 text-[13px] leading-relaxed text-accent">
          {rowError}
        </p>
      ) : null}
    </div>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.user);
  const setStoreConversations = useChatListStore((state) => state.setConversations);
  const setStoreMuted = useChatListStore((state) => state.setMuted);

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});
  const [confirmAction, setConfirmAction] = useState<{
    type: ConfirmAction;
    conversation: ChatConversation;
  } | null>(null);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ChatFilter>("all");
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  const filteredConversations = useMemo(() => {
    const normalizedSearch = debouncedSearchQuery.trim().toLowerCase();

    return conversations.filter((conversation) => {
      if (!matchesChatFilter(conversation, activeFilter)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return getConversationSearchText(conversation)
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [activeFilter, conversations, debouncedSearchQuery]);

  const hasActiveFilters =
    activeFilter !== "all" || debouncedSearchQuery.trim().length > 0;
  useEffect(() => {
    let cancelled = false;

    async function loadChats() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getChatList();
        if (!cancelled) {
          setConversations(sortChatList(data));
          setStoreConversations(sortChatList(data));
        }
      } catch (loadError) {
        if (!cancelled) {
          setConversations([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Something went wrong"
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadChats();

    return () => {
      cancelled = true;
    };
  }, [setStoreConversations]);

  useEffect(() => {
    const unsubscribe = subscribe("new_message", (payload) => {
      const event = payload as NewMessageEventPayload;

      setConversations((current) => {
        const index = current.findIndex(
          (item) => item.conversationId === event.conversationId
        );

        if (index === -1) {
          return current;
        }

        const isIncoming = event.message.senderId !== currentUser?.id;

        const updatedConversation: ChatConversation = {
          ...current[index],
          latestMessageContent: formatLatestMessagePreview(
            current[index],
            event.message,
            currentUser?.id
          ),
          latestMessageAt: event.message.createdAt,
          unreadCount: isIncoming
            ? (current[index].unreadCount ?? 0) + 1
            : current[index].unreadCount ?? 0,
        };

        const next = sortChatList([
          updatedConversation,
          ...current.filter((_, itemIndex) => itemIndex !== index),
        ]);
        setStoreConversations(next);
        return next;
      });
    });

    return unsubscribe;
  }, [currentUser?.id, setStoreConversations]);

  useEffect(() => {
    const unsubscribe = subscribe("presence", (payload) => {
      const event = payload as PresenceEventPayload;

      setConversations((current) =>
        current.map((item) => {
          if (item.type !== "direct" || item.requesterId !== event.userId) {
            return item;
          }

          if (
            item.requesterIsOnline === undefined &&
            item.requesterLastSeen === undefined
          ) {
            return item;
          }

          return {
            ...item,
            requesterIsOnline: event.isOnline,
            requesterLastSeen: event.isOnline
              ? item.requesterLastSeen
              : event.lastSeen ?? item.requesterLastSeen,
          };
        })
      );
    });

    return unsubscribe;
  }, []);

  async function handleTogglePin(conversation: ChatConversation) {
    const conversationId = conversation.conversationId;
    const shouldPin = !(conversation.isPinned ?? false);

    setPendingActions((current) => ({ ...current, [conversationId]: true }));
    setRowErrors((current) => ({ ...current, [conversationId]: null }));

    const previousConversations = conversations;

    setConversations((current) => {
      const next = sortChatList(
        current.map((item) =>
          item.conversationId === conversationId
            ? { ...item, isPinned: shouldPin }
            : item
        )
      );
      setStoreConversations(next);
      return next;
    });

    try {
      if (shouldPin) {
        await pinConversation(conversationId);
        toast.success("Chat pinned");
      } else {
        await unpinConversation(conversationId);
        toast.success("Chat unpinned");
      }
    } catch (actionError) {
      setConversations(previousConversations);
      setStoreConversations(previousConversations);

      const message =
        actionError instanceof Error ? actionError.message : "Something went wrong";

      if (shouldPin && getApiErrorStatus(actionError) === 400) {
        toast.error(PIN_LIMIT_MESSAGE);
      } else {
        toast.error(message);
      }
    } finally {
      setPendingActions((current) => ({ ...current, [conversationId]: false }));
    }
  }

  async function handleToggleMute(conversation: ChatConversation) {
    const conversationId = conversation.conversationId;
    const shouldMute = !(conversation.isMuted ?? false);

    setPendingActions((current) => ({ ...current, [conversationId]: true }));
    setRowErrors((current) => ({ ...current, [conversationId]: null }));

    const previousConversations = conversations;

    setConversations((current) => {
      const next = current.map((item) =>
        item.conversationId === conversationId
          ? { ...item, isMuted: shouldMute }
          : item
      );
      setStoreConversations(next);
      return next;
    });
    setStoreMuted(conversationId, shouldMute);

    try {
      if (shouldMute) {
        await muteConversation(conversationId);
        toast.success("Notifications muted");
      } else {
        await unmuteConversation(conversationId);
        toast.success("Notifications unmuted");
      }
    } catch (actionError) {
      setStoreMuted(conversationId, !shouldMute);
      setConversations(previousConversations);
      setStoreConversations(previousConversations);

      const message =
        actionError instanceof Error ? actionError.message : "Something went wrong";
      toast.error(message);
    } finally {
      setPendingActions((current) => ({ ...current, [conversationId]: false }));
    }
  }

  async function handleConfirmAction() {
    if (!confirmAction) {
      return;
    }

    const { type, conversation } = confirmAction;
    const conversationId = conversation.conversationId;

    setIsConfirmLoading(true);
    setPendingActions((current) => ({ ...current, [conversationId]: true }));
    setRowErrors((current) => ({ ...current, [conversationId]: null }));

    try {
      if (type === "remove") {
        await removeConnection(conversationId);
      } else if (type === "block") {
        await blockConnection(conversationId);
      } else {
        await clearChat(conversationId);
        toast.success("Chat cleared for you.");
      }

      setConversations((current) =>
        current.filter((item) => item.conversationId !== conversationId)
      );
      setConfirmAction(null);
    } catch (actionError) {
      const message =
        actionError instanceof Error ? actionError.message : "Something went wrong";
      if (type === "clear") {
        toast.error(message);
      } else {
        setRowErrors((current) => ({ ...current, [conversationId]: message }));
      }
      setConfirmAction(null);
    } finally {
      setIsConfirmLoading(false);
      setPendingActions((current) => ({ ...current, [conversationId]: false }));
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <ChatListHeader
          searchQuery={searchQuery}
          activeFilter={activeFilter}
          onSearchChange={setSearchQuery}
          onFilterChange={setActiveFilter}
          onNewGroup={() => setIsCreateGroupOpen(true)}
        />

        <div className="flex-1 space-y-2.5">
          {error ? (
            <p className="rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3 text-[13px] leading-relaxed text-accent">
              {error}
            </p>
          ) : null}

          {isLoading ? (
            <>
              <ChatRowSkeleton />
              <ChatRowSkeleton />
              <ChatRowSkeleton />
            </>
          ) : null}

          {!isLoading && filteredConversations.length > 0
            ? filteredConversations.map((conversation) => (
                <ChatRow
                  key={conversation.conversationId}
                  conversation={conversation}
                  rowError={rowErrors[conversation.conversationId] ?? null}
                  isActionLoading={pendingActions[conversation.conversationId] ?? false}
                  onOpen={() =>
                    router.push(
                      `/chat/${encodeURIComponent(conversation.conversationId)}`
                    )
                  }
                  onViewProfile={() => {
                    if (
                      conversation.type !== "direct" ||
                      !conversation.requesterUsername
                    ) {
                      return;
                    }

                    router.push(
                      `/users/${encodeURIComponent(conversation.requesterUsername)}`
                    );
                  }}
                  onRemove={() =>
                    setConfirmAction({ type: "remove", conversation })
                  }
                  onBlock={() =>
                    setConfirmAction({ type: "block", conversation })
                  }
                  onClear={() =>
                    setConfirmAction({ type: "clear", conversation })
                  }
                  onTogglePin={() => void handleTogglePin(conversation)}
                  onToggleMute={() => void handleToggleMute(conversation)}
                />
              ))
            : null}

          {!isLoading && !error && conversations.length === 0 ? (
            <div className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-3.5 py-12 text-center">
              <p className="text-sm font-medium text-text-secondary">
                No conversations yet.
              </p>
              <p className="mt-1 text-[13px] text-text-muted">
                Accepted message requests will appear here.
              </p>
            </div>
          ) : null}

          {!isLoading &&
          !error &&
          conversations.length > 0 &&
          filteredConversations.length === 0 &&
          hasActiveFilters ? (
            <div className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-3.5 py-12 text-center">
              <p className="text-sm font-medium text-text-secondary">
                No chats match
              </p>
              <p className="mt-1 text-[13px] text-text-muted">
                Try a different search term or filter.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open && !isConfirmLoading) {
            setConfirmAction(null);
          }
        }}
      >
        <DialogContent showCloseButton={!isConfirmLoading} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === "remove"
                ? "Remove this connection?"
                : confirmAction?.type === "block"
                  ? "Block this user?"
                  : "Delete all chat?"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "remove"
                ? "Remove this connection? You can only reconnect via a new message request."
                : confirmAction?.type === "block"
                  ? "They won't be able to message you unless you unblock them later."
                  : "This clears the chat history on your side only. The other person's messages and your connection stay unchanged, and this can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t-0 bg-transparent sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isConfirmLoading}
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirmAction?.type === "block" ? "destructive" : "default"}
              disabled={isConfirmLoading}
              onClick={() => void handleConfirmAction()}
            >
              {isConfirmLoading ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2} />
              ) : confirmAction?.type === "remove" ? (
                "Remove"
              ) : confirmAction?.type === "block" ? (
                "Block"
              ) : (
                "Delete All Chat"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateGroupDialog
        open={isCreateGroupOpen}
        onOpenChange={setIsCreateGroupOpen}
      />
    </div>
  );
}
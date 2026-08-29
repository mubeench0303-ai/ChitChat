"use client";

import { signupGradientBgClass } from "@/components/auth/signup-submit-button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

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

export interface ConversationPreviewRowData {
  conversationId: string;
  displayName: string;
  avatarUrl?: string | null;
  latestMessageContent: string;
  latestMessageAt: string;
  isOnline?: boolean;
}

export function ConversationPreviewRow({
  conversation,
  onOpen,
  className,
  index = 0,
}: {
  conversation: ConversationPreviewRowData;
  onOpen: () => void;
  className?: string;
  index?: number;
}) {
  return (
    <div
      style={{ animationDelay: `${index * 0.04}s` }}
      className={cn(
        "group/row animate-row-in rounded-[13px] border border-border/70 bg-surface-1/50 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-surface-1/80 hover:shadow-sm active:translate-y-0 active:scale-[0.99]",
        className
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left"
      >
        <div className="relative shrink-0">
          <Avatar className="size-11 transition-transform duration-300 group-hover/row:scale-105 group-hover/row:-rotate-2">
            {conversation.avatarUrl ? (
              <AvatarImage
                src={conversation.avatarUrl}
                alt={conversation.displayName}
              />
            ) : null}
            <AvatarFallback
              className={cn(
                "text-sm font-semibold text-white",
                signupGradientBgClass
              )}
            >
              {getInitials(conversation.displayName)}
            </AvatarFallback>
          </Avatar>
          {conversation.isOnline ? (
            <span className="absolute right-0 bottom-0 size-2.5 animate-dot-pulse rounded-full border-2 border-surface-1 bg-success" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-text-primary transition-colors group-hover/row:text-accent">
              {conversation.displayName}
            </p>
            <span className="shrink-0 font-mono text-[11px] text-text-muted">
              {formatRelativeTime(conversation.latestMessageAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[13px] leading-relaxed text-text-secondary">
            {truncatePreview(conversation.latestMessageContent)}
          </p>
        </div>
      </button>
    </div>
  );
}

export function ConversationPreviewRowSkeleton() {
  return (
    <div className="rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3.5">
      <div className="flex items-center gap-3">
        <div className="size-11 shrink-0 rounded-full bg-muted animate-pulse" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          <div className="h-3 w-full max-w-xs rounded bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  );
}

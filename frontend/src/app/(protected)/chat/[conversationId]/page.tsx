"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, ImageIcon, Info, Loader2, Mic, MoreVertical, Palette, Send, Smile, Sparkles, Users, Video, X } from "lucide-react";
import { toast } from "sonner";

import {
  signupGradientBgClass,
} from "@/components/auth/signup-submit-button";
import { ChatBackgroundDialog } from "@/components/chat/chat-background-dialog";
import { VideoMessageBubble } from "@/components/chat/video-message-bubble";
import { VoiceMessageBubble } from "@/components/chat/voice-message-bubble";
import { VoicePlaybackProvider } from "@/components/chat/voice-playback-context";
import { VoiceRecorder } from "@/components/chat/voice-recorder";
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
import { Skeleton } from "@/components/ui/skeleton";
import { getConversationHeaderInfo, getGroupInfo, getMessageInfo, getMessages, sendMessage, sendVideoMessage, sendVoiceMessage, deleteMessageForMe, editMessage, unsendMessage, markConversationRead, toggleReaction, acceptRequest, rejectRequest, blockRequest } from "@/lib/api/auth";
import { sendMessageRequest } from "@/lib/api/conversations";
import { getApiErrorCode, getApiErrorStatus } from "@/lib/api/errors";
import { getChatBackgroundStyle } from "@/lib/chat-backgrounds";
import { chatMessageSchema } from "@/lib/validations/conversation";
import {
  MESSAGE_IMAGE_ACCEPT,
  validateMessageImageFile,
} from "@/lib/validations/image";
import {
  validateVoiceMessageBlob,
} from "@/lib/validations/audio";
import {
  MESSAGE_VIDEO_ACCEPT,
  captureVideoThumbnail,
  readVideoFileMetadata,
  validateVideoMessageFile,
} from "@/lib/validations/video";
import {
  REACTION_EMOJIS,
  getReactionAsset,
} from "@/lib/reactions";
import { subscribe, send } from "@/lib/ws/socket";
import { useAuthStore } from "@/store/auth-store";
import type {
  ChatMessage,
  ConversationHeaderInfo,
  ConversationReadEventPayload,
  GroupMemberDetail,
  MemberDeliveryStatus,
  MemberReadStatus,
  MessageDeliveredEventPayload,
  MessageDeliveryStatus,
  MessageEditedEventPayload,
  MessageReactionSummary,
  MessageReplyTo,
  MessageReplyToStatus,
  MessageTickStatus,
  MessageTickUpdatedEventPayload,
  MessageUnsentEventPayload,
  NewMessageEventPayload,
  PresenceEventPayload,
  ReactionUpdatedEventPayload,
  TypingEventPayload,
} from "@/types";
import { cn } from "@/lib/utils";

function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatMessageTime(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLastSeen(dateString: string) {
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
    return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  }

  if (diffHour < 24) {
    return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  }

  if (diffDay < 7) {
    return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function OnlineDot() {
  return (
    <span
      aria-hidden
      className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background bg-green-500"
    />
  );
}

function MessageSkeleton({
  isSent,
  showSenderHeader = false,
}: {
  isSent: boolean;
  showSenderHeader?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full",
        isSent ? "justify-end" : "justify-start"
      )}
    >
      <div className="max-w-[min(100%,22rem)] space-y-1.5">
        {showSenderHeader ? (
          <div className="mb-2 flex items-center gap-2 px-0.5">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>
        ) : null}
        <Skeleton
          className={cn(
            "h-10 rounded-2xl",
            isSent ? "ml-auto w-40 rounded-br-md" : "w-48 rounded-bl-md"
          )}
        />
        <Skeleton className={cn("h-3 w-12", isSent ? "ml-auto" : "mr-auto")} />
      </div>
    </div>
  );
}

const TYPING_STOP_MS = 2000;
const TYPING_HIDE_MS = 5000;
const EDIT_WINDOW_MS = 10 * 60 * 1000;
const UNSEND_WINDOW_MS = 60 * 60 * 1000;
const UNSENT_MESSAGE_PLACEHOLDER = "This message was unsent";
const DELETED_USER_DISPLAY_NAME = "Deleted User";
const MAX_TEXTAREA_HEIGHT_PX = 120;
const SCROLL_NEAR_BOTTOM_THRESHOLD_PX = 120;

function isMessagesNearBottom(container: HTMLDivElement) {
  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;

  return distanceFromBottom <= SCROLL_NEAR_BOTTOM_THRESHOLD_PX;
}

function scrollMessagesToBottom(
  container: HTMLDivElement | null,
  _endElement: HTMLDivElement | null,
  options?: { behavior?: ScrollBehavior; force?: boolean }
) {
  const { behavior = "smooth", force = false } = options ?? {};

  if (!container) {
    return;
  }

  if (force || isMessagesNearBottom(container)) {
    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }
}

function ReactionEmojiImage({
  emoji,
  size,
}: {
  emoji: string;
  size: 16 | 24;
}) {
  const asset = getReactionAsset(emoji);

  if (!asset) {
    return <span aria-hidden>{emoji}</span>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.src}
      alt={asset.label}
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

function getUserReactionEmoji(
  reactions: MessageReactionSummary[] | undefined,
  userId: string
) {
  if (!reactions) {
    return null;
  }

  for (const reaction of reactions) {
    if (reaction.userIds.includes(userId)) {
      return reaction.emoji;
    }
  }

  return null;
}

function applyReactionToggle(
  message: ChatMessage,
  userId: string,
  emoji: string
): ChatMessage {
  const reactions = [...(message.reactions ?? [])];
  const currentEmoji = getUserReactionEmoji(reactions, userId);

  if (currentEmoji === emoji) {
    const next = reactions
      .map((reaction) => {
        if (reaction.emoji !== emoji) {
          return reaction;
        }

        const userIds = reaction.userIds.filter((id) => id !== userId);
        if (userIds.length === 0) {
          return null;
        }

        return { ...reaction, userIds, count: userIds.length };
      })
      .filter((reaction): reaction is MessageReactionSummary => reaction !== null);

    return { ...message, reactions: next };
  }

  const withoutUser = reactions
    .map((reaction) => {
      const userIds = reaction.userIds.filter((id) => id !== userId);
      if (userIds.length === 0) {
        return null;
      }

      return { ...reaction, userIds, count: userIds.length };
    })
    .filter((reaction): reaction is MessageReactionSummary => reaction !== null);

  const existing = withoutUser.find((reaction) => reaction.emoji === emoji);
  if (existing) {
    return {
      ...message,
      reactions: withoutUser.map((reaction) =>
        reaction.emoji === emoji
          ? {
              ...reaction,
              userIds: [...reaction.userIds, userId],
              count: reaction.userIds.length + 1,
            }
          : reaction
      ),
    };
  }

  return {
    ...message,
    reactions: [...withoutUser, { emoji, count: 1, userIds: [userId] }],
  };
}

function MessageReactionsSummary({
  reactions,
  currentUserId,
  isSent,
  messageId,
  onToggleReaction,
}: {
  reactions: MessageReactionSummary[];
  currentUserId?: string;
  isSent: boolean;
  messageId: string;
  onToggleReaction: (messageId: string, emoji: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-1 px-0.5",
        isSent ? "justify-end" : "justify-start"
      )}
    >
      {reactions.map((reaction) => {
        const isOwn = currentUserId
          ? reaction.userIds.includes(currentUserId)
          : false;

        return (
          <button
            key={reaction.emoji}
            type="button"
            disabled={!isOwn}
            onClick={() => {
              if (isOwn) {
                onToggleReaction(messageId, reaction.emoji);
              }
            }}
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-surface-1/80 px-1.5 py-0.5 text-[11px] leading-none",
              isOwn && "cursor-pointer transition-colors hover:bg-surface-1",
              !isOwn && "cursor-default"
            )}
            aria-label={
              isOwn
                ? `Remove ${getReactionAsset(reaction.emoji)?.label ?? reaction.emoji} reaction`
                : `${getReactionAsset(reaction.emoji)?.label ?? reaction.emoji} reaction count ${reaction.count}`
            }
          >
            <ReactionEmojiImage emoji={reaction.emoji} size={16} />
            <span className="text-text-muted">{reaction.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function applyUnsentToMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    content: UNSENT_MESSAGE_PLACEHOLDER,
    imageUrl: null,
    audioUrl: null,
    audioDurationSeconds: null,
    videoUrl: null,
    videoDurationSeconds: null,
    isUnsent: true,
    isEdited: false,
  };
}

function getReplyPreviewText(message: ChatMessage) {
  if (message.isUnsent) {
    return UNSENT_MESSAGE_PLACEHOLDER;
  }

  if (message.type === "voice" || message.audioUrl) {
    return "Voice message";
  }

  if (message.type === "video" || message.videoUrl) {
    return "Video message";
  }

  if (message.imageUrl && !message.content.trim()) {
    return "Photo";
  }

  return truncateReplyContent(message.content);
}

function getReplyToPreviewText(replyTo: MessageReplyTo) {
  if (replyTo.isUnsent) {
    return UNSENT_MESSAGE_PLACEHOLDER;
  }

  if (replyTo.type === "voice" || replyTo.audioUrl) {
    return "Voice message";
  }

  if (replyTo.type === "video" || replyTo.videoUrl) {
    return "Video message";
  }

  if ((replyTo.type === "image" || replyTo.imageUrl) && !replyTo.content.trim()) {
    return "Photo";
  }

  return truncateReplyContent(replyTo.content);
}

function isVoiceReplyTarget(target: {
  type?: string;
  audioUrl?: string | null;
}) {
  return target.type === "voice" || Boolean(target.audioUrl);
}

function isVideoReplyTarget(target: {
  type?: string;
  videoUrl?: string | null;
}) {
  return target.type === "video" || Boolean(target.videoUrl);
}

function isImageReplyTarget(target: {
  type?: string;
  imageUrl?: string | null;
  content?: string;
}) {
  return (
    target.type === "image" ||
    Boolean(target.imageUrl && !target.content?.trim())
  );
}

const chatTextareaClassName =
  "w-full min-w-0 resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-[13px] leading-relaxed transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

function adjustTextareaHeight(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
}

function truncateReplyContent(content: string, maxLength = 80) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function getReplySenderLabel(
  senderId: string,
  currentUserId?: string,
  participantName?: string,
  senderNames?: Map<string, string>
) {
  if (senderId === currentUserId) {
    return "You";
  }

  return senderNames?.get(senderId) ?? participantName ?? "Them";
}

function MessageStatusTicks({ status }: { status: MessageDeliveryStatus | MessageTickStatus }) {
  if (status === "sent") {
    return <Check className="size-3 shrink-0 text-text-muted" strokeWidth={2} />;
  }

  return (
    <CheckCheck
      className={cn(
        "size-3.5 shrink-0",
        status === "seen" ? "text-blue-500" : "text-text-muted"
      )}
      strokeWidth={2}
    />
  );
}

function MemberInfoStatusTick({ status }: { status: MemberDeliveryStatus }) {
  if (status === "not_delivered") {
    return <Check className="size-3 shrink-0 text-text-muted/60" strokeWidth={2} />;
  }

  return (
    <CheckCheck
      className={cn(
        "size-3.5 shrink-0",
        status === "seen" ? "text-blue-500" : "text-text-muted"
      )}
      strokeWidth={2}
    />
  );
}

function getMemberStatusLabel(member: MemberReadStatus) {
  if (member.status === "seen" && member.readAt) {
    return `Seen at ${formatMessageTime(member.readAt)}`;
  }

  if (member.status === "delivered" && member.deliveredAt) {
    return `Delivered at ${formatMessageTime(member.deliveredAt)}`;
  }

  return "Not delivered yet";
}

function MessageInfoMemberRow({
  member,
  showSeparateTimestamps = false,
}: {
  member: MemberReadStatus;
  showSeparateTimestamps?: boolean;
}) {
  const statusLines = showSeparateTimestamps ? (
    !member.deliveredAt && !member.readAt ? (
      <p className="mt-0.5 text-[11px] text-text-muted">Not delivered yet</p>
    ) : (
      <div className="mt-0.5 space-y-0.5">
        {member.deliveredAt ? (
          <p className="text-[11px] text-text-muted">
            Delivered at {formatMessageTime(member.deliveredAt)}
          </p>
        ) : null}
        {member.readAt ? (
          <p className="text-[11px] text-text-muted">
            Seen at {formatMessageTime(member.readAt)}
          </p>
        ) : null}
      </div>
    )
  ) : (
    <p className="mt-0.5 text-[11px] text-text-muted">
      {getMemberStatusLabel(member)}
    </p>
  );

  return (
    <div className="flex items-center gap-3 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3">
      <Avatar className="size-10 shrink-0">
        {member.avatarUrl ? (
          <AvatarImage src={member.avatarUrl} alt={member.fullName} />
        ) : null}
        <AvatarFallback
          className={cn(
            "text-sm font-semibold text-white",
            signupGradientBgClass
          )}
        >
          {getInitials(member.fullName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">
          {member.fullName}
        </p>
        <p className="truncate text-xs text-text-muted">@{member.username}</p>
        {statusLines}
      </div>
      <MemberInfoStatusTick status={member.status} />
    </div>
  );
}

function MessageInfoDialog({
  open,
  onOpenChange,
  isLoading,
  error,
  members,
  isDirectChat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoading: boolean;
  error: string | null;
  members: MemberReadStatus[];
  isDirectChat: boolean;
}) {
  const sections = [
    { key: "seen", title: "Seen by", items: members.filter((m) => m.status === "seen") },
    {
      key: "delivered",
      title: "Delivered to",
      items: members.filter((m) => m.status === "delivered"),
    },
    {
      key: "not_delivered",
      title: "Not delivered",
      items: members.filter((m) => m.status === "not_delivered"),
    },
  ].filter(
    (
      section
    ): section is {
      key: MemberDeliveryStatus;
      title: string;
      items: MemberReadStatus[];
    } => section.items.length > 0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,640px)] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Message info</DialogTitle>
          <DialogDescription>
            {isDirectChat
              ? "Delivery and read status for this message."
              : "Delivery and read status for group members."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-[13px]" />
              {!isDirectChat ? (
                <>
                  <Skeleton className="h-16 w-full rounded-[13px]" />
                  <Skeleton className="h-16 w-full rounded-[13px]" />
                </>
              ) : null}
            </div>
          ) : error ? (
            <p className="rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3 text-[13px] leading-relaxed text-accent">
              {error}
            </p>
          ) : members.length === 0 ? (
            <p className="text-[13px] text-text-muted">
              {isDirectChat
                ? "Recipient info is unavailable."
                : "No other members in this group."}
            </p>
          ) : isDirectChat ? (
            <MessageInfoMemberRow member={members[0]} showSeparateTimestamps />
          ) : (
            <div className="space-y-4">
              {sections.map((section) => (
                <div key={section.key}>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {section.title}
                  </p>
                  <div className="space-y-2">
                    {section.items.map((member) => (
                      <MessageInfoMemberRow key={member.userId} member={member} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReplyPreviewBlock({
  replyTo,
  senderLabel,
  className,
}: {
  replyTo: MessageReplyTo;
  senderLabel: string;
  className?: string;
}) {
  const isReplyUnsent = Boolean(replyTo.isUnsent);
  const previewText = getReplyToPreviewText(replyTo);
  const showVoiceIcon = isVoiceReplyTarget(replyTo);
  const showVideoIcon = isVideoReplyTarget(replyTo);
  const showImagePreview =
    isImageReplyTarget(replyTo) && Boolean(replyTo.imageUrl);

  return (
    <div
      className={cn(
        "rounded-lg border-l-2 border-accent/70 bg-surface-2/40 px-2.5 py-1.5 text-left",
        className
      )}
    >
      <p className="truncate text-[11px] font-semibold text-text-primary">
        {senderLabel}
      </p>
      <div className="mt-0.5 flex min-w-0 items-center gap-2">
        {showVoiceIcon ? (
          <Mic className="size-3.5 shrink-0 text-text-muted" strokeWidth={2} />
        ) : showVideoIcon ? (
          <Video className="size-3.5 shrink-0 text-text-muted" strokeWidth={2} />
        ) : showImagePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={replyTo.imageUrl ?? undefined}
            alt=""
            className="size-6 shrink-0 rounded-md object-cover"
          />
        ) : null}
        <p
          className={cn(
            "min-w-0 truncate text-[11px] leading-relaxed",
            isReplyUnsent ? "italic text-text-muted" : "text-text-secondary"
          )}
        >
          {previewText}
        </p>
      </div>
    </div>
  );
}

function StatusReplyPreviewBlock({
  replyToStatus,
  ownerLabel,
  className,
}: {
  replyToStatus: MessageReplyToStatus;
  ownerLabel: string;
  className?: string;
}) {
  const previewText =
    replyToStatus.type === "image"
      ? replyToStatus.content?.trim() || "Photo"
      : replyToStatus.content?.trim() || "Status";

  return (
    <div
      className={cn(
        "rounded-lg border-l-2 border-accent/70 bg-surface-2/40 px-2.5 py-1.5 text-left",
        className
      )}
    >
      <p className="truncate text-[11px] font-semibold text-text-primary">
        {ownerLabel}&apos;s status
      </p>
      <div className="mt-0.5 flex min-w-0 items-center gap-2">
        {replyToStatus.type === "image" && replyToStatus.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={replyToStatus.imageUrl}
            alt=""
            className="size-8 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div
            className="size-8 shrink-0 rounded-md"
            style={{
              backgroundColor: replyToStatus.backgroundColor ?? "#ff404f",
            }}
          />
        )}
        <p className="min-w-0 truncate text-[11px] leading-relaxed text-text-secondary">
          {previewText}
        </p>
      </div>
    </div>
  );
}


function MessageBubble({
  message,
  isSent,
  isGroupChat,
  currentUserId,
  participantName,
  senderNames,
  showSenderHeader,
  senderName,
  senderAvatarUrl,
  onReply,
  onDeleteForMe,
  onUnsendRequest,
  onMessageUpdated,
  onImageClick,
  onVideoClick,
  uploadProgress = null,
  thumbnailUrl = null,
  onToggleReaction,
  onInfoRequest,
  actionsLocked = false,
}: {
  message: ChatMessage;
  isSent: boolean;
  isGroupChat?: boolean;
  currentUserId?: string;
  participantName?: string;
  senderNames?: Map<string, string>;
  showSenderHeader?: boolean;
  senderName?: string;
  senderAvatarUrl?: string | null;
  onReply: (message: ChatMessage) => void;
  onDeleteForMe: (message: ChatMessage) => void;
  onUnsendRequest: (message: ChatMessage) => void;
  onMessageUpdated: (message: ChatMessage) => void;
  onImageClick: (message: ChatMessage) => void;
  onVideoClick: (message: ChatMessage) => void;
  uploadProgress?: number | null;
  thumbnailUrl?: string | null;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onInfoRequest?: (message: ChatMessage) => void;
  actionsLocked?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isEditing) {
      setEditValue(message.content);
      return;
    }

    if (editTextareaRef.current) {
      adjustTextareaHeight(editTextareaRef.current);
    }
  }, [message.content, isEditing]);

  useEffect(() => {
    if (isEditing && editTextareaRef.current) {
      adjustTextareaHeight(editTextareaRef.current);
    }
  }, [editValue, isEditing]);

  const editValidation = chatMessageSchema.safeParse({ content: editValue });
  const canSaveEdit = editValidation.success && !isSaving;
  const isUnsent = Boolean(message.isUnsent);
  const hasImage = Boolean(message.imageUrl) && !isUnsent;
  const hasVideo =
    (message.type === "video" || Boolean(message.videoUrl)) && !isUnsent;
  const hasVoice =
    (message.type === "voice" || Boolean(message.audioUrl)) && !isUnsent;
  const hasCaption = Boolean(message.content.trim()) && !isUnsent;
  const isImageOnly = hasImage && !hasCaption && !hasVoice && !hasVideo;
  const deliveryTickStatus = isGroupChat ? message.tickStatus : message.status;

  async function handleCopy() {
    if (isUnsent) {
      return;
    }

    const copyText = message.content.trim();
    if (!copyText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(copyText);
      toast.success("Copied");
      setCopied(true);

      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }

      copiedTimerRef.current = setTimeout(() => {
        setCopied(false);
        copiedTimerRef.current = null;
      }, 1500);
    } catch {
      toast.error("Failed to copy");
    }
  }

  function handleEditClick() {
    const createdAt = new Date(message.createdAt).getTime();
    if (Number.isNaN(createdAt) || Date.now() - createdAt > EDIT_WINDOW_MS) {
      toast.error("Edit window has expired");
      return;
    }

    setEditValue(message.content);
    setEditError(null);
    setIsEditing(true);
  }

  function handleUnsendClick() {
    const createdAt = new Date(message.createdAt).getTime();
    if (Number.isNaN(createdAt) || Date.now() - createdAt > UNSEND_WINDOW_MS) {
      toast.error("Unsend window has expired");
      return;
    }

    onUnsendRequest(message);
  }

  function handleEditValueChange(value: string) {
    setEditValue(value);
    if (editTextareaRef.current) {
      adjustTextareaHeight(editTextareaRef.current);
    }
  }

  function handleCancelEdit() {
    setEditValue(message.content);
    setEditError(null);
    setIsEditing(false);
  }

  async function handleSaveEdit() {
    if (!canSaveEdit) {
      return;
    }

    setIsSaving(true);
    setEditError(null);

    try {
      const updatedMessage = await editMessage(
        message.id,
        editValidation.data.content
      );
      onMessageUpdated(updatedMessage);
      setIsEditing(false);
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "flex w-full",
        isSent ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[min(100%,22rem)]",
          isSent ? "ml-auto" : "mr-auto"
        )}
      >
        {showSenderHeader ? (
          <div className="mb-2 flex min-w-0 items-center gap-2 px-0.5">
            <Avatar className="size-7 shrink-0">
              {senderAvatarUrl ? (
                <AvatarImage src={senderAvatarUrl} alt={senderName ?? "Member"} />
              ) : null}
              <AvatarFallback
                className={cn(
                  "text-[10px] font-semibold text-white",
                  signupGradientBgClass
                )}
              >
                {getInitials(senderName ?? "Member")}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-[11px] font-semibold text-text-secondary">
              {senderName ?? "Member"}
            </span>
          </div>
        ) : null}

        <div
          className={cn(
            "group/message flex items-start gap-0.5",
            isSent ? "flex-row-reverse" : "flex-row"
          )}
        >
        <div
          className={cn(
            "flex min-w-0 flex-col gap-1",
            isSent ? "items-end" : "items-start"
          )}
        >
          {isEditing ? (
            <div
              className={cn(
                "w-full min-w-[min(100%,20rem)] space-y-2 rounded-2xl px-3 py-2.5",
                isSent
                  ? cn("rounded-br-md text-white", signupGradientBgClass)
                  : "rounded-bl-md border border-border/70 bg-surface-1/80 text-text-primary"
              )}
            >
              <textarea
                ref={editTextareaRef}
                value={editValue}
                onChange={(event) => handleEditValueChange(event.target.value)}
                disabled={isSaving}
                maxLength={2000}
                rows={1}
                className={cn(
                  chatTextareaClassName,
                  "min-h-9 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0",
                  isSent
                    ? "text-white placeholder:text-white/70"
                    : "text-text-primary placeholder:text-text-muted"
                )}
                aria-label="Edit message"
              />
              {editError ? (
                <p
                  className={cn(
                    "text-[11px] leading-relaxed",
                    isSent ? "text-white/90" : "text-accent"
                  )}
                >
                  {editError}
                </p>
              ) : null}
              <div
                className={cn(
                  "flex gap-2",
                  isSent ? "justify-end" : "justify-start"
                )}
              >
                <Button
                  type="button"
                  size="xs"
                  variant={isSent ? "secondary" : "outline"}
                  disabled={isSaving}
                  onClick={handleCancelEdit}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={isSent ? "secondary" : "default"}
                  disabled={!canSaveEdit}
                  onClick={() => void handleSaveEdit()}
                >
                  {isSaving ? (
                    <Loader2 className="size-3 animate-spin" strokeWidth={2} />
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "w-fit max-w-[min(100%,20rem)] space-y-2 rounded-2xl text-left text-[13px] leading-relaxed",
                isImageOnly
                  ? "overflow-hidden p-1"
                  : "px-3.5 py-2.5 wrap-break-word whitespace-pre-wrap",
                isUnsent
                  ? "rounded-bl-md border border-border/70 bg-surface-1/50 italic text-text-muted"
                  : isSent
                    ? cn(
                        "rounded-br-md text-white",
                        isImageOnly ? "bg-black/10" : signupGradientBgClass
                      )
                    : "rounded-bl-md border border-border/70 bg-surface-1/80 text-text-primary"
              )}
            >
              {message.replyTo ? (
                <ReplyPreviewBlock
                  replyTo={message.replyTo}
                  senderLabel={getReplySenderLabel(
                    message.replyTo.senderId,
                    currentUserId,
                    participantName,
                    senderNames
                  )}
                  className={cn(
                    showSenderHeader ? "mt-1.5" : undefined,
                    isSent && !isUnsent &&
                      "border-white/70 bg-black/10 [&_p:first-child]:text-white [&_p:last-child]:text-white/80"
                  )}
                />
              ) : null}
              {message.replyToStatus ? (
                <StatusReplyPreviewBlock
                  replyToStatus={message.replyToStatus}
                  ownerLabel={getReplySenderLabel(
                    message.replyToStatus.ownerId,
                    currentUserId,
                    participantName,
                    senderNames
                  )}
                  className={cn(
                    showSenderHeader ? "mt-1.5" : undefined,
                    isSent && !isUnsent &&
                      "border-white/70 bg-black/10 [&_p:first-child]:text-white [&_p:last-child]:text-white/80 [&_p:last-of-type]:text-white/80"
                  )}
                />
              ) : null}
              {hasImage ? (
                <button
                  type="button"
                  onClick={() => onImageClick(message)}
                  className="block w-full overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  aria-label="View image fullscreen"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={message.imageUrl ?? undefined}
                    alt={hasCaption ? "Message attachment" : "Message image"}
                    className="max-h-64 w-full max-w-full object-cover"
                  />
                </button>
              ) : null}
              {hasVideo ? (
                <VideoMessageBubble
                  videoUrl={message.videoUrl}
                  thumbnailUrl={thumbnailUrl}
                  durationSeconds={message.videoDurationSeconds ?? 0}
                  isSent={isSent}
                  isUploading={message.isUploading}
                  uploadProgress={uploadProgress}
                  onOpen={() => onVideoClick(message)}
                />
              ) : null}
              {hasVoice ? (
                <VoiceMessageBubble
                  messageId={message.id}
                  audioUrl={message.audioUrl}
                  durationSeconds={message.audioDurationSeconds ?? 0}
                  isSent={isSent}
                  isUploading={message.isUploading}
                />
              ) : null}
              {hasCaption || isUnsent ? (
                <div className="text-left">{message.content}</div>
              ) : null}
            </div>
          )}
          {!isUnsent && message.reactions && message.reactions.length > 0 ? (
            <MessageReactionsSummary
              reactions={message.reactions}
              currentUserId={currentUserId}
              isSent={isSent}
              messageId={message.id}
              onToggleReaction={onToggleReaction}
            />
          ) : null}
          <p
            className={cn(
              "flex items-center gap-1 px-1 text-[11px] text-text-muted",
              isSent ? "justify-end" : "justify-start"
            )}
          >
            <span>{formatMessageTime(message.createdAt)}</span>
            {message.isEdited && !isUnsent ? (
              <span className="lowercase">· edited</span>
            ) : null}
            {isSent && !isUnsent && deliveryTickStatus ? (
              <MessageStatusTicks status={deliveryTickStatus} />
            ) : null}
          </p>
        </div>

        {!actionsLocked && !isEditing && !isUnsent ? (
        <div className="mt-0.5 flex shrink-0 flex-col gap-0.5">
        <DropdownMenu open={reactionMenuOpen} onOpenChange={setReactionMenuOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-text-muted opacity-100 transition-opacity sm:opacity-0 sm:group-hover/message:opacity-100 sm:group-focus-within/message:opacity-100"
              aria-label="Add reaction"
            />
          }
        >
          <Smile className="size-3.5" strokeWidth={2} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={isSent ? "end" : "start"}
          className="flex w-auto min-w-0 max-w-[calc(100vw-2rem)] flex-row flex-wrap justify-center gap-0.5 p-1"
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rounded-md p-1 transition-colors hover:bg-muted"
              aria-label={`React with ${getReactionAsset(emoji)?.label ?? emoji}`}
              onClick={() => {
                onToggleReaction(message.id, emoji);
                setReactionMenuOpen(false);
              }}
            >
              <ReactionEmojiImage emoji={emoji} size={24} />
            </button>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
        <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="mt-0.5 shrink-0 text-text-muted opacity-100 transition-opacity sm:opacity-0 sm:group-hover/message:opacity-100 sm:group-focus-within/message:opacity-100"
              aria-label="Message actions"
            />
          }
        >
          {copied ? (
            <Check className="size-3.5 text-green-600" strokeWidth={2} />
          ) : (
            <MoreVertical className="size-3.5" strokeWidth={2} />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isSent ? "end" : "start"} className="min-w-36">
          {message.content.trim() ? (
            <DropdownMenuItem onClick={() => void handleCopy()}>Copy</DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => onReply(message)}>Reply</DropdownMenuItem>
          {isSent && onInfoRequest ? (
            <DropdownMenuItem onClick={() => onInfoRequest(message)}>
              <Info className="size-4" strokeWidth={2} />
              Info
            </DropdownMenuItem>
          ) : null}
          {isSent ? (
            <>
              <DropdownMenuSeparator />
              {message.content.trim() ? (
                <DropdownMenuItem onClick={handleEditClick}>Edit</DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={handleUnsendClick}>Unsend</DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onDeleteForMe(message)}>
            Delete for me
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
        </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}

const AI_TYPING_TIMEOUT_MS = 15_000;
const AI_DAILY_MESSAGE_LIMIT = 15;
const AI_DAILY_LIMIT_MESSAGE =
  "You've reached today's limit of 15 messages to AI Assistant. Come back after midnight to continue.";

function countTodaysMessagesByUser(
  messages: ChatMessage[],
  userId: string
): number {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return messages.filter((message) => {
    if (message.senderId !== userId || message.isUnsent) {
      return false;
    }

    if (message.id.startsWith("temp-")) {
      return false;
    }

    return new Date(message.createdAt) >= startOfToday;
  }).length;
}

function isDailyLimitReachedError(error: unknown): boolean {
  return getApiErrorCode(error) === "daily_limit_reached";
}

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const conversationId =
    typeof params.conversationId === "string" ? params.conversationId : "";
  const isFromRequests = searchParams.get("from") === "requests";
  const backHref = isFromRequests ? "/requests" : "/chat";
  const backLabel = isFromRequests ? "Back to requests" : "Back to chats";

  const currentUser = useAuthStore((state) => state.user);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const imagePreviewUrlRef = useRef<string | null>(null);
  const isTypingActiveRef = useRef(false);
  const stopTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesBeforeReactionRef = useRef<ChatMessage[]>([]);

  const [headerInfo, setHeaderInfo] = useState<ConversationHeaderInfo | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMemberDetail[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isHeaderLoading, setIsHeaderLoading] = useState(true);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [typingSenderName, setTypingSenderName] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [unsendTarget, setUnsendTarget] = useState<ChatMessage | null>(null);
  const [unsendError, setUnsendError] = useState<string | null>(null);
  const [isUnsending, setIsUnsending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imagePickerError, setImagePickerError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoUploadProgressById, setVideoUploadProgressById] = useState<
    Record<string, number>
  >({});
  const [videoThumbnailById, setVideoThumbnailById] = useState<
    Record<string, string>
  >({});
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [viewerMessage, setViewerMessage] = useState<ChatMessage | null>(null);
  const [infoMessageId, setInfoMessageId] = useState<string | null>(null);
  const [infoMembers, setInfoMembers] = useState<MemberReadStatus[]>([]);
  const [isInfoLoading, setIsInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [isBackgroundDialogOpen, setIsBackgroundDialogOpen] = useState(false);
  const [pendingRequestAction, setPendingRequestAction] = useState<
    "accept" | "reject" | "block" | null
  >(null);
  const [pendingRequestError, setPendingRequestError] = useState<string | null>(
    null
  );
  const [aiDailyLimitReached, setAiDailyLimitReached] = useState(false);

  const trimmedInput = inputValue.trim();
  const hasComposerContent = trimmedInput.length > 0;
  const hasComposerImage = selectedImage !== null;
  const contentTooLong = hasComposerContent && trimmedInput.length > 2000;
  const canSend =
    (hasComposerContent || hasComposerImage) &&
    !contentTooLong &&
    !isSending &&
    !isVoiceRecording;
  const isGroupChat = headerInfo?.type === "group";
  const isPendingConversation =
    !isGroupChat && headerInfo?.status === "pending";
  const isPendingRequester =
    isPendingConversation &&
    Boolean(currentUser?.id) &&
    headerInfo?.requestedBy === currentUser?.id;
  const isPendingRecipient =
    isPendingConversation && !isPendingRequester;
  const participantUsername = headerInfo?.participantUsername;
  const participantIsSystem = headerInfo?.participantIsSystem === true;

  function startAiTypingIndicator() {
    if (!participantIsSystem) {
      return;
    }

    setIsAiTyping(true);
    if (aiTypingTimeoutRef.current) {
      clearTimeout(aiTypingTimeoutRef.current);
    }

    aiTypingTimeoutRef.current = setTimeout(() => {
      setIsAiTyping(false);
      aiTypingTimeoutRef.current = null;
    }, AI_TYPING_TIMEOUT_MS);
  }

  function clearAiTypingIndicator() {
    setIsAiTyping(false);
    if (aiTypingTimeoutRef.current) {
      clearTimeout(aiTypingTimeoutRef.current);
      aiTypingTimeoutRef.current = null;
    }
  }

  const pendingSentCount = useMemo(() => {
    if (!currentUser?.id) {
      return 0;
    }

    return messages.filter(
      (message) => message.senderId === currentUser.id && !message.isUnsent
    ).length;
  }, [currentUser?.id, messages]);
  const todaysAISentCount = useMemo(() => {
    if (!participantIsSystem || !currentUser?.id) {
      return 0;
    }

    return countTodaysMessagesByUser(messages, currentUser.id);
  }, [participantIsSystem, currentUser?.id, messages]);
  const hasReachedAIDailyLimit =
    participantIsSystem &&
    (aiDailyLimitReached || todaysAISentCount >= AI_DAILY_MESSAGE_LIMIT);
  const hasReachedPendingLimit = isPendingRequester && pendingSentCount >= 3;
  const canSendPendingRequest =
    isPendingRequester &&
    hasComposerContent &&
    !contentTooLong &&
    !isSending &&
    !hasReachedPendingLimit &&
    Boolean(participantUsername);
  const canSendMessage =
    (isPendingRequester ? canSendPendingRequest : canSend) &&
    !hasReachedAIDailyLimit;
  const showMicInsteadOfSend =
    !hasComposerContent && !hasComposerImage && !isVoiceRecording;
  const showMicInsteadOfSendPending =
    isPendingRequester &&
    !hasComposerContent &&
    !hasComposerImage &&
    !isVoiceRecording;
  const showMicInsteadOfSendFinal = isPendingRequester
    ? showMicInsteadOfSendPending
    : showMicInsteadOfSend;
  const charCount = trimmedInput.length;
  const showCharWarning = charCount > 1900;

  function revokeImagePreviewUrl() {
    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current);
      imagePreviewUrlRef.current = null;
    }
  }

  function clearSelectedImage() {
    revokeImagePreviewUrl();
    setSelectedImage(null);
    setImagePreviewUrl(null);
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }

  function handleImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setImagePickerError(null);

    if (!file) {
      return;
    }

    const validationError = validateMessageImageFile(file);
    if (validationError) {
      setImagePickerError(validationError);
      event.target.value = "";
      return;
    }

    revokeImagePreviewUrl();
    const previewUrl = URL.createObjectURL(file);
    imagePreviewUrlRef.current = previewUrl;
    setSelectedImage(file);
    setImagePreviewUrl(previewUrl);
    event.target.value = "";
  }

  async function handleVideoSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setVideoError(null);
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const { durationSeconds } = await readVideoFileMetadata(file);
      const validationError = validateVideoMessageFile(file, durationSeconds);
      if (validationError) {
        setVideoError(validationError);
        return;
      }

      const thumbnailUrl = await captureVideoThumbnail(file);
      await handleVideoSend(file, durationSeconds, thumbnailUrl);
    } catch (error) {
      setVideoError(
        error instanceof Error ? error.message : "Could not process video"
      );
    }
  }

  async function handleVideoSend(
    file: File,
    durationSeconds: number,
    thumbnailUrl: string
  ) {
    if (!conversationId || !currentUser?.id || hasReachedAIDailyLimit) {
      return;
    }

    setVideoError(null);
    setIsSending(true);

    const replyTarget = replyingTo;
    const tempId = `temp-video-${Date.now()}`;

    setVideoThumbnailById((current) => ({ ...current, [tempId]: thumbnailUrl }));
    setVideoUploadProgressById((current) => ({ ...current, [tempId]: 0 }));

    const optimisticMessage: ChatMessage = {
      id: tempId,
      conversationId,
      senderId: currentUser.id,
      type: "video",
      content: "",
      videoDurationSeconds: durationSeconds,
      isUploading: true,
      replyToMessageId: replyTarget?.id,
      replyTo: replyTarget
        ? {
            id: replyTarget.id,
            senderId: replyTarget.senderId,
            type: replyTarget.type,
            content: getReplyPreviewText(replyTarget),
            imageUrl: replyTarget.imageUrl,
            audioUrl: replyTarget.audioUrl,
            videoUrl: replyTarget.videoUrl,
            isUnsent: replyTarget.isUnsent,
          }
        : undefined,
      status: "sent",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimisticMessage]);
    requestAnimationFrame(() => {
      scrollMessagesToBottom(
        messagesScrollRef.current,
        messagesEndRef.current,
        { force: true }
      );
    });
    setReplyingTo(null);

    try {
      const createdMessage = await sendVideoMessage(conversationId, {
        video: file,
        durationSeconds,
        replyToMessageId: replyTarget?.id,
        onUploadProgress: (percent) => {
          setVideoUploadProgressById((current) => ({
            ...current,
            [tempId]: percent,
          }));
        },
      });
      setMessages((current) =>
        current.map((message) =>
          message.id === tempId ? createdMessage : message
        )
      );
      if (participantIsSystem) {
        startAiTypingIndicator();
      }
    } catch (error) {
      setMessages((current) =>
        current.filter((message) => message.id !== tempId)
      );
      if (isDailyLimitReachedError(error)) {
        setAiDailyLimitReached(true);
      } else {
        toast.error(
          error instanceof Error ? error.message : "Failed to send video message"
        );
      }
    } finally {
      setVideoUploadProgressById((current) => {
        const next = { ...current };
        delete next[tempId];
        return next;
      });
      setVideoThumbnailById((current) => {
        const next = { ...current };
        delete next[tempId];
        return next;
      });
      setIsSending(false);
    }
  }

  function markCurrentConversationRead() {
    if (!conversationId) {
      return;
    }

    void markConversationRead(conversationId).catch((error) => {
      console.log(
        "Failed to mark conversation read:",
        error instanceof Error ? error.message : error
      );
    });
  }

  function handleInfoRequest(message: ChatMessage) {
    setInfoMessageId(message.id);
    setInfoMembers([]);
    setInfoError(null);
  }

  useEffect(() => {
    if (!infoMessageId) {
      return;
    }

    const messageId = infoMessageId;
    let cancelled = false;

    async function loadInfo() {
      setIsInfoLoading(true);
      setInfoError(null);

      try {
        const data = await getMessageInfo(messageId);
        if (!cancelled) {
          setInfoMembers(data);
        }
      } catch (error) {
        if (!cancelled) {
          setInfoMembers([]);
          setInfoError(
            error instanceof Error ? error.message : "Something went wrong"
          );
        }
      } finally {
        if (!cancelled) {
          setIsInfoLoading(false);
        }
      }
    }

    void loadInfo();

    return () => {
      cancelled = true;
    };
  }, [infoMessageId]);

  function clearStopTypingTimer() {
    if (stopTypingTimerRef.current) {
      clearTimeout(stopTypingTimerRef.current);
      stopTypingTimerRef.current = null;
    }
  }

  function sendTyping(isTyping: boolean) {
    if (!conversationId) {
      return;
    }

    send("typing", { conversationId, isTyping });
  }

  function stopTyping() {
    clearStopTypingTimer();

    if (isTypingActiveRef.current) {
      sendTyping(false);
      isTypingActiveRef.current = false;
    }
  }

  function scheduleStopTyping() {
    clearStopTypingTimer();

    stopTypingTimerRef.current = setTimeout(() => {
      stopTyping();
    }, TYPING_STOP_MS);
  }

  function handleInputChange(value: string) {
    setInputValue(value);

    if (messageInputRef.current) {
      adjustTextareaHeight(messageInputRef.current);
    }

    if (!value.trim()) {
      stopTyping();
      return;
    }

    if (!isTypingActiveRef.current) {
      sendTyping(true);
      isTypingActiveRef.current = true;
    }

    scheduleStopTyping();
  }

  useEffect(() => {
    return () => {
      stopTyping();
      if (typingHideTimerRef.current) {
        clearTimeout(typingHideTimerRef.current);
      }
      revokeImagePreviewUrl();
    };
  }, [conversationId]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      setIsLoading(false);
      setIsHeaderLoading(false);
      setLoadError("Invalid conversation");
      return;
    }

    let cancelled = false;

    async function loadConversationData() {
      setIsHeaderLoading(true);
      setIsLoading(true);
      setHeaderError(null);
      setLoadError(null);
      setReplyingTo(null);

      async function loadHeaderInfo() {
        try {
          const data = await getConversationHeaderInfo(conversationId);
          if (cancelled) {
            return;
          }

          setHeaderInfo(data);

          if (data.type === "group") {
            try {
              const groupData = await getGroupInfo(conversationId);
              if (!cancelled) {
                setGroupMembers(groupData.members);
              }
            } catch {
              if (!cancelled) {
                setGroupMembers([]);
              }
            }
          } else if (!cancelled) {
            setGroupMembers([]);
          }
        } catch (error) {
          if (!cancelled) {
            setHeaderInfo(null);
            setGroupMembers([]);
            setHeaderError(
              error instanceof Error ? error.message : "Something went wrong"
            );
          }
        } finally {
          if (!cancelled) {
            setIsHeaderLoading(false);
          }
        }
      }

      async function loadMessages() {
        try {
          const messageList = await getMessages(conversationId);
          if (!cancelled) {
            setMessages(messageList);
          }
        } catch (error) {
          if (!cancelled) {
            setMessages([]);
            setLoadError(
              error instanceof Error ? error.message : "Something went wrong"
            );
          }
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      }

      await Promise.all([loadHeaderInfo(), loadMessages()]);
    }

    void loadConversationData();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || isLoading || loadError) {
      return;
    }

    markCurrentConversationRead();
  }, [conversationId, isLoading, loadError]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const unsubscribe = subscribe("__reconnected", () => {
      const shouldScroll = messagesScrollRef.current
        ? isMessagesNearBottom(messagesScrollRef.current)
        : false;

      void getMessages(conversationId)
        .then((messageList) => {
          setMessages(messageList);
          requestAnimationFrame(() => {
            scrollMessagesToBottom(
              messagesScrollRef.current,
              messagesEndRef.current,
              shouldScroll ? { behavior: "auto", force: true } : undefined
            );
          });
        })
        .catch((error) => {
          console.log(
            "Failed to refetch messages after reconnect:",
            error instanceof Error ? error.message : error
          );
        });
    });

    return unsubscribe;
  }, [conversationId]);

  useEffect(() => {
    setAiDailyLimitReached(false);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const unsubscribe = subscribe("new_message", (payload) => {
      const event = payload as NewMessageEventPayload;
      if (event.conversationId !== conversationId) {
        return;
      }

      const shouldScroll = messagesScrollRef.current
        ? isMessagesNearBottom(messagesScrollRef.current)
        : true;

      setMessages((current) => {
        if (current.some((message) => message.id === event.message.id)) {
          return current;
        }

        if (event.message.senderId === currentUser?.id) {
          return current;
        }

        if (participantIsSystem) {
          clearAiTypingIndicator();
        }

        markCurrentConversationRead();

        return [...current, event.message];
      });

      if (shouldScroll) {
        requestAnimationFrame(() => {
          scrollMessagesToBottom(
            messagesScrollRef.current,
            messagesEndRef.current
          );
        });
      }
    });

    return unsubscribe;
  }, [conversationId, currentUser?.id, participantIsSystem]);

  useEffect(() => {
    return () => {
      if (aiTypingTimeoutRef.current) {
        clearTimeout(aiTypingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const unsubscribe = subscribe("conversation_read", (payload) => {
      const event = payload as ConversationReadEventPayload;
      if (event.conversationId !== conversationId) {
        return;
      }

      if (headerInfo?.type === "group") {
        return;
      }

      setMessages((current) =>
        current.map((message) =>
          message.senderId === currentUser?.id
            ? { ...message, status: "seen" }
            : message
        )
      );
    });

    return unsubscribe;
  }, [conversationId, currentUser?.id, headerInfo?.type]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const unsubscribe = subscribe("message_delivered", (payload) => {
      const event = payload as MessageDeliveredEventPayload;
      if (event.conversationId !== conversationId) {
        return;
      }

      if (headerInfo?.type === "group") {
        return;
      }

      setMessages((current) =>
        current.map((message) => {
          if (
            message.id !== event.messageId ||
            message.senderId !== currentUser?.id
          ) {
            return message;
          }

          if (message.status === "seen") {
            return message;
          }

          return { ...message, status: "delivered" };
        })
      );
    });

    return unsubscribe;
  }, [conversationId, currentUser?.id, headerInfo?.type]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const unsubscribe = subscribe("message_tick_updated", (payload) => {
      const event = payload as MessageTickUpdatedEventPayload;
      if (event.conversationId !== conversationId) {
        return;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === event.messageId
            ? { ...message, tickStatus: event.tickStatus }
            : message
        )
      );
    });

    return unsubscribe;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const unsubscribe = subscribe("message_edited", (payload) => {
      const event = payload as MessageEditedEventPayload;
      if (event.conversationId !== conversationId) {
        return;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === event.messageId
            ? {
                ...message,
                content: event.content,
                isEdited: event.isEdited,
              }
            : message
        )
      );
    });

    return unsubscribe;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const unsubscribe = subscribe("message_unsent", (payload) => {
      const event = payload as MessageUnsentEventPayload;
      if (event.conversationId !== conversationId) {
        return;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === event.messageId
            ? applyUnsentToMessage(message)
            : message
        )
      );
    });

    return unsubscribe;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const unsubscribe = subscribe("reaction_updated", (payload) => {
      const event = payload as ReactionUpdatedEventPayload;
      if (event.conversationId !== conversationId) {
        return;
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === event.messageId
            ? { ...message, reactions: event.reactions }
            : message
        )
      );
    });

    return unsubscribe;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const unsubscribe = subscribe("typing", (payload) => {
      const event = payload as TypingEventPayload;
      if (event.conversationId !== conversationId) {
        return;
      }

      if (event.userId === currentUser?.id) {
        return;
      }

      if (typingHideTimerRef.current) {
        clearTimeout(typingHideTimerRef.current);
        typingHideTimerRef.current = null;
      }

      if (event.isTyping) {
        setIsOtherTyping(true);
        setTypingSenderName(event.senderName?.trim() || null);
        typingHideTimerRef.current = setTimeout(() => {
          setIsOtherTyping(false);
          setTypingSenderName(null);
          typingHideTimerRef.current = null;
        }, TYPING_HIDE_MS);
        return;
      }

      setIsOtherTyping(false);
      setTypingSenderName(null);
    });

    return () => {
      unsubscribe();
      if (typingHideTimerRef.current) {
        clearTimeout(typingHideTimerRef.current);
        typingHideTimerRef.current = null;
      }
    };
  }, [conversationId, currentUser?.id]);

  useEffect(() => {
    const unsubscribe = subscribe("presence", (payload) => {
      const event = payload as PresenceEventPayload;
      if (event.userId !== headerInfo?.participantId) {
        return;
      }

      setHeaderInfo((current) => {
        if (!current || current.type !== "direct") {
          return current;
        }

        if (
          current.participantIsOnline === undefined &&
          current.participantLastSeen === undefined
        ) {
          return current;
        }

        return {
          ...current,
          participantIsOnline: event.isOnline,
          participantLastSeen: event.isOnline
            ? current.participantLastSeen
            : event.lastSeen ?? current.participantLastSeen,
        };
      });
    });

    return unsubscribe;
  }, [headerInfo?.participantId]);

  useEffect(() => {
    if (isLoading || loadError) {
      return;
    }

    requestAnimationFrame(() => {
      scrollMessagesToBottom(messagesScrollRef.current, messagesEndRef.current, {
        behavior: "auto",
        force: true,
      });
    });
  }, [conversationId, isLoading, loadError, messages.length]);

  useEffect(() => {
    if (!viewerMessage) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setViewerMessage(null);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [viewerMessage]);

  async function handleSend() {
    if (!canSendMessage || !conversationId) {
      return;
    }

    if (hasComposerContent) {
      const parsed = chatMessageSchema.safeParse({ content: inputValue });
      if (!parsed.success) {
        return;
      }
    }

    setIsSending(true);
    setSendError(null);

    try {
      let createdMessage: ChatMessage;

      if (isPendingRequester && participantUsername) {
        const message = await sendMessageRequest(participantUsername, trimmedInput);
        createdMessage = {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          type: "text",
          content: message.content,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
        };
      } else {
        createdMessage = await sendMessage(conversationId, {
          content: hasComposerContent ? trimmedInput : undefined,
          image: selectedImage ?? undefined,
          replyToMessageId: replyingTo?.id,
        });
      }

      setMessages((current) => [...current, createdMessage]);
      requestAnimationFrame(() => {
        scrollMessagesToBottom(
          messagesScrollRef.current,
          messagesEndRef.current,
          { force: true }
        );
      });
      setInputValue("");
      clearSelectedImage();
      setReplyingTo(null);
      if (messageInputRef.current) {
        messageInputRef.current.style.height = "auto";
      }
      stopTyping();
      requestAnimationFrame(() => {
        messageInputRef.current?.focus();
      });
      if (participantIsSystem && !isPendingRequester) {
        startAiTypingIndicator();
      }
    } catch (error) {
      if (isDailyLimitReachedError(error)) {
        setAiDailyLimitReached(true);
        setSendError(null);
      } else {
        const status = getApiErrorStatus(error);
        const message =
          error instanceof Error ? error.message : "Something went wrong";

        if (status === 410) {
          toast.error(message);
          setSendError(null);
        } else {
          setSendError(message);
        }
      }
    } finally {
      setIsSending(false);
    }
  }

  async function handleVoiceComplete(blob: Blob, durationSeconds: number) {
    if (!conversationId || !currentUser?.id || hasReachedAIDailyLimit) {
      return;
    }

    const validationError = validateVoiceMessageBlob(blob, durationSeconds);
    if (validationError) {
      setVoiceError(validationError);
      return;
    }

    setVoiceError(null);
    setIsSending(true);

    const replyTarget = replyingTo;
    const tempId = `temp-voice-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      conversationId,
      senderId: currentUser.id,
      type: "voice",
      content: "",
      audioDurationSeconds: durationSeconds,
      isUploading: true,
      replyToMessageId: replyTarget?.id,
      replyTo: replyTarget
        ? {
            id: replyTarget.id,
            senderId: replyTarget.senderId,
            type: replyTarget.type,
            content: getReplyPreviewText(replyTarget),
            imageUrl: replyTarget.imageUrl,
            audioUrl: replyTarget.audioUrl,
            isUnsent: replyTarget.isUnsent,
          }
        : undefined,
      status: "sent",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimisticMessage]);
    requestAnimationFrame(() => {
      scrollMessagesToBottom(
        messagesScrollRef.current,
        messagesEndRef.current,
        { force: true }
      );
    });
    setReplyingTo(null);

    try {
      const createdMessage = await sendVoiceMessage(conversationId, {
        audio: blob,
        durationSeconds,
        replyToMessageId: replyTarget?.id,
      });
      setMessages((current) =>
        current.map((message) =>
          message.id === tempId ? createdMessage : message
        )
      );
      if (participantIsSystem) {
        startAiTypingIndicator();
      }
    } catch (error) {
      setMessages((current) =>
        current.filter((message) => message.id !== tempId)
      );
      if (isDailyLimitReachedError(error)) {
        setAiDailyLimitReached(true);
      } else {
        toast.error(
          error instanceof Error ? error.message : "Failed to send voice message"
        );
      }
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleSend();
  }

  function handleComposeKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  function handleReplyRequest(message: ChatMessage) {
    setReplyingTo(message);
    messageInputRef.current?.focus();
  }

  async function handleToggleReaction(messageId: string, emoji: string) {
    if (!currentUser?.id) {
      return;
    }

    setMessages((current) => {
      messagesBeforeReactionRef.current = current;
      return current.map((message) =>
        message.id === messageId
          ? applyReactionToggle(message, currentUser.id, emoji)
          : message
      );
    });

    try {
      await toggleReaction(messageId, emoji);
    } catch (error) {
      setMessages(messagesBeforeReactionRef.current);
      toast.error(
        error instanceof Error ? error.message : "Failed to update reaction"
      );
    }
  }

  function handleDeleteForMeRequest(message: ChatMessage) {
    setDeleteError(null);
    setDeleteTarget(message);
  }

  function handleMessageUpdated(updatedMessage: ChatMessage) {
    setMessages((current) =>
      current.map((message) =>
        message.id === updatedMessage.id ? updatedMessage : message
      )
    );
  }

  function handleUnsendRequest(message: ChatMessage) {
    setUnsendError(null);
    setUnsendTarget(message);
  }

  async function handleConfirmUnsend() {
    if (!unsendTarget) {
      return;
    }

    setIsUnsending(true);
    setUnsendError(null);

    try {
      await unsendMessage(unsendTarget.id);
      setMessages((current) =>
        current.map((message) =>
          message.id === unsendTarget.id
            ? applyUnsentToMessage(message)
            : message
        )
      );
      if (viewerMessage?.id === unsendTarget.id) {
        setViewerMessage(null);
      }
      setUnsendTarget(null);
    } catch (error) {
      setUnsendError(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsUnsending(false);
    }
  }

  async function handleConfirmDeleteForMe() {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteMessageForMe(deleteTarget.id);
      setMessages((current) =>
        current.filter((message) => message.id !== deleteTarget.id)
      );
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const headerName = isGroupChat
    ? headerInfo?.groupName?.trim() || "Group"
    : headerInfo?.participantFullName ?? "Chat";
  const isDeletedParticipant =
    !isGroupChat && headerName === DELETED_USER_DISPLAY_NAME;
  const headerInitials = getInitials(headerName);
  const headerAvatarUrl = isGroupChat
    ? headerInfo?.groupAvatarUrl
    : headerInfo?.participantAvatarUrl;
  const participantIsOnline = headerInfo?.participantIsOnline;
  const participantLastSeen = headerInfo?.participantLastSeen ?? null;
  const groupMemberCount = headerInfo?.memberCount ?? groupMembers.length;
  const groupInfoHref = conversationId
    ? `/groups/${encodeURIComponent(conversationId)}`
    : "/chat";
  const participantProfileHref =
    !isGroupChat && participantUsername
      ? `/users/${encodeURIComponent(participantUsername)}?from=chat&conversationId=${encodeURIComponent(conversationId)}`
      : null;
  const headerProfileHref = isGroupChat
    ? groupInfoHref
    : participantProfileHref;

  const senderNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of groupMembers) {
      map.set(member.id, member.fullName);
    }
    return map;
  }, [groupMembers]);

  const senderMemberById = useMemo(() => {
    const map = new Map<string, GroupMemberDetail>();
    for (const member of groupMembers) {
      map.set(member.id, member);
    }
    return map;
  }, [groupMembers]);

  const chatBackgroundStyle = useMemo(
    () =>
      getChatBackgroundStyle(
        headerInfo?.backgroundType,
        headerInfo?.backgroundValue
      ),
    [headerInfo?.backgroundType, headerInfo?.backgroundValue]
  );

  function handleBackgroundChange(next: {
    backgroundType: NonNullable<ConversationHeaderInfo["backgroundType"]>;
    backgroundValue?: string | null;
  }) {
    setHeaderInfo((current) =>
      current
        ? {
            ...current,
            backgroundType: next.backgroundType,
            backgroundValue: next.backgroundValue ?? null,
          }
        : current
    );
  }

  async function handlePendingRequestAction(
    action: "accept" | "reject" | "block"
  ) {
    if (!conversationId || pendingRequestAction) {
      return;
    }

    const apiCall =
      action === "accept"
        ? acceptRequest
        : action === "reject"
          ? rejectRequest
          : blockRequest;
    const successMessage =
      action === "accept"
        ? "Request accepted"
        : action === "reject"
          ? "Request rejected"
          : "User blocked";

    setPendingRequestAction(action);
    setPendingRequestError(null);

    try {
      await apiCall(conversationId);
      toast.success(successMessage);
      if (action === "accept") {
        router.push(`/chat/${encodeURIComponent(conversationId)}`);
      } else {
        router.push("/requests");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      setPendingRequestError(message);
      toast.error(message);
    } finally {
      setPendingRequestAction(null);
    }
  }

  return (
    <VoicePlaybackProvider>
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border/70 bg-background/95 px-3 py-2.5 backdrop-blur-sm sm:px-6 sm:py-3">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <Link
            href={backHref}
            className="inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 text-text-muted transition-opacity hover:opacity-80"
            aria-label={backLabel}
          >
            <ArrowLeft className="size-5" strokeWidth={2} />
          </Link>

          {isHeaderLoading ? (
            <>
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </>
          ) : headerError ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-accent">
                {headerError}
              </p>
            </div>
          ) : (
            <>
              {headerProfileHref && !isDeletedParticipant ? (
              <Link
                href={headerProfileHref}
                className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-85"
                aria-label={
                  isGroupChat ? "Open group info" : "View profile"
                }
              >
                <div className="relative shrink-0">
                  <Avatar className="size-10">
                    {headerAvatarUrl ? (
                      <AvatarImage src={headerAvatarUrl} alt={headerName} />
                    ) : null}
                    <AvatarFallback
                      className={cn(
                        "text-sm font-semibold text-white",
                        signupGradientBgClass
                      )}
                    >
                      {isGroupChat && !headerAvatarUrl ? (
                        <Users className="size-4" strokeWidth={2} />
                      ) : participantIsSystem ? (
                        <span className="text-sm font-bold animate-spin-slow select-none">✦</span>
                      ) : (
                        headerInitials
                      )}
                    </AvatarFallback>
                  </Avatar>
                  {!isGroupChat && (participantIsOnline === true || participantIsSystem) ? <OnlineDot /> : null}
                </div>

                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-text-primary">
                    <span className="truncate">{headerName}</span>
                    {participantIsSystem ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent-subtle px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-accent shadow-xs">
                        <Sparkles
                          className="size-3 shrink-0 text-accent animate-spin-slow"
                          strokeWidth={2.2}
                          aria-label="AI Assistant"
                        />
                        AI
                      </span>
                    ) : null}
                  </p>
                  {isGroupChat ? (
                    <p className="truncate text-xs text-text-muted">
                      {groupMemberCount}{" "}
                      {groupMemberCount === 1 ? "member" : "members"}
                    </p>
                  ) : (
                    <p className="truncate text-xs text-text-muted">
                      {isAiTyping
                        ? "typing..."
                        : participantIsOnline
                          ? "Online"
                          : participantLastSeen
                            ? `Last seen ${formatLastSeen(participantLastSeen)}`
                            : participantUsername
                              ? `@${participantUsername}`
                              : "Offline"}
                    </p>
                  )}
                </div>
              </Link>
              ) : (
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="relative shrink-0">
                  <Avatar className="size-10">
                    {headerAvatarUrl ? (
                      <AvatarImage src={headerAvatarUrl} alt={headerName} />
                    ) : null}
                    <AvatarFallback
                      className={cn(
                        "text-sm font-semibold text-white",
                        signupGradientBgClass
                      )}
                    >
                      {participantIsSystem ? (
                        <span className="text-sm font-bold animate-spin-slow select-none">✦</span>
                      ) : (
                        headerInitials
                      )}
                    </AvatarFallback>
                  </Avatar>
                  {!isGroupChat && (participantIsOnline === true || participantIsSystem) ? <OnlineDot /> : null}
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {headerName}
                  </p>
                </div>
              </div>
              )}
            </>
          )}

          {!isHeaderLoading && !headerError ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label="Conversation options"
                  />
                }
              >
                <MoreVertical className="size-4" strokeWidth={2} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem
                  onClick={() => setIsBackgroundDialogOpen(true)}
                >
                  <Palette className="size-4" strokeWidth={2} />
                  Chat Background
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>

      <div className="relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-3 sm:px-6">
        {chatBackgroundStyle ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-35"
            style={chatBackgroundStyle}
          />
        ) : null}
        <div
          ref={messagesScrollRef}
          className="relative z-10 min-h-0 flex-1 overflow-y-auto py-4"
        >
          {loadError ? (
            <p className="rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3 text-[13px] leading-relaxed text-accent">
              {loadError}
            </p>
          ) : null}

          {isLoading ? (
            <div className="space-y-4">
              <MessageSkeleton isSent={false} showSenderHeader={isGroupChat} />
              <MessageSkeleton isSent />
              <MessageSkeleton isSent={false} showSenderHeader={isGroupChat} />
              <MessageSkeleton isSent />
            </div>
          ) : null}

          {!isLoading && !loadError ? (
            <div className="flex min-h-full flex-col">
              {messages.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-4 py-8">
                  <div className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-5 py-8 text-center">
                    <p className="text-sm font-medium text-text-secondary">
                      {isGroupChat
                        ? "No messages yet — say hi to the group!"
                        : "Say hi 👋"}
                    </p>
                    {isGroupChat ? (
                      <p className="mt-1 text-[13px] text-text-muted">
                        Be the first to start the conversation.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  <div className="min-h-0 flex-1 shrink" aria-hidden="true" />
                  <div className="flex w-full min-w-0 flex-col gap-3 sm:gap-4">
                    {messages.map((message, index) => {
                      const isSent = message.senderId === currentUser?.id;
                      const previousMessage =
                        index > 0 ? messages[index - 1] : null;
                      const senderMember = senderMemberById.get(message.senderId);
                      const resolvedSenderName =
                        senderMember?.fullName ??
                        senderNameById.get(message.senderId) ??
                        "Member";
                      const showSenderHeader =
                        isGroupChat &&
                        !isSent &&
                        (!previousMessage ||
                          previousMessage.senderId !== message.senderId);

                      return (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        isSent={isSent}
                        isGroupChat={isGroupChat}
                        currentUserId={currentUser?.id}
                        participantName={headerName}
                        senderNames={senderNameById}
                        showSenderHeader={showSenderHeader}
                        senderName={resolvedSenderName}
                        senderAvatarUrl={senderMember?.avatarUrl}
                        onReply={handleReplyRequest}
                        onDeleteForMe={handleDeleteForMeRequest}
                        onUnsendRequest={handleUnsendRequest}
                        onMessageUpdated={handleMessageUpdated}
                        onImageClick={setViewerMessage}
                        onVideoClick={setViewerMessage}
                        uploadProgress={videoUploadProgressById[message.id] ?? null}
                        thumbnailUrl={videoThumbnailById[message.id] ?? null}
                        onToggleReaction={(messageId, emoji) =>
                          void handleToggleReaction(messageId, emoji)
                        }
                        onInfoRequest={handleInfoRequest}
                        actionsLocked={isPendingConversation}
                      />
                      );
                    })}
                  </div>
                </>
              )}
              {isOtherTyping || isAiTyping ? (
                <div className="flex items-center gap-2 px-1 pt-1.5 animate-row-in">
                  <div className="flex items-center gap-1.5 rounded-2xl bg-surface-2/90 px-3 py-2 border border-border/70 shadow-xs">
                    <span className="size-1.5 rounded-full bg-accent animate-tdot" />
                    <span className="size-1.5 rounded-full bg-accent animate-tdot [animation-delay:0.15s]" />
                    <span className="size-1.5 rounded-full bg-accent animate-tdot [animation-delay:0.3s]" />
                  </div>
                  <span className="text-xs font-medium text-text-muted">
                    {isAiTyping
                      ? "AI Assistant is thinking..."
                      : isGroupChat
                      ? `${typingSenderName ?? "Someone"} is typing...`
                      : `${headerName} is typing...`}
                  </span>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border/70 bg-background py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {isPendingRecipient ? (
            <div className="space-y-2">
              {pendingRequestError ? (
                <p className="rounded-[13px] border border-border/70 bg-surface-1/50 px-3 py-2 text-[13px] leading-relaxed text-accent">
                  {pendingRequestError}
                </p>
              ) : null}
              <p className="text-center text-[13px] leading-relaxed text-text-secondary">
                Accept this request to reply, or reject/block to stop messages.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="min-w-0 flex-1"
                  disabled={pendingRequestAction !== null}
                  onClick={() => void handlePendingRequestAction("accept")}
                >
                  {pendingRequestAction === "accept" ? (
                    <Loader2 className="size-4 animate-spin" strokeWidth={2} />
                  ) : (
                    "Accept"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-0 flex-1"
                  disabled={pendingRequestAction !== null}
                  onClick={() => void handlePendingRequestAction("reject")}
                >
                  {pendingRequestAction === "reject" ? (
                    <Loader2 className="size-4 animate-spin" strokeWidth={2} />
                  ) : (
                    "Reject"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="min-w-0 flex-1"
                  disabled={pendingRequestAction !== null}
                  onClick={() => void handlePendingRequestAction("block")}
                >
                  {pendingRequestAction === "block" ? (
                    <Loader2 className="size-4 animate-spin" strokeWidth={2} />
                  ) : (
                    "Block"
                  )}
                </Button>
              </div>
            </div>
          ) : isDeletedParticipant ? (
            <div className="rounded-[13px] border border-border/70 bg-surface-1/40 px-3.5 py-3 text-center text-[13px] leading-relaxed text-text-secondary">
              You can&apos;t message this user — this account no longer exists.
            </div>
          ) : hasReachedAIDailyLimit ? (
            <div className="rounded-[13px] border border-border/70 bg-surface-1/40 px-3.5 py-3 text-center text-[13px] leading-relaxed text-text-secondary">
              {AI_DAILY_LIMIT_MESSAGE}
            </div>
          ) : hasReachedPendingLimit ? (
            <div className="rounded-[13px] border border-border/70 bg-surface-1/40 px-3.5 py-3 text-center text-[13px] leading-relaxed text-text-secondary">
              You&apos;ve sent 3 messages. Wait for a response before sending more.
            </div>
          ) : (
            <>
          {sendError ? (
            <p className="mb-2 rounded-[13px] border border-border/70 bg-surface-1/50 px-3 py-2 text-[13px] leading-relaxed text-accent">
              {sendError}
            </p>
          ) : null}

          {showCharWarning ? (
            <p className="mb-2 px-1 text-xs text-accent">
              {charCount}/2000 characters
            </p>
          ) : null}

          {replyingTo ? (
            <div className="mb-2 flex items-start gap-2 rounded-xl border border-border/70 border-l-2 border-l-accent/70 bg-surface-1/50 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-text-secondary">
                  Replying to{" "}
                  {getReplySenderLabel(
                    replyingTo.senderId,
                    currentUser?.id,
                    headerName,
                    senderNameById
                  )}
                </p>
                <div className="mt-0.5 flex min-w-0 items-center gap-2">
                  {isVoiceReplyTarget(replyingTo) ? (
                    <Mic className="size-4 shrink-0 text-text-muted" strokeWidth={2} />
                  ) : isVideoReplyTarget(replyingTo) ? (
                    <Video className="size-4 shrink-0 text-text-muted" strokeWidth={2} />
                  ) : replyingTo.imageUrl && !replyingTo.content.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={replyingTo.imageUrl}
                      alt=""
                      className="size-8 shrink-0 rounded-md object-cover"
                    />
                  ) : null}
                  <p
                    className={cn(
                      "min-w-0 truncate text-[13px] leading-relaxed",
                      replyingTo.isUnsent
                        ? "italic text-text-muted"
                        : "text-text-secondary"
                    )}
                  >
                    {truncateReplyContent(getReplyPreviewText(replyingTo))}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-text-muted"
                aria-label="Cancel reply"
                onClick={() => setReplyingTo(null)}
              >
                <X className="size-3.5" strokeWidth={2} />
              </Button>
            </div>
          ) : null}

          {imagePickerError ? (
            <p className="mb-2 rounded-[13px] border border-border/70 bg-surface-1/50 px-3 py-2 text-[13px] leading-relaxed text-accent">
              {imagePickerError}
            </p>
          ) : null}

          {voiceError ? (
            <p className="mb-2 rounded-[13px] border border-border/70 bg-surface-1/50 px-3 py-2 text-[13px] leading-relaxed text-accent">
              {voiceError}
            </p>
          ) : null}

          {videoError ? (
            <p className="mb-2 rounded-[13px] border border-border/70 bg-surface-1/50 px-3 py-2 text-[13px] leading-relaxed text-accent">
              {videoError}
            </p>
          ) : null}

          {imagePreviewUrl ? (
            <div className="mb-2 flex items-start gap-2">
              <div className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreviewUrl}
                  alt="Selected image preview"
                  className="size-16 rounded-lg border border-border/70 object-cover"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-xs"
                  className="absolute -top-1.5 -right-1.5 size-5 rounded-full shadow-sm"
                  aria-label="Remove selected image"
                  onClick={clearSelectedImage}
                >
                  <X className="size-3" strokeWidth={2} />
                </Button>
              </div>
              <p className="pt-1 text-xs text-text-muted">
                Add an optional caption below
              </p>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="flex min-w-0 items-end gap-2">
            {!isVoiceRecording ? (
              <>
                {!isPendingRequester ? (
                  <>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept={MESSAGE_IMAGE_ACCEPT}
                  className="hidden"
                  aria-hidden
                  onChange={handleImageSelect}
                />
                <input
                  ref={videoInputRef}
                  type="file"
                  accept={MESSAGE_VIDEO_ACCEPT}
                  className="hidden"
                  aria-hidden
                  onChange={(event) => void handleVideoSelect(event)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isLoading || Boolean(loadError) || isSending}
                  aria-label="Attach image"
                  className="size-10 shrink-0 rounded-xl text-text-muted"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <ImageIcon className="size-4" strokeWidth={2} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isLoading || Boolean(loadError) || isSending}
                  aria-label="Attach video"
                  className="size-10 shrink-0 rounded-xl text-text-muted"
                  onClick={() => videoInputRef.current?.click()}
                >
                  <Video className="size-4" strokeWidth={2} />
                </Button>
                  </>
                ) : null}
                <textarea
                  ref={messageInputRef}
                  value={inputValue}
                  onChange={(event) => handleInputChange(event.target.value)}
                  onKeyDown={handleComposeKeyDown}
                  placeholder={
                    hasComposerImage ? "Add a caption (optional)..." : "Type a message..."
                  }
                  disabled={isLoading || Boolean(loadError) || isSending}
                  maxLength={2000}
                  rows={1}
                  className={cn(
                    chatTextareaClassName,
                    "min-h-10 flex-1 rounded-xl border-border/70 bg-surface-1/50"
                  )}
                  aria-label="Message input"
                />
              </>
            ) : null}
            {!isPendingRequester && (showMicInsteadOfSendFinal || isVoiceRecording) ? (
              <div className={cn(isVoiceRecording && "flex-1")}>
                <VoiceRecorder
                  disabled={isLoading || Boolean(loadError) || isSending}
                  onComplete={(blob, durationSeconds) =>
                    void handleVoiceComplete(blob, durationSeconds)
                  }
                  onError={setVoiceError}
                  onRecordingChange={setIsVoiceRecording}
                />
              </div>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!canSendMessage || isLoading || Boolean(loadError)}
                aria-label="Send message"
                className="size-10 shrink-0 rounded-xl"
              >
                {isSending ? (
                  <Loader2 className="size-4 animate-spin" strokeWidth={2} />
                ) : (
                  <Send className="size-4" strokeWidth={2} />
                )}
              </Button>
            )}
          </form>
            </>
          )}
        </div>
      </div>

      <ChatBackgroundDialog
        open={isBackgroundDialogOpen}
        onOpenChange={setIsBackgroundDialogOpen}
        conversationId={conversationId}
        backgroundType={headerInfo?.backgroundType ?? "default"}
        backgroundValue={headerInfo?.backgroundValue}
        onBackgroundChange={handleBackgroundChange}
      />

      <MessageInfoDialog
        open={infoMessageId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setInfoMessageId(null);
            setInfoMembers([]);
            setInfoError(null);
          }
        }}
        isLoading={isInfoLoading}
        error={infoError}
        members={infoMembers}
        isDirectChat={!isGroupChat}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent showCloseButton={!isDeleting} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this message for you?</DialogTitle>
            <DialogDescription>
              Other person will still see it.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p className="rounded-[13px] border border-border/70 bg-surface-1/50 px-3 py-2 text-[13px] leading-relaxed text-accent">
              {deleteError}
            </p>
          ) : null}
          <DialogFooter className="border-t-0 bg-transparent sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => void handleConfirmDeleteForMe()}
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2} />
              ) : (
                "Delete for me"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={unsendTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isUnsending) {
            setUnsendTarget(null);
            setUnsendError(null);
          }
        }}
      >
        <DialogContent showCloseButton={!isUnsending} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unsend this message for everyone?</DialogTitle>
            <DialogDescription>
              This message will be replaced with a placeholder for both participants.
            </DialogDescription>
          </DialogHeader>
          {unsendError ? (
            <p className="rounded-[13px] border border-border/70 bg-surface-1/50 px-3 py-2 text-[13px] leading-relaxed text-accent">
              {unsendError}
            </p>
          ) : null}
          <DialogFooter className="border-t-0 bg-transparent sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isUnsending}
              onClick={() => {
                setUnsendTarget(null);
                setUnsendError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isUnsending}
              onClick={() => void handleConfirmUnsend()}
            >
              {isUnsending ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2} />
              ) : (
                "Unsend"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewerMessage ? (
        <div
          className="fixed inset-0 z-100 flex flex-col items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={viewerMessage.videoUrl ? "Video viewer" : "Image viewer"}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/90"
            aria-label={
              viewerMessage.videoUrl ? "Close video viewer" : "Close image viewer"
            }
            onClick={() => setViewerMessage(null)}
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-10 text-white hover:bg-white/10 hover:text-white"
            aria-label={
              viewerMessage.videoUrl ? "Close video viewer" : "Close image viewer"
            }
            onClick={() => setViewerMessage(null)}
          >
            <X className="size-5" strokeWidth={2} />
          </Button>

          {viewerMessage.videoUrl ? (
            <>
              <video
                src={viewerMessage.videoUrl}
                controls
                playsInline
                className="relative z-10 max-h-[calc(100dvh-8rem)] max-w-full"
              />
              {viewerMessage.content.trim() ? (
                <div className="absolute inset-x-4 bottom-4 z-10 rounded-xl bg-black/70 px-4 py-3 text-center text-sm leading-relaxed text-white backdrop-blur-sm sm:inset-x-auto sm:max-w-lg">
                  {viewerMessage.content}
                </div>
              ) : null}
            </>
          ) : viewerMessage.imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewerMessage.imageUrl}
                alt={
                  viewerMessage.content.trim()
                    ? "Message attachment"
                    : "Message image"
                }
                className="relative z-10 max-h-[calc(100dvh-8rem)] max-w-full object-contain"
              />
              {viewerMessage.content.trim() ? (
                <div className="absolute inset-x-4 bottom-4 z-10 rounded-xl bg-black/70 px-4 py-3 text-center text-sm leading-relaxed text-white backdrop-blur-sm sm:inset-x-auto sm:max-w-lg">
                  {viewerMessage.content}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
    </VoicePlaybackProvider>
  );
}

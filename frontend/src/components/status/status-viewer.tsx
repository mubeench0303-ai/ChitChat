"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Loader2,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signupGradientBgClass } from "@/components/auth/signup-submit-button";
import { StatusImageDisplay } from "@/components/status/status-image-display";
import { StatusViewersSheet } from "@/components/status/status-viewers-sheet";
import {
  STATUS_DURATION_MS,
  formatStatusTimestamp,
  getInitials,
} from "@/components/status/status-utils";
import {
  deleteStatus,
  getStatusViewers,
  markStatusViewed,
  sendMessage,
} from "@/lib/api/auth";
import type { Status, StatusUserSequence, StatusViewerEntry } from "@/types";
import { cn } from "@/lib/utils";

type StatusViewerProps = {
  sequences: StatusUserSequence[];
  initialUserIndex: number;
  initialStatusIndex: number;
  conversationIdByUserId: Map<string, string>;
  onClose: () => void;
  onStatusViewed: (statusId: string) => void;
  onStatusDeleted: (statusId: string, userId: string) => void;
};

export function StatusViewerOverlay({
  sequences,
  initialUserIndex,
  initialStatusIndex,
  conversationIdByUserId,
  onClose,
  onStatusViewed,
  onStatusDeleted,
}: StatusViewerProps) {
  const router = useRouter();
  const [userIndex, setUserIndex] = useState(initialUserIndex);
  const [statusIndex, setStatusIndex] = useState(initialStatusIndex);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isReplyFocused, setIsReplyFocused] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isViewersOpen, setIsViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<StatusViewerEntry[]>([]);
  const [isLoadingViewers, setIsLoadingViewers] = useState(false);
  const [viewersError, setViewersError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState<number | null>(null);

  const markedThisSessionRef = useRef<Set<string>>(new Set());

  const currentSequence = sequences[userIndex];
  const currentStatus = currentSequence?.statuses[statusIndex];
  const isOwn = currentSequence?.isOwn ?? false;

  const markLocalViewed = useCallback(
    (status: Status) => {
      onStatusViewed(status.id);
    },
    [onStatusViewed]
  );

  const markRemoteViewed = useCallback(
    (status: Status) => {
      if (isOwn) {
        return;
      }

      if (markedThisSessionRef.current.has(status.id)) {
        return;
      }

      markedThisSessionRef.current.add(status.id);

      void markStatusViewed(status.id).catch(() => {
        markedThisSessionRef.current.delete(status.id);
      });
    },
    [isOwn]
  );

  const resetTimer = useCallback(() => {
    // Progress segments remount via statusIndex/userIndex keys.
  }, []);

  const goToNext = useCallback(() => {
    if (!currentSequence || !currentStatus) {
      onClose();
      return;
    }

    markLocalViewed(currentStatus);

    if (statusIndex < currentSequence.statuses.length - 1) {
      setStatusIndex((current) => current + 1);
      resetTimer();
      return;
    }

    if (userIndex < sequences.length - 1) {
      setUserIndex((current) => current + 1);
      setStatusIndex(0);
      resetTimer();
      return;
    }

    onClose();
  }, [
    currentSequence,
    currentStatus,
    markLocalViewed,
    onClose,
    resetTimer,
    sequences.length,
    statusIndex,
    userIndex,
  ]);

  const goToPrevious = useCallback(() => {
    if (!currentSequence) {
      return;
    }

    if (statusIndex > 0) {
      setStatusIndex((current) => current - 1);
      resetTimer();
      return;
    }

    if (userIndex > 0) {
      const previousSequence = sequences[userIndex - 1];
      setUserIndex((current) => current - 1);
      setStatusIndex(Math.max(previousSequence.statuses.length - 1, 0));
      resetTimer();
    }
  }, [currentSequence, resetTimer, sequences, statusIndex, userIndex]);

  useEffect(() => {
    resetTimer();
    setIsPaused(false);
    setIsReplyFocused(false);
    setIsViewersOpen(false);
    setIsDeleteDialogOpen(false);
  }, [userIndex, statusIndex, resetTimer]);

  useEffect(() => {
    if (currentStatus) {
      markRemoteViewed(currentStatus);
    }
  }, [currentStatus, markRemoteViewed]);

  const isTimerPaused = isPaused || isReplyFocused || isDeleteDialogOpen;

  useEffect(() => {
    if (!sequences[userIndex] || sequences[userIndex].statuses.length === 0) {
      onClose();
    }
  }, [onClose, sequences, userIndex]);

  const handlePauseStart = () => {
    setIsPaused(true);
  };

  const handlePauseEnd = () => {
    setIsPaused(false);
  };

  const loadViewers = useCallback(async () => {
    if (!currentStatus) {
      return;
    }

    setIsLoadingViewers(true);
    setViewersError(null);

    try {
      const data = await getStatusViewers(currentStatus.id);
      setViewers(data);
      setViewerCount(data.length);
    } catch (error) {
      setViewersError(
        error instanceof Error ? error.message : "Failed to load viewers"
      );
    } finally {
      setIsLoadingViewers(false);
    }
  }, [currentStatus]);

  useEffect(() => {
    if (!isOwn || !currentStatus) {
      setViewerCount(null);
      return;
    }

    let cancelled = false;

    void getStatusViewers(currentStatus.id)
      .then((data) => {
        if (!cancelled) {
          setViewerCount(data.length);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setViewerCount(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentStatus, isOwn]);

  async function handleConfirmDelete() {
    if (!currentStatus || !currentSequence) {
      return;
    }

    const statusId = currentStatus.id;
    const ownerUserId = currentSequence.userId;

    setIsDeleting(true);

    try {
      await deleteStatus(statusId);
      setIsDeleteDialogOpen(false);
      onStatusDeleted(statusId, ownerUserId);
      toast.success("Status deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete status"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleReplySend() {
    if (!currentSequence || !replyText.trim() || isSendingReply) {
      return;
    }

    const conversationId = conversationIdByUserId.get(currentSequence.userId);
    const trimmedReply = replyText.trim();

    if (!conversationId) {
      toast.error("Could not find a chat with this user");
      return;
    }

    setIsSendingReply(true);

    try {
      await sendMessage(conversationId, {
        content: trimmedReply,
        replyToStatusId: currentStatus.id,
      });
      setReplyText("");
      onClose();
      router.push(`/chat/${encodeURIComponent(conversationId)}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send reply"
      );
    } finally {
      setIsSendingReply(false);
    }
  }

  if (!currentSequence || !currentStatus) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-100 flex flex-col bg-black pt-[env(safe-area-inset-top)] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Status viewer"
    >
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-3">
        {currentSequence.statuses.map((status, index) => (
          <div
            key={status.id}
            className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25"
          >
            {index < statusIndex ? (
              <div className="h-full w-full origin-left scale-x-100 bg-white" />
            ) : index === statusIndex ? (
              <div
                key={`${userIndex}-${statusIndex}-${status.id}`}
                className="status-progress-fill h-full w-full origin-left bg-white"
                style={{
                  animationDuration: `${STATUS_DURATION_MS}ms`,
                  animationPlayState: isTimerPaused ? "paused" : "running",
                }}
                onAnimationEnd={() => {
                  if (index === statusIndex) {
                    goToNext();
                  }
                }}
              />
            ) : null}
          </div>
        ))}
      </div>

      <header className="relative z-20 flex items-center gap-3 px-4 pt-6 pb-3">
        <Avatar className="size-9 shrink-0 border border-white/20">
          {currentSequence.avatarUrl ? (
            <AvatarImage
              src={currentSequence.avatarUrl}
              alt={currentSequence.fullName}
            />
          ) : null}
          <AvatarFallback
            className={cn("text-xs font-semibold text-white", signupGradientBgClass)}
          >
            {getInitials(currentSequence.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{currentSequence.fullName}</p>
          <p className="truncate text-[12px] text-white/70">
            {formatStatusTimestamp(currentStatus.createdAt)}
          </p>
        </div>

        {isOwn ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="relative z-30 text-white hover:bg-white/10 hover:text-white"
            aria-label="Delete status"
            onClick={() => {
              setIsPaused(true);
              setIsDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="size-4" strokeWidth={2} />
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-white hover:bg-white/10 hover:text-white"
          aria-label="Close status viewer"
          onClick={onClose}
        >
          <X className="size-4" strokeWidth={2} />
        </Button>
      </header>

      <div className="relative min-h-0 flex-1">
        <button
          type="button"
          className="absolute inset-y-0 left-0 z-10 w-1/3"
          aria-label="Previous status"
          onClick={goToPrevious}
          onMouseDown={handlePauseStart}
          onMouseUp={handlePauseEnd}
          onMouseLeave={handlePauseEnd}
          onTouchStart={handlePauseStart}
          onTouchEnd={handlePauseEnd}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 z-10 w-1/3"
          aria-label="Next status"
          onClick={goToNext}
          onMouseDown={handlePauseStart}
          onMouseUp={handlePauseEnd}
          onMouseLeave={handlePauseEnd}
          onTouchStart={handlePauseStart}
          onTouchEnd={handlePauseEnd}
        />

        <div
          className={cn(
            "relative h-full",
            currentStatus.type === "text" &&
              "flex items-center justify-center px-4 pb-24 pt-2"
          )}
        >
          {currentStatus.type === "text" ? (
            <div
              className="flex h-full max-h-[calc(100dvh-12rem)] w-full max-w-md items-center justify-center rounded-2xl px-6 py-10 text-center"
              style={{
                backgroundColor: currentStatus.backgroundColor ?? "#ff404f",
              }}
            >
              <p className="text-xl font-semibold leading-relaxed break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
                {currentStatus.content}
              </p>
            </div>
          ) : currentStatus.imageUrl ? (
            <StatusImageDisplay
              src={currentStatus.imageUrl}
              alt={currentStatus.content?.trim() || "Status image"}
              caption={currentStatus.content}
              className="absolute inset-0"
            />
          ) : (
            <div className="absolute inset-0 bg-black" />
          )}
        </div>
      </div>

      {isOwn ? (
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              setIsViewersOpen(true);
              void loadViewers();
            }}
            className="rounded-full bg-white/15 px-4 py-2 text-[13px] font-medium backdrop-blur-sm transition-ui hover:bg-white/20"
          >
            Viewed by {viewerCount ?? "..."}
          </button>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 z-20 border-t border-white/10 bg-black/70 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
          <div className="mx-auto flex max-w-md items-center gap-2">
            <Input
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              placeholder="Reply..."
              className="min-w-0 flex-1 border-white/15 bg-white/10 text-white placeholder:text-white/50"
              onFocus={() => setIsReplyFocused(true)}
              onBlur={() => setIsReplyFocused(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleReplySend();
                }
              }}
            />
            <Button
              type="button"
              size="icon-sm"
              className="shrink-0 bg-accent text-white hover:bg-accent-hover"
              disabled={!replyText.trim() || isSendingReply}
              aria-label="Send reply"
              onClick={() => void handleReplySend()}
            >
              {isSendingReply ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2} />
              ) : (
                <Send className="size-4" strokeWidth={2} />
              )}
            </Button>
          </div>
        </div>
      )}

      <StatusViewersSheet
        open={isViewersOpen}
        onClose={() => setIsViewersOpen(false)}
        viewers={viewers}
        isLoading={isLoadingViewers}
        error={viewersError}
        onRetry={() => void loadViewers()}
      />

      {isDeleteDialogOpen ? (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-status-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Cancel delete status"
            disabled={isDeleting}
            onClick={() => {
              setIsDeleteDialogOpen(false);
              setIsPaused(false);
            }}
          />
          <div className="relative w-full max-w-sm rounded-xl bg-popover p-4 text-popover-foreground shadow-2xl ring-1 ring-foreground/10">
            <div className="space-y-2">
              <h2
                id="delete-status-title"
                className="font-heading text-base font-medium leading-none"
              >
                Delete status?
              </h2>
              <p className="text-sm text-muted-foreground">
                This status will be removed from your updates. This action cannot
                be undone.
              </p>
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={isDeleting}
                onClick={() => {
              setIsDeleteDialogOpen(false);
              setIsPaused(false);
            }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
              >
                {isDeleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Delete"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

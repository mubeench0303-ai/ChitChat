"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  signupGradientBgClass,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  acceptRequest,
  blockRequest,
  getIncomingRequests,
  rejectRequest,
} from "@/lib/api/auth";
import type { IncomingMessageRequest } from "@/types";
import { cn } from "@/lib/utils";

type RequestAction = "accept" | "reject" | "block";

const fadeUp = (delay = 0, reduceMotion: boolean | null = false) => ({
  hidden: { opacity: 0, y: reduceMotion ? 0 : 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] as const },
  },
});

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

function RequestCardSkeleton() {
  return (
    <Card className="border-border/70 bg-surface-1/50 ring-0">
      <CardHeader className="flex flex-row items-start gap-3 pb-2">
        <Skeleton className="size-11 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pb-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
      <CardFooter className="gap-2 border-t-0 bg-transparent pt-0">
        <Skeleton className="h-8 flex-1 rounded-lg" />
        <Skeleton className="h-8 flex-1 rounded-lg" />
        <Skeleton className="h-8 flex-1 rounded-lg" />
      </CardFooter>
    </Card>
  );
}

function RequestCard({
  request,
  pendingAction,
  cardError,
  onAccept,
  onReject,
  onBlock,
}: {
  request: IncomingMessageRequest;
  pendingAction: RequestAction | null;
  cardError: string | null;
  onAccept: () => void;
  onReject: () => void;
  onBlock: () => void;
}) {
  const isBusy = pendingAction !== null;

  return (
    <Card className="border-border/70 bg-surface-1/50 ring-0">
      <CardHeader className="flex flex-row items-start gap-3 pb-2">
        <Avatar className="size-11">
          {request.requesterAvatarUrl ? (
            <AvatarImage
              src={request.requesterAvatarUrl}
              alt={request.requesterFullName}
            />
          ) : null}
          <AvatarFallback
            className={cn(
              "text-sm font-semibold text-white",
              signupGradientBgClass
            )}
          >
            {getInitials(request.requesterFullName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">
            {request.requesterFullName}
          </p>
          <p className={cn("truncate text-[13px] font-medium", signupGradientTextClass)}>
            @{request.requesterUsername}
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-1.5 pb-2">
        <p className="text-[13px] leading-relaxed text-text-secondary">
          {request.latestMessageContent}
        </p>
        <p className="text-xs text-text-muted">
          {formatRelativeTime(request.latestMessageAt)}
        </p>
      </CardContent>

      {cardError ? (
        <CardContent className="pt-0 pb-2">
          <p className="rounded-[13px] border border-border/70 bg-surface-1/50 px-3 py-2 text-[13px] leading-relaxed text-accent">
            {cardError}
          </p>
        </CardContent>
      ) : null}

      <CardFooter className="flex flex-wrap gap-2 border-t-0 bg-transparent pt-0">
        <Button
          type="button"
          className="min-w-0 flex-1"
          disabled={isBusy}
          onClick={onAccept}
        >
          {pendingAction === "accept" ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2} />
          ) : (
            "Accept"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-w-0 flex-1"
          disabled={isBusy}
          onClick={onReject}
        >
          {pendingAction === "reject" ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2} />
          ) : (
            "Reject"
          )}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="min-w-0 flex-1"
          disabled={isBusy}
          onClick={onBlock}
        >
          {pendingAction === "block" ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2} />
          ) : (
            "Block"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function RequestsPage() {
  const reduceMotion = useReducedMotion();
  const [requests, setRequests] = useState<IncomingMessageRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<
    Record<string, RequestAction | null>
  >({});
  const [cardErrors, setCardErrors] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadRequests() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getIncomingRequests();
        if (!cancelled) {
          setRequests(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setRequests([]);
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

    void loadRequests();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAction(
    conversationId: string,
    action: RequestAction,
    apiCall: (id: string) => Promise<{ message: string }>,
    successMessage: string
  ) {
    setPendingActions((current) => ({ ...current, [conversationId]: action }));
    setCardErrors((current) => ({ ...current, [conversationId]: null }));

    try {
      await apiCall(conversationId);
      setRequests((current) =>
        current.filter((request) => request.conversationId !== conversationId)
      );
      toast.success(successMessage);
    } catch (actionError) {
      const message =
        actionError instanceof Error ? actionError.message : "Something went wrong";
      setCardErrors((current) => ({ ...current, [conversationId]: message }));
    } finally {
      setPendingActions((current) => ({ ...current, [conversationId]: null }));
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <AuthShell className="min-h-full">
      <AuthCard aria-labelledby="requests-title">
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-text-muted transition-opacity hover:opacity-80"
        >
          <ArrowLeft className="size-4" strokeWidth={2} />
          Back to chat
        </Link>

        <motion.div
          variants={fadeUp(0.12, reduceMotion)}
          initial="hidden"
          animate="visible"
          className="mb-5 mt-6"
        >
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[1.2px]">
            <i
              className={cn(
                "block h-0.5 w-[18px] rounded-full",
                signupGradientBgClass
              )}
            />
            <span className={signupGradientTextClass}>Inbox</span>
          </span>
          <h1
            id="requests-title"
            className="mt-2.5 text-[clamp(1.75rem,5vw,2.25rem)] font-semibold leading-tight tracking-[-0.04em] text-text-primary"
          >
            Message requests
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            Review incoming requests and choose to accept, reject, or block.
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp(0.2, reduceMotion)}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {error ? (
            <p className="rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3 text-[13px] leading-relaxed text-accent">
              {error}
            </p>
          ) : null}

          {isLoading ? (
            <>
              <RequestCardSkeleton />
              <RequestCardSkeleton />
              <RequestCardSkeleton />
            </>
          ) : null}

          {!isLoading && requests.length > 0
            ? requests.map((request) => (
                <RequestCard
                  key={request.conversationId}
                  request={request}
                  pendingAction={pendingActions[request.conversationId] ?? null}
                  cardError={cardErrors[request.conversationId] ?? null}
                  onAccept={() =>
                    void handleAction(
                      request.conversationId,
                      "accept",
                      acceptRequest,
                      "Request accepted"
                    )
                  }
                  onReject={() =>
                    void handleAction(
                      request.conversationId,
                      "reject",
                      rejectRequest,
                      "Request rejected"
                    )
                  }
                  onBlock={() =>
                    void handleAction(
                      request.conversationId,
                      "block",
                      blockRequest,
                      "User blocked"
                    )
                  }
                />
              ))
            : null}

          {!isLoading && !error && requests.length === 0 ? (
            <div className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-3.5 py-10 text-center">
              <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-surface-1">
                <Inbox className="size-5 text-text-muted" strokeWidth={2} />
              </div>
              <p className="text-sm font-medium text-text-secondary">
                No pending requests
              </p>
              <p className="mt-1 text-[13px] text-text-muted">
                When someone sends you a message request, it will show up here.
              </p>
            </div>
          ) : null}
        </motion.div>
      </AuthCard>
      </AuthShell>
    </div>
  );
}

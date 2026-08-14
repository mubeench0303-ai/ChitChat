"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Inbox } from "lucide-react";

import { ProtectedPageFrame } from "@/components/layout/protected-page-frame";
import {
  ConversationPreviewRow,
  ConversationPreviewRowSkeleton,
} from "@/components/chat/conversation-preview-row";
import { getIncomingRequests } from "@/lib/api/auth";
import { subscribe } from "@/lib/ws/socket";
import type { IncomingMessageRequest, RequestReceivedEventPayload } from "@/types";

function sortRequests(requests: IncomingMessageRequest[]) {
  return [...requests].sort(
    (left, right) =>
      new Date(right.latestMessageAt).getTime() -
      new Date(left.latestMessageAt).getTime()
  );
}

export default function RequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<IncomingMessageRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRequests() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getIncomingRequests();
        if (!cancelled) {
          setRequests(sortRequests(data));
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

  useEffect(() => {
    const unsubscribe = subscribe("request_received", (payload) => {
      const event = payload as RequestReceivedEventPayload;

      setRequests((current) => {
        if (
          current.some(
            (request) => request.conversationId === event.conversationId
          )
        ) {
          return current;
        }

        const nextRequest: IncomingMessageRequest = {
          conversationId: event.conversationId,
          requesterId: event.requesterId,
          requesterFullName: event.requesterFullName,
          requesterUsername: event.requesterUsername,
          requesterAvatarUrl: event.requesterAvatarUrl,
          latestMessageContent: event.latestMessageContent,
          latestMessageAt: event.latestMessageAt,
          requestedAt: event.requestedAt,
        };

        return sortRequests([nextRequest, ...current]);
      });
    });

    return unsubscribe;
  }, []);

  return (
    <ProtectedPageFrame>
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-4 sm:px-6 sm:py-8">
        <header className="mb-5 shrink-0">
          <Link
            href="/chat"
            className="mb-4 inline-flex items-center gap-2 text-[13px] font-medium text-text-secondary transition-opacity hover:opacity-80"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
            Back to chats
          </Link>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-text-primary">
            Message requests
          </h1>
          <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
            People who want to connect with you
          </p>
        </header>

        <div className="flex-1 space-y-2.5">
          {error ? (
            <p className="rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3 text-[13px] leading-relaxed text-accent">
              {error}
            </p>
          ) : null}

          {isLoading ? (
            <>
              <ConversationPreviewRowSkeleton />
              <ConversationPreviewRowSkeleton />
              <ConversationPreviewRowSkeleton />
            </>
          ) : null}

          {!isLoading && requests.length > 0
            ? requests.map((request) => (
                <ConversationPreviewRow
                  key={request.conversationId}
                  conversation={{
                    conversationId: request.conversationId,
                    displayName: request.requesterFullName,
                    avatarUrl: request.requesterAvatarUrl,
                    latestMessageContent: request.latestMessageContent,
                    latestMessageAt: request.latestMessageAt,
                    isOnline: request.requesterIsOnline,
                  }}
                  onOpen={() =>
                    router.push(
                      `/chat/${encodeURIComponent(request.conversationId)}?from=requests`
                    )
                  }
                />
              ))
            : null}

          {!isLoading && !error && requests.length === 0 ? (
            <div className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-3.5 py-12 text-center">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-surface-2 text-text-muted">
                <Inbox className="size-5" strokeWidth={2} />
              </div>
              <p className="text-sm font-medium text-text-secondary">
                No pending requests
              </p>
              <p className="mt-1 text-[13px] text-text-muted">
                New message requests will appear here.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </ProtectedPageFrame>
  );
}

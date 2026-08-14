"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StatusRingAvatar } from "@/components/status/status-ring-avatar";
import { StatusViewerOverlay } from "@/components/status/status-viewer";
import {
  getLatestStatusTimestamp,
  isFeedEntryFullyViewed,
} from "@/components/status/status-utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getFriends,
  getMyStatuses,
  getStatusFeed,
} from "@/lib/api/auth";
import { useAuthStore } from "@/store/auth-store";
import type { Status, StatusFeedEntry, StatusUserSequence } from "@/types";

type ViewerState = {
  sequences: StatusUserSequence[];
  userIndex: number;
  statusIndex: number;
};

function MyStatusSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-4">
      <Skeleton className="size-16 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-44" />
      </div>
    </div>
  );
}

function FeedRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3.5">
      <Skeleton className="size-14 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

function buildOwnSequence(
  user: { id: string; fullName: string; username: string; avatarUrl?: string | null },
  statuses: Status[]
): StatusUserSequence | null {
  if (statuses.length === 0) {
    return null;
  }

  return {
    userId: user.id,
    fullName: user.fullName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    isOwn: true,
    statuses,
  };
}

function buildFeedSequences(feed: StatusFeedEntry[]): StatusUserSequence[] {
  return feed.map((entry) => ({
    userId: entry.userId,
    fullName: entry.fullName,
    username: entry.username,
    avatarUrl: entry.avatarUrl,
    isOwn: false,
    statuses: entry.statuses,
  }));
}

export default function StatusPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const [myStatuses, setMyStatuses] = useState<Status[]>([]);
  const [feed, setFeed] = useState<StatusFeedEntry[]>([]);
  const [viewedStatusIds, setViewedStatusIds] = useState<Set<string>>(
    () => new Set()
  );
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversationIdByUserId, setConversationIdByUserId] = useState<
    Map<string, string>
  >(new Map());

  const ownSequence = useMemo(() => {
    if (!user) {
      return null;
    }

    return buildOwnSequence(user, myStatuses);
  }, [myStatuses, user]);

  const feedSequences = useMemo(() => buildFeedSequences(feed), [feed]);

  const allSequences = useMemo(() => {
    const sequences: StatusUserSequence[] = [];
    if (ownSequence) {
      sequences.push(ownSequence);
    }
    sequences.push(...feedSequences);
    return sequences;
  }, [feedSequences, ownSequence]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [mine, feedData, friends] = await Promise.all([
        getMyStatuses(),
        getStatusFeed(),
        getFriends(),
      ]);

      setMyStatuses(mine);
      setFeed(feedData);
      setConversationIdByUserId(
        new Map(friends.map((friend) => [friend.id, friend.conversationId]))
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Something went wrong"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openViewer(userIndex: number, statusIndex = 0) {
    setViewerState({
      sequences: allSequences,
      userIndex,
      statusIndex,
    });
  }

  function handleMyStatusAvatarClick() {
    if (!user) {
      return;
    }

    if (myStatuses.length === 0) {
      router.push("/status/create");
      return;
    }

    openViewer(0, 0);
  }

  function handleAddStatusClick() {
    router.push("/status/create");
  }

  function handleFeedClick(feedIndex: number) {
    const userIndex = (ownSequence ? 1 : 0) + feedIndex;
    openViewer(userIndex, 0);
  }

  function handleStatusViewed(statusId: string) {
    setViewedStatusIds((current) => {
      const next = new Set(current);
      next.add(statusId);
      return next;
    });
  }

  function handleStatusDeleted(statusId: string, ownerUserId: string) {
    if (user && ownerUserId === user.id) {
      setMyStatuses((current) =>
        current.filter((status) => status.id !== statusId)
      );
    }

    setFeed((current) =>
      current
        .map((entry) =>
          entry.userId === ownerUserId
            ? {
                ...entry,
                statuses: entry.statuses.filter(
                  (status) => status.id !== statusId
                ),
              }
            : entry
        )
        .filter((entry) => entry.statuses.length > 0)
    );

    setViewerState((current) => {
      if (!current) {
        return null;
      }

      const nextSequences = current.sequences
        .map((sequence) =>
          sequence.userId === ownerUserId
            ? {
                ...sequence,
                statuses: sequence.statuses.filter(
                  (status) => status.id !== statusId
                ),
              }
            : sequence
        )
        .filter((sequence) => sequence.statuses.length > 0);

      if (nextSequences.length === 0) {
        return null;
      }

      const nextUserIndex = Math.min(current.userIndex, nextSequences.length - 1);
      const nextStatusIndex = Math.min(
        current.statusIndex,
        Math.max(nextSequences[nextUserIndex].statuses.length - 1, 0)
      );

      return {
        sequences: nextSequences,
        userIndex: nextUserIndex,
        statusIndex: nextStatusIndex,
      };
    });
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <header className="mb-5 shrink-0">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-text-primary">
            Status
          </h1>
          <p className="mt-1 hidden text-[13px] text-text-secondary sm:block">
            Share updates that disappear after 24 hours
          </p>
        </header>

        {error ? (
          <p className="mb-4 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3 text-[13px] leading-relaxed text-accent">
            {error}
          </p>
        ) : null}

        <section className="mb-6">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
            My Status
          </h2>

          {isLoading ? (
            <MyStatusSkeleton />
          ) : user ? (
            <div className="flex w-full items-center gap-4 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-4">
              <StatusRingAvatar
                fullName={user.fullName}
                avatarUrl={user.avatarUrl}
                size="lg"
                hasStatus={myStatuses.length > 0}
                viewed={false}
                showAddBadge
                onClick={handleMyStatusAvatarClick}
                onAddClick={handleAddStatusClick}
              />
              <button
                type="button"
                onClick={handleMyStatusAvatarClick}
                className="min-w-0 flex-1 text-left transition-ui hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <p className="text-sm font-semibold text-text-primary">
                  My Status
                </p>
                <p className="mt-0.5 text-[13px] text-text-secondary">
                  {myStatuses.length > 0
                    ? "Tap to view your status"
                    : "Tap to add status update"}
                </p>
              </button>
            </div>
          ) : null}
        </section>

        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
            Recent updates
          </h2>

          <div className="space-y-2.5">
            {isLoading ? (
              <>
                <FeedRowSkeleton />
                <FeedRowSkeleton />
                <FeedRowSkeleton />
              </>
            ) : null}

            {!isLoading && feed.length > 0
              ? feed.map((entry, index) => {
                  const viewed = isFeedEntryFullyViewed(
                    entry.statuses,
                    viewedStatusIds
                  );

                  return (
                    <button
                      key={entry.userId}
                      type="button"
                      onClick={() => handleFeedClick(index)}
                      className="flex w-full items-center gap-3 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3.5 text-left transition-ui hover:bg-surface-1/80"
                    >
                      <StatusRingAvatar
                        fullName={entry.fullName}
                        avatarUrl={entry.avatarUrl}
                        hasStatus
                        viewed={viewed}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text-primary">
                          {entry.fullName}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] text-text-secondary">
                          {getLatestStatusTimestamp(entry.statuses)}
                        </p>
                      </div>
                    </button>
                  );
                })
              : null}

            {!isLoading && !error && feed.length === 0 ? (
              <div className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-3.5 py-12 text-center">
                <p className="text-sm font-medium text-text-secondary">
                  No recent updates from your connections
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {viewerState ? (
        <StatusViewerOverlay
          key={`${viewerState.userIndex}-${viewerState.statusIndex}-${viewerState.sequences.reduce((count, sequence) => count + sequence.statuses.length, 0)}`}
          sequences={viewerState.sequences}
          initialUserIndex={viewerState.userIndex}
          initialStatusIndex={viewerState.statusIndex}
          conversationIdByUserId={conversationIdByUserId}
          onClose={() => setViewerState(null)}
          onStatusViewed={handleStatusViewed}
          onStatusDeleted={handleStatusDeleted}
        />
      ) : null}
    </div>
  );
}

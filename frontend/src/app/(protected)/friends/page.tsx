"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  signupGradientBgClass,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { getFriends } from "@/lib/api/auth";
import type { Friend } from "@/types";
import { cn } from "@/lib/utils";

function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function OnlineDot() {
  return (
    <span
      aria-hidden
      className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-surface-1 bg-success"
    />
  );
}

function FriendRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3.5">
      <Skeleton className="size-12 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

function FriendRow({
  friend,
  onOpen,
}: {
  friend: Friend;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full cursor-pointer items-center gap-3 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3.5 text-left transition-ui hover:bg-surface-1/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <div className="relative shrink-0">
        <Avatar className="size-12">
          {friend.avatarUrl ? (
            <AvatarImage src={friend.avatarUrl} alt={friend.fullName} />
          ) : null}
          <AvatarFallback
            className={cn(
              "text-sm font-semibold text-white",
              signupGradientBgClass
            )}
          >
            {getInitials(friend.fullName)}
          </AvatarFallback>
        </Avatar>
        {friend.isOnline === true ? <OnlineDot /> : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">
          {friend.fullName}
        </p>
        <p className={cn("mt-0.5 truncate text-[13px]", signupGradientTextClass)}>
          @{friend.username}
        </p>
      </div>
    </button>
  );
}

export default function FriendsPage() {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadFriends() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getFriends();
        if (!cancelled) {
          setFriends(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setFriends([]);
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

    void loadFriends();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <header className="mb-5 shrink-0">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-text-primary">
            Friends
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary">
            People you&apos;re connected with
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
              <FriendRowSkeleton />
              <FriendRowSkeleton />
              <FriendRowSkeleton />
            </>
          ) : null}

          {!isLoading && friends.length > 0
            ? friends.map((friend) => (
                <FriendRow
                  key={friend.id}
                  friend={friend}
                  onOpen={() =>
                    router.push(
                      `/chat/${encodeURIComponent(friend.conversationId)}`
                    )
                  }
                />
              ))
            : null}

          {!isLoading && !error && friends.length === 0 ? (
            <div className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-3.5 py-12 text-center">
              <p className="text-sm font-medium text-text-secondary">
                No friends yet — search for people to connect with
              </p>
              <Link
                href="/search"
                className={cn(
                  "mt-3 inline-flex text-[13px] font-semibold transition-opacity hover:opacity-80",
                  signupGradientTextClass
                )}
              >
                Find people
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

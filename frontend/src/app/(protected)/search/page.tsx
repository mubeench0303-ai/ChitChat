"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Search } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupTextInput } from "@/components/auth/signup-field";
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
import { searchUsers } from "@/lib/api/users";
import type { UserSearchResult } from "@/types";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 400;

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

function SearchResultSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3">
      <Skeleton className="size-11 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

function SearchResultRow({
  user,
  onSelect,
}: {
  user: UserSearchResult;
  onSelect: (user: UserSearchResult) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(user)}
      className="flex w-full cursor-pointer items-center gap-3 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3 text-left transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <Avatar className="size-11">
        {user.avatarUrl ? (
          <AvatarImage src={user.avatarUrl} alt={user.fullName} />
        ) : null}
        <AvatarFallback
          className={cn(
            "text-sm font-semibold text-white",
            signupGradientBgClass
          )}
        >
          {getInitials(user.fullName)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">
          {user.fullName}
        </p>
        <p className={cn("truncate text-[13px] font-medium", signupGradientTextClass)}>
          @{user.username}
        </p>
      </div>
    </button>
  );
}

export default function SearchPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const trimmedQuery = debouncedQuery.trim();

    if (!trimmedQuery) {
      setResults([]);
      setError(null);
      setIsSearching(false);
      return;
    }

    let cancelled = false;

    async function runSearch() {
      setIsSearching(true);
      setError(null);

      try {
        const data = await searchUsers(trimmedQuery);
        if (!cancelled) {
          setResults(data);
        }
      } catch (searchError) {
        if (!cancelled) {
          setResults([]);
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Something went wrong"
          );
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }

    void runSearch();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const trimmedDebouncedQuery = debouncedQuery.trim();
  const showEmptyState =
    !isSearching &&
    trimmedDebouncedQuery.length > 0 &&
    results.length === 0 &&
    !error;

  function handleSelectUser(user: UserSearchResult) {
    router.push(
      `/users/${encodeURIComponent(user.username)}?from=search`
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <AuthShell className="min-h-full">
      <AuthCard aria-labelledby="search-title">
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
            <span className={signupGradientTextClass}>Find people</span>
          </span>
          <h1
            id="search-title"
            className="mt-2.5 text-[clamp(1.75rem,5vw,2.25rem)] font-semibold leading-tight tracking-[-0.04em] text-text-primary"
          >
            Search users
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            Look up people by full name or @username.
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp(0.2, reduceMotion)}
          initial="hidden"
          animate="visible"
          className="mb-4"
        >
          <SignupTextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or @username"
            autoComplete="off"
            leadingIcon={<Search className="size-4" strokeWidth={2} />}
          />
        </motion.div>

        <motion.div
          variants={fadeUp(0.28, reduceMotion)}
          initial="hidden"
          animate="visible"
          className="space-y-2.5"
        >
          {error ? (
            <p className="rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3 text-[13px] leading-relaxed text-accent">
              {error}
            </p>
          ) : null}

          {isSearching ? (
            <>
              <SearchResultSkeleton />
              <SearchResultSkeleton />
              <SearchResultSkeleton />
            </>
          ) : null}

          {!isSearching && results.length > 0
            ? results.map((user) => (
                <SearchResultRow
                  key={user.id}
                  user={user}
                  onSelect={handleSelectUser}
                />
              ))
            : null}

          {showEmptyState ? (
            <div className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-3.5 py-8 text-center">
              <p className="text-sm font-medium text-text-secondary">
                No results
              </p>
              <p className="mt-1 text-[13px] text-text-muted">
                Try a different name or username.
              </p>
            </div>
          ) : null}
        </motion.div>
      </AuthCard>
      </AuthShell>
    </div>
  );
}

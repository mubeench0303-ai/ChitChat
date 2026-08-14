"use client";

import { Loader2, X } from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { signupGradientBgClass } from "@/components/auth/signup-submit-button";
import {
  formatStatusTimeAgo,
  getInitials,
} from "@/components/status/status-utils";
import type { StatusViewerEntry } from "@/types";
import { cn } from "@/lib/utils";

type StatusViewersSheetProps = {
  open: boolean;
  onClose: () => void;
  viewers: StatusViewerEntry[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
};

export function StatusViewersSheet({
  open,
  onClose,
  viewers,
  isLoading,
  error,
  onRetry,
}: StatusViewersSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-30">
      <button
        type="button"
        className="absolute inset-0 -top-[100vh] bg-black/40"
        aria-label="Close viewers list"
        onClick={onClose}
      />

      <div className="relative max-h-[55dvh] overflow-hidden rounded-t-[20px] bg-surface-1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Viewed by</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-ui hover:bg-surface-hover hover:text-text-primary"
            aria-label="Close viewers list"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <div className="max-h-[calc(55dvh-3.25rem)] overflow-y-auto px-4 py-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-text-muted">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-[13px] text-accent">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="text-[13px] font-semibold text-text-primary underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : viewers.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-text-secondary">
              No views yet
            </p>
          ) : (
            <div className="space-y-3">
              {viewers.map((viewer) => (
                <div key={viewer.id} className="flex items-center gap-3">
                  <Avatar className="size-10 shrink-0">
                    {viewer.avatarUrl ? (
                      <AvatarImage src={viewer.avatarUrl} alt={viewer.fullName} />
                    ) : null}
                    <AvatarFallback
                      className={cn(
                        "text-sm font-semibold text-white",
                        signupGradientBgClass
                      )}
                    >
                      {getInitials(viewer.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {viewer.fullName}
                    </p>
                    <p className="truncate text-[12px] text-text-muted">
                      @{viewer.username}
                    </p>
                  </div>
                  <span className="shrink-0 text-[12px] text-text-muted">
                    {formatStatusTimeAgo(viewer.viewedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

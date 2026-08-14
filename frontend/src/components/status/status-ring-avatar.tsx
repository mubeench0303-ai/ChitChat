"use client";

import { Plus } from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { signupGradientBgClass } from "@/components/auth/signup-submit-button";
import { getInitials } from "@/components/status/status-utils";
import { cn } from "@/lib/utils";

type StatusRingAvatarProps = {
  fullName: string;
  avatarUrl?: string | null;
  size?: "md" | "lg";
  hasStatus?: boolean;
  viewed?: boolean;
  showAddBadge?: boolean;
  onClick?: () => void;
  onAddClick?: () => void;
  className?: string;
};

export function StatusRingAvatar({
  fullName,
  avatarUrl,
  size = "md",
  hasStatus = false,
  viewed = false,
  showAddBadge = false,
  onClick,
  onAddClick,
  className,
}: StatusRingAvatarProps) {
  const avatarSize = size === "lg" ? "size-16" : "size-14";
  const ringPadding = size === "lg" ? "p-[3px]" : "p-[2.5px]";

  const ringClass = hasStatus
    ? viewed
      ? "bg-border"
      : cn("bg-linear-to-tr from-accent via-[#ff7a59] to-[#ffb347]")
    : "bg-transparent";

  const avatar = (
    <Avatar className={cn(avatarSize, "border-2 border-background")}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName} /> : null}
      <AvatarFallback
        className={cn("text-sm font-semibold text-white", signupGradientBgClass)}
      >
        {getInitials(fullName)}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 rounded-full",
        ringClass,
        hasStatus && ringPadding,
        className
      )}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {avatar}
        </button>
      ) : (
        avatar
      )}

      {showAddBadge ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAddClick?.();
          }}
          aria-label="Add status"
          className="absolute -right-0.5 -bottom-0.5 flex size-6 items-center justify-center rounded-full border-2 border-background bg-accent text-white shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <Plus className="size-3.5" strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}

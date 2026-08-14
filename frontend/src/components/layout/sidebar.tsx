"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleFadingPlus, Inbox, MessageSquare, Search, Settings, UserRound, UserRoundPlus } from "lucide-react";

import { signupGradientBgClass } from "@/components/auth/signup-submit-button";
import { CreateGroupDialog } from "@/components/chat/create-group-dialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { getIncomingRequests } from "@/lib/api/auth";
import { subscribe } from "@/lib/ws/socket";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

type NavItemId =
  | "chats"
  | "friends"
  | "status"
  | "requests"
  | "search"
  | "new-group"
  | "settings";

interface SidebarProps {
  onNavigate?: () => void;
  className?: string;
}

function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function isNavItemActive(id: NavItemId, pathname: string) {
  switch (id) {
    case "chats":
      return pathname === "/chat" || pathname.startsWith("/chat/");
    case "friends":
      return pathname === "/friends" || pathname.startsWith("/friends/");
    case "status":
      return pathname === "/status" || pathname.startsWith("/status/");
    case "requests":
      return pathname === "/requests" || pathname.startsWith("/requests/");
    case "search":
      return pathname === "/search" || pathname.startsWith("/search/");
    case "settings":
      return pathname === "/settings" || pathname.startsWith("/settings/");
    default:
      return false;
  }
}

function SidebarNavItem({
  icon,
  label,
  href,
  isActive,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  isActive?: boolean;
  badge?: number;
  onClick?: () => void;
}) {
  const className = cn(
    "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-ui sm:py-2.5",
    isActive
      ? "bg-accent-subtle text-text-primary"
      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
  );

  const content = (
    <>
      {isActive ? (
        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
      ) : null}
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
          isActive
            ? "bg-accent text-white"
            : "bg-surface-2 text-text-secondary group-hover:text-text-primary"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge && badge > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  );
}

export function Sidebar({ onNavigate, className }: SidebarProps) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRequestCount() {
      try {
        const requests = await getIncomingRequests();
        if (!cancelled) {
          setPendingRequestCount(requests.length);
        }
      } catch {
        if (!cancelled) {
          setPendingRequestCount(0);
        }
      }
    }

    void loadRequestCount();

    const unsubscribe = subscribe("request_received", () => {
      setPendingRequestCount((current) => current + 1);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [pathname]);

  function handleNavClick() {
    onNavigate?.();
  }

  function handleOpenCreateGroup() {
    setIsCreateGroupOpen(true);
    onNavigate?.();
  }

  return (
    <>
      <aside
        className={cn(
          "flex h-full min-h-0 w-[272px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-4 sm:py-5",
          className
        )}
      >
        <div className="mb-4 shrink-0 px-1 sm:mb-5">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-sm",
                signupGradientBgClass
              )}
            >
              <MessageSquare className="size-5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-[-0.02em] text-sidebar-foreground">
                ChitChat
              </p>
              <p className="truncate text-[11px] font-medium text-text-muted">
                Stay connected
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <nav className="space-y-1">
            <SidebarNavItem
              icon={<MessageSquare className="size-4" strokeWidth={2} />}
              label="Chats"
              href="/chat"
              isActive={isNavItemActive("chats", pathname)}
              onClick={handleNavClick}
            />
            <SidebarNavItem
              icon={<UserRound className="size-4" strokeWidth={2} />}
              label="Friends"
              href="/friends"
              isActive={isNavItemActive("friends", pathname)}
              onClick={handleNavClick}
            />
            <SidebarNavItem
              icon={<CircleFadingPlus className="size-4" strokeWidth={2} />}
              label="Status"
              href="/status"
              isActive={isNavItemActive("status", pathname)}
              onClick={handleNavClick}
            />
            <SidebarNavItem
              icon={<Inbox className="size-4" strokeWidth={2} />}
              label="Requests"
              href="/requests"
              isActive={isNavItemActive("requests", pathname)}
              badge={pendingRequestCount}
              onClick={handleNavClick}
            />
            <SidebarNavItem
              icon={<Search className="size-4" strokeWidth={2} />}
              label="Search"
              href="/search"
              isActive={isNavItemActive("search", pathname)}
              onClick={handleNavClick}
            />
            <SidebarNavItem
              icon={<UserRoundPlus className="size-4" strokeWidth={2} />}
              label="New Group"
              onClick={handleOpenCreateGroup}
            />
            <SidebarNavItem
              icon={<Settings className="size-4" strokeWidth={2} />}
              label="Settings"
              href="/settings"
              isActive={isNavItemActive("settings", pathname)}
              onClick={handleNavClick}
            />
          </nav>
        </div>

        <div className="shrink-0 border-t border-sidebar-border pt-3 sm:pt-4">
          <Link
            href="/settings"
            onClick={handleNavClick}
            className="flex items-center gap-3 rounded-[14px] border border-sidebar-border bg-surface-1 px-3 py-2.5 transition-ui hover:bg-surface-hover sm:py-3"
          >
            <div className="relative shrink-0">
              <Avatar className="size-11">
                {user?.avatarUrl ? (
                  <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                ) : null}
                <AvatarFallback
                  className={cn(
                    "text-sm font-semibold text-white",
                    signupGradientBgClass
                  )}
                >
                  {getInitials(user?.fullName ?? "User")}
                </AvatarFallback>
              </Avatar>
              {user?.isOnline ? (
                <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-surface-1 bg-success" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary">
                {user?.fullName ?? "Your account"}
              </p>
              <p className="truncate text-[12px] text-text-muted">
                {user?.isOnline ? "Online" : "Offline"}
              </p>
            </div>
          </Link>
        </div>
      </aside>

      <CreateGroupDialog
        open={isCreateGroupOpen}
        onOpenChange={setIsCreateGroupOpen}
      />
    </>
  );
}

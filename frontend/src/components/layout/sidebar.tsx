"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CircleFadingPlus, Inbox, MessageSquare, Search, Settings, Sparkles, UserRound, UserRoundPlus } from "lucide-react";

import { signupGradientBgClass } from "@/components/auth/signup-submit-button";
import { CreateGroupDialog } from "@/components/chat/create-group-dialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { getChatList, getIncomingRequests } from "@/lib/api/auth";
import { subscribe } from "@/lib/ws/socket";
import { useAuthStore } from "@/store/auth-store";
import { useChatListStore } from "@/store/chat-list-store";
import { cn } from "@/lib/utils";

type NavItemId =
  | "chats"
  | "assistant"
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

function isNavItemActive(
  id: NavItemId,
  pathname: string,
  systemConversationId?: string
) {
  switch (id) {
    case "assistant":
      return systemConversationId
        ? pathname === `/chat/${systemConversationId}`
        : false;
    case "chats":
      return (
        (pathname === "/chat" || pathname.startsWith("/chat/")) &&
        (!systemConversationId || pathname !== `/chat/${systemConversationId}`)
      );
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
  const isSettings = label === "Settings";
  const isStatus = label === "Status";
  const isAssistant = label === "AI Assistant";

  const className = cn(
    "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-all duration-200 sm:py-2.5",
    isActive
      ? "bg-accent-subtle text-text-primary shadow-xs"
      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary active:scale-[0.98]"
  );

  const content = (
    <>
      {isActive ? (
        <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-accent shadow-[0_0_8px_var(--accent)] transition-all duration-300" />
      ) : null}
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
          isActive
            ? "bg-accent text-white shadow-xs"
            : "bg-surface-2 text-text-secondary group-hover:bg-surface-1 group-hover:text-text-primary"
        )}
      >
        <span
          className={cn(
            "flex items-center justify-center transition-transform duration-300",
            isSettings
              ? "group-hover:rotate-90 group-hover:scale-110"
              : isStatus
              ? "group-hover:scale-115 group-hover:rotate-6"
              : isAssistant
              ? "group-hover:scale-125 group-hover:rotate-12 duration-300"
              : "group-hover:scale-115 group-hover:-rotate-3"
          )}
        >
          {icon}
        </span>
      </span>
      <span className="min-w-0 flex-1 truncate transition-colors duration-150">{label}</span>
      {badge && badge > 0 ? (
        <span className="inline-flex min-w-5 animate-badge-pop items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-xs">
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
  const conversations = useChatListStore((state) => state.conversations);
  const setConversations = useChatListStore((state) => state.setConversations);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [systemConvoId, setSystemConvoId] = useState<string | null>(null);

  useEffect(() => {
    const found = conversations.find((c) => c.participantIsSystem === true);
    if (found) {
      setSystemConvoId(found.conversationId);
      return;
    }

    let cancelled = false;
    async function fetchList() {
      try {
        const list = await getChatList();
        if (!cancelled) {
          setConversations(list);
          const ai = list.find((c) => c.participantIsSystem === true);
          if (ai) {
            setSystemConvoId(ai.conversationId);
          }
        }
      } catch {
        // silent
      }
    }
    void fetchList();
    return () => {
      cancelled = true;
    };
  }, [conversations, setConversations]);

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

  const assistantHref = systemConvoId
    ? `/chat/${encodeURIComponent(systemConvoId)}`
    : "/chat";

  return (
    <>
      <aside
        className={cn(
          "flex h-full min-h-0 w-[272px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-4 sm:py-5",
          className
        )}
      >
        <div className="mb-4 shrink-0 px-1 sm:mb-5">
          <Link
            href="/chat"
            className="inline-flex items-center gap-2.5 font-semibold tracking-[-0.04em] text-sidebar-foreground no-underline transition-opacity hover:opacity-90"
          >
            <motion.span
              aria-hidden
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-[10px] text-sm text-white shadow-[0_8px_24px_color-mix(in_srgb,var(--accent)_32%,transparent)]",
                signupGradientBgClass
              )}
              animate={{ rotate: 360 }}
              transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
            >
              ✦
            </motion.span>
            <span className="text-[19px] font-semibold tracking-[-0.04em] text-text-primary">
              chitchat
            </span>
          </Link>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <nav className="space-y-1">
            <SidebarNavItem
              icon={<MessageSquare className="size-4" strokeWidth={2} />}
              label="Chats"
              href="/chat"
              isActive={isNavItemActive("chats", pathname, systemConvoId ?? undefined)}
              onClick={handleNavClick}
            />
            <SidebarNavItem
              icon={<Sparkles className="size-4" strokeWidth={2} />}
              label="AI Assistant"
              href={assistantHref}
              isActive={isNavItemActive("assistant", pathname, systemConvoId ?? undefined)}
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
            className="group flex items-center gap-3 rounded-[14px] border border-sidebar-border bg-surface-1 px-3 py-2.5 transition-all duration-200 hover:border-border hover:bg-surface-hover active:scale-[0.98] sm:py-3"
          >
            <div className="relative shrink-0">
              <Avatar className="size-11 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-2">
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
                <span className="absolute right-0 bottom-0 size-3 animate-dot-pulse rounded-full border-2 border-surface-1 bg-success" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary transition-colors group-hover:text-accent">
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

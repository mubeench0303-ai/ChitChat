"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createGroup, getFriends } from "@/lib/api/auth";
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

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateGroupDialog({ open, onOpenChange }: CreateGroupDialogProps) {
  const router = useRouter();
  const [connections, setConnections] = useState<Friend[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadConnections() {
      setIsLoadingConnections(true);

      try {
        const list = await getFriends();
        if (!cancelled) {
          setConnections(list);
        }
      } catch {
        if (!cancelled) {
          setConversations([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingConnections(false);
        }
      }
    }

    void loadConnections();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const connectionOptions = useMemo(
    () =>
      connections.map((connection) => ({
        id: connection.id,
        fullName: connection.fullName,
        username: connection.username,
        avatarUrl: connection.avatarUrl,
      })),
    [connections]
  );

  const filteredOptions = connectionOptions.filter((connection) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return (
      connection.fullName.toLowerCase().includes(query) ||
      connection.username.toLowerCase().includes(query)
    );
  });

  function resetDialog() {
    setGroupName("");
    setSelectedMemberIds([]);
    setSearchQuery("");
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !isCreating) {
      resetDialog();
    }

    onOpenChange(nextOpen);
  }

  function toggleMemberSelection(memberId: string) {
    setSelectedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    );
  }

  async function handleCreateGroup() {
    const trimmedName = groupName.trim();
    if (!trimmedName || selectedMemberIds.length < 1) {
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const group = await createGroup(trimmedName, selectedMemberIds);
      handleOpenChange(false);
      router.push(`/chat/${encodeURIComponent(group.id)}`);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Something went wrong"
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!isCreating}
        className="flex max-h-[min(90dvh,640px)] flex-col sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Create a group</DialogTitle>
          <DialogDescription>
            Choose a name and add members from your connections.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <label
              htmlFor="group-name"
              className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted"
            >
              Group name
            </label>
            <Input
              id="group-name"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Weekend crew"
              maxLength={100}
              disabled={isCreating}
            />
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
              Members
            </p>
            {isLoadingConnections ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded-[13px]" />
                <Skeleton className="h-[52px] w-full rounded-xl" />
                <Skeleton className="h-[52px] w-full rounded-xl" />
                <Skeleton className="h-[52px] w-full rounded-xl" />
              </div>
            ) : connectionOptions.length === 0 ? (
              <p className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-3.5 py-4 text-[13px] text-text-muted">
                No accepted connections yet. Start a chat first, then create a group.
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
                    strokeWidth={2}
                  />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search connections..."
                    disabled={isCreating}
                    className="pl-9"
                  />
                </div>

                {selectedMemberIds.length > 0 ? (
                  <p className="text-[13px] font-medium text-text-secondary">
                    {selectedMemberIds.length} selected
                  </p>
                ) : null}

                {filteredOptions.length === 0 ? (
                  <p className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-3.5 py-4 text-[13px] text-text-muted">
                    No connections match your search.
                  </p>
                ) : (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-[13px] border border-border/70 bg-surface-1/30 p-2">
                    {filteredOptions.map((connection) => {
                      const isSelected = selectedMemberIds.includes(connection.id);

                      return (
                        <label
                          key={connection.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-xl border px-2.5 py-2 transition-colors hover:bg-surface-1/80",
                            isSelected
                              ? "border-accent/30 bg-surface-1/80"
                              : "border-transparent"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleMemberSelection(connection.id)}
                            disabled={isCreating}
                            className="size-4 shrink-0 accent-accent"
                          />
                          <Avatar className="size-11 shrink-0">
                            {connection.avatarUrl ? (
                              <AvatarImage
                                src={connection.avatarUrl}
                                alt={connection.fullName}
                              />
                            ) : null}
                            <AvatarFallback
                              className={cn(
                                "text-sm font-semibold text-white",
                                signupGradientBgClass
                              )}
                            >
                              {getInitials(connection.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-text-primary">
                              {connection.fullName}
                            </span>
                            <span
                              className={cn(
                                "block truncate text-[13px] font-medium",
                                signupGradientTextClass
                              )}
                            >
                              @{connection.username}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {error ? (
            <p className="text-[13px] leading-relaxed text-accent">{error}</p>
          ) : null}
        </div>

        <DialogFooter className="border-t-0 bg-transparent sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isCreating}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-accent text-white hover:bg-accent-hover"
            disabled={
              isCreating || !groupName.trim() || selectedMemberIds.length < 1
            }
            onClick={() => void handleCreateGroup()}
          >
            {isCreating ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={2} />
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

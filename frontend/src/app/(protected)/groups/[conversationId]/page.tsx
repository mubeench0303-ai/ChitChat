"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Crown,
  Loader2,
  LogOut,
  MoreVertical,
  Pencil,
  Search,
  Shield,
  ShieldOff,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addGroupMembers,
  getFriends,
  getGroupInfo,
  leaveGroup,
  removeGroupMember,
  updateGroupAvatar,
  updateGroupInfo,
  updateMemberRole,
} from "@/lib/api/auth";
import { useAuthStore } from "@/store/auth-store";
import type { GroupConversation, GroupMemberDetail } from "@/types";
import { cn } from "@/lib/utils";

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type PendingConfirmAction =
  | { type: "remove-member"; member: GroupMemberDetail }
  | { type: "role-change"; member: GroupMemberDetail; role: "admin" | "member" }
  | { type: "leave-group" };

type ConnectionOption = {
  id: string;
  fullName: string;
  username: string;
  avatarUrl?: string | null;
};

const avatarRingGradient =
  "conic-gradient(from 0deg, #e6404d, #ff7347, #ffb347, #ffd166, #06d6a0, #4cc9f0, #4361ee, #7209b7, #e6404d)";

function getInitials(name: string) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function validateAvatarFile(file: File): string | null {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return "Avatar must be a JPEG, PNG, or WebP image.";
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return "Avatar must be at most 5MB.";
  }

  return null;
}

function GroupInfoSkeleton() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-5 sm:px-6 sm:py-8">
      <Skeleton className="h-5 w-28" />
      <div className="mt-8 flex flex-col items-center gap-3 text-center">
        <Skeleton className="size-28 rounded-full" />
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="mt-8 border-t border-border/70 pt-6">
        <Skeleton className="mb-3 h-4 w-20" />
        <div className="space-y-2">
          <Skeleton className="h-[68px] w-full rounded-[13px]" />
          <Skeleton className="h-[68px] w-full rounded-[13px]" />
          <Skeleton className="h-[68px] w-full rounded-[13px]" />
        </div>
      </div>
    </div>
  );
}

function MemberRow({
  member,
  groupId,
  creatorId,
  isCurrentUser,
  showMemberMenu,
  isRoleActionLoading,
  onManageRole,
  onRemove,
}: {
  member: GroupMemberDetail;
  groupId: string;
  creatorId: string | null;
  isCurrentUser: boolean;
  showMemberMenu: boolean;
  isRoleActionLoading: boolean;
  onManageRole: () => void;
  onRemove: () => void;
}) {
  const isCreator = creatorId === member.id;
  const isAdmin = member.role === "admin";

  return (
    <div className="flex items-center gap-3 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3 transition-ui hover:bg-surface-1/70">
      <Link
        href={`/users/${encodeURIComponent(member.username)}?from=group&groupId=${encodeURIComponent(groupId)}`}
        className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-85"
      >
        <Avatar className="size-11 shrink-0">
          {member.avatarUrl ? (
            <AvatarImage src={member.avatarUrl} alt={member.fullName} />
          ) : null}
          <AvatarFallback
            className={cn(
              "text-sm font-semibold text-white",
              signupGradientBgClass
            )}
          >
            {getInitials(member.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-text-primary">
              {member.fullName}
              {isCurrentUser ? (
                <span className="font-normal text-text-muted"> (You)</span>
              ) : null}
            </p>
            {isCreator ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border/70 bg-surface-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                <Crown className="size-3" strokeWidth={2} />
                Owner
              </span>
            ) : null}
            {isAdmin ? (
              <span
                className={cn(
                  "shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  signupGradientTextClass
                )}
              >
                Admin
              </span>
            ) : null}
          </div>
          <p className={cn("truncate text-[13px] font-medium", signupGradientTextClass)}>
            @{member.username}
          </p>
        </div>
      </Link>

      {showMemberMenu && !isCreator ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                disabled={isRoleActionLoading}
                aria-label={`Manage ${member.fullName}`}
              />
            }
          >
            {isRoleActionLoading ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={2} />
            ) : (
              <MoreVertical className="size-4" strokeWidth={2} />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem
              disabled={Boolean(isRoleActionLoading)}
              onClick={onManageRole}
            >
              {isAdmin ? (
                <>
                  <ShieldOff className="size-4" strokeWidth={2} />
                  Remove Admin
                </>
              ) : (
                <>
                  <Shield className="size-4" strokeWidth={2} />
                  Make Admin
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={Boolean(isRoleActionLoading)}
              onClick={onRemove}
            >
              <UserMinus className="size-4" strokeWidth={2} />
              Remove from Group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export default function GroupInfoPage() {
  const router = useRouter();
  const params = useParams<{ conversationId: string }>();
  const conversationId = params.conversationId;
  const currentUser = useAuthStore((state) => state.user);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [group, setGroup] = useState<GroupConversation | null>(null);
  const [members, setMembers] = useState<GroupMemberDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [avatarValidationError, setAvatarValidationError] = useState<string | null>(null);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);
  const [connectionOptions, setConnectionOptions] = useState<ConnectionOption[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [addMembersSearchQuery, setAddMembersSearchQuery] = useState("");
  const [addMembersError, setAddMembersError] = useState<string | null>(null);
  const [isAddingMembers, setIsAddingMembers] = useState(false);

  const [pendingConfirmAction, setPendingConfirmAction] =
    useState<PendingConfirmAction | null>(null);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  const [roleActionLoadingUserId, setRoleActionLoadingUserId] = useState<string | null>(
    null
  );

  const currentMember = members.find((member) => member.id === currentUser?.id);
  const isAdmin = currentMember?.role === "admin";
  const groupDisplayName = group?.name?.trim() || "Group";
  const creatorId = group?.createdBy ?? null;

  const clearAvatarSelection = useCallback(() => {
    setPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
      }
      return null;
    });
    setSelectedFile(null);
    setAvatarValidationError(null);
    setAvatarUploadError(null);
  }, []);

  const reloadGroupInfo = useCallback(async () => {
    if (!conversationId) {
      return;
    }

    const data = await getGroupInfo(conversationId);
    setGroup(data.group);
    setMembers(data.members);
    setEditedName(data.group.name?.trim() ?? "");
  }, [conversationId]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!conversationId) {
      setIsLoading(false);
      setLoadError("Invalid group");
      return;
    }

    let cancelled = false;

    async function loadGroupInfo() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const data = await getGroupInfo(conversationId);
        if (cancelled) {
          return;
        }

        setGroup(data.group);
        setMembers(data.members);
        setEditedName(data.group.name?.trim() ?? "");
      } catch (error) {
        if (!cancelled) {
          setGroup(null);
          setMembers([]);
          setLoadError(
            error instanceof Error ? error.message : "Something went wrong"
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadGroupInfo();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!isAddMembersOpen || !conversationId) {
      return;
    }

    let cancelled = false;

    async function loadConnections() {
      setIsLoadingConnections(true);
      setAddMembersError(null);

      try {
        const friends = await getFriends();
        if (cancelled) {
          return;
        }

        const memberIds = new Set(members.map((member) => member.id));
        const options = friends.reduce<ConnectionOption[]>((accumulator, friend) => {
          if (memberIds.has(friend.id)) {
            return accumulator;
          }

          if (accumulator.some((entry) => entry.id === friend.id)) {
            return accumulator;
          }

          accumulator.push({
            id: friend.id,
            fullName: friend.fullName,
            username: friend.username,
            avatarUrl: friend.avatarUrl,
          });

          return accumulator;
        }, []);

        setConnectionOptions(options);
      } catch (error) {
        if (!cancelled) {
          setConnectionOptions([]);
          setAddMembersError(
            error instanceof Error ? error.message : "Failed to load connections"
          );
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
  }, [isAddMembersOpen, conversationId, members]);

  function resetAddMembersDialog() {
    setSelectedMemberIds([]);
    setAddMembersSearchQuery("");
    setAddMembersError(null);
  }

  function toggleMemberSelection(memberId: string) {
    setSelectedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    );
  }

  async function handleSaveName() {
    const trimmedName = editedName.trim();
    if (!trimmedName || !conversationId) {
      return;
    }

    setIsSavingName(true);
    setNameError(null);

    try {
      await updateGroupInfo(conversationId, trimmedName);
      setGroup((current) =>
        current ? { ...current, name: trimmedName } : current
      );
      setIsEditingName(false);
      toast.success("Group name updated.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      setNameError(message);
      toast.error(message);
    } finally {
      setIsSavingName(false);
    }
  }

  function handleAvatarFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    setAvatarUploadError(null);

    if (!file) {
      return;
    }

    const validationMessage = validateAvatarFile(file);
    if (validationMessage) {
      clearAvatarSelection();
      setAvatarValidationError(validationMessage);
      toast.error(validationMessage);
      return;
    }

    setAvatarValidationError(null);
    setPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
      }
      return URL.createObjectURL(file);
    });
    setSelectedFile(file);
  }

  async function handleSaveAvatar() {
    if (!selectedFile || !conversationId) {
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarUploadError(null);

    try {
      const updatedGroup = await updateGroupAvatar(conversationId, selectedFile);
      setGroup(updatedGroup);
      clearAvatarSelection();
      toast.success("Group photo updated.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed, try again.";
      setAvatarUploadError(message);
      toast.error(message);
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleAddMembers() {
    if (!conversationId || !isAdmin || selectedMemberIds.length < 1) {
      return;
    }

    setIsAddingMembers(true);
    setAddMembersError(null);

    try {
      await addGroupMembers(conversationId, selectedMemberIds);
      await reloadGroupInfo();
      setIsAddMembersOpen(false);
      resetAddMembersDialog();
      toast.success("Members added.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      if (message.toLowerCase().includes("not authorized")) {
        toast.error(message);
        setIsAddMembersOpen(false);
        return;
      }
      setAddMembersError(message);
    } finally {
      setIsAddingMembers(false);
    }
  }

  async function handleConfirmAction() {
    if (!conversationId || !pendingConfirmAction) {
      return;
    }

    setIsConfirmLoading(true);

    try {
      if (pendingConfirmAction.type === "remove-member") {
        if (!isAdmin) {
          toast.error("You are not authorized to remove members.");
          return;
        }

        await removeGroupMember(conversationId, pendingConfirmAction.member.id);
        await reloadGroupInfo();
        toast.success(`${pendingConfirmAction.member.fullName} was removed.`);
      } else if (pendingConfirmAction.type === "role-change") {
        if (!isAdmin) {
          toast.error("You are not authorized to change member roles.");
          return;
        }

        const { member, role } = pendingConfirmAction;
        setRoleActionLoadingUserId(member.id);

        try {
          await updateMemberRole(conversationId, member.id, role);
          await reloadGroupInfo();
          toast.success(
            role === "admin"
              ? `${member.fullName} is now an admin.`
              : `Admin rights removed from ${member.fullName}.`
          );
        } finally {
          setRoleActionLoadingUserId(null);
        }
      } else {
        await leaveGroup(conversationId);
        toast.success(`You left ${groupDisplayName}.`);
        router.replace("/chat");
      }

      setPendingConfirmAction(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
      setPendingConfirmAction(null);
    } finally {
      setIsConfirmLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto bg-background">
        <GroupInfoSkeleton />
      </div>
    );
  }

  if (loadError || !group) {
    return (
      <div className="h-full overflow-y-auto bg-background">
        <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-text-muted transition-opacity hover:opacity-80"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
            Back to chats
          </Link>
          <p className="mt-6 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3 text-[13px] leading-relaxed text-accent">
            {loadError ?? "Group not found"}
          </p>
        </div>
      </div>
    );
  }

  const displayedAvatarUrl = previewUrl ?? group.avatarUrl ?? null;
  const hasPendingAvatar = Boolean(selectedFile && previewUrl);
  const adminCount = members.filter((member) => member.role === "admin").length;
  const isSoleAdmin = isAdmin && adminCount === 1;
  const memberCount = group.memberCount ?? members.length;
  const filteredConnectionOptions = connectionOptions.filter((connection) => {
    const query = addMembersSearchQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return (
      connection.fullName.toLowerCase().includes(query) ||
      connection.username.toLowerCase().includes(query)
    );
  });

  const confirmTitle =
    pendingConfirmAction?.type === "remove-member"
      ? `Remove ${pendingConfirmAction.member.fullName} from the group?`
      : pendingConfirmAction?.type === "role-change"
        ? pendingConfirmAction.role === "admin"
          ? `Make ${pendingConfirmAction.member.fullName} an admin?`
          : `Remove admin rights from ${pendingConfirmAction.member.fullName}?`
        : pendingConfirmAction?.type === "leave-group"
          ? `Leave ${groupDisplayName}?`
          : "";

  const confirmDescription =
    pendingConfirmAction?.type === "remove-member"
      ? "They will no longer be able to see group messages unless added again."
      : pendingConfirmAction?.type === "role-change"
        ? pendingConfirmAction.role === "admin"
          ? "They will be able to manage members and group settings."
          : "They will remain in the group as a regular member."
        : pendingConfirmAction?.type === "leave-group"
          ? isSoleAdmin
            ? "You're the only admin — the oldest member will become admin when you leave."
            : "You will lose access to this group and its message history."
          : "";

  const confirmButtonLabel =
    pendingConfirmAction?.type === "remove-member"
      ? "Remove"
      : pendingConfirmAction?.type === "role-change"
        ? pendingConfirmAction.role === "admin"
          ? "Make Admin"
          : "Remove Admin"
        : pendingConfirmAction?.type === "leave-group"
          ? "Leave Group"
          : "Confirm";

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <Link
            href={`/chat/${encodeURIComponent(conversationId)}`}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-text-muted transition-opacity hover:opacity-80"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
            Back to chat
          </Link>
        </header>

        <div className="text-center">
          <div className="relative mx-auto mb-4 inline-block">
            <div
              className={cn(
                "inline-flex rounded-full p-[3px] shadow-[0_8px_24px_color-mix(in_srgb,var(--accent)_18%,transparent)]",
                isAdmin && !isUploadingAvatar && "cursor-pointer"
              )}
              style={{ background: avatarRingGradient }}
              onClick={() => {
                if (isAdmin && !isUploadingAvatar) {
                  fileInputRef.current?.click();
                }
              }}
              onKeyDown={(event) => {
                if (
                  isAdmin &&
                  !isUploadingAvatar &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              role={isAdmin ? "button" : undefined}
              tabIndex={isAdmin ? 0 : undefined}
              aria-label={isAdmin ? "Change group photo" : undefined}
            >
              <div className="group/avatar relative rounded-full bg-background">
              <Avatar className="size-28">
                {displayedAvatarUrl ? (
                  <AvatarImage src={displayedAvatarUrl} alt={groupDisplayName} />
                ) : null}
                <AvatarFallback
                  className={cn(
                    "text-2xl font-semibold text-white",
                    signupGradientBgClass
                  )}
                >
                  {groupDisplayName.trim() ? (
                    getInitials(groupDisplayName)
                  ) : (
                    <Users className="size-8" strokeWidth={2} />
                  )}
                </AvatarFallback>
              </Avatar>

              {isAdmin ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover/avatar:opacity-100 group-focus-within/avatar:opacity-100">
                  {isUploadingAvatar ? (
                    <Loader2
                      className="size-6 animate-spin text-white"
                      strokeWidth={2}
                    />
                  ) : (
                    <Camera className="size-6 text-white" strokeWidth={2} />
                  )}
                </div>
              ) : null}
              </div>
            </div>

            {isAdmin ? (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
            ) : null}
          </div>

          {avatarValidationError ? (
            <p className="mb-2 text-[13px] text-accent">{avatarValidationError}</p>
          ) : null}

          {hasPendingAvatar ? (
            <div className="mb-4 flex items-center justify-center gap-2">
              <Button
                type="button"
                size="sm"
                className="bg-accent text-white hover:bg-accent-hover"
                disabled={isUploadingAvatar}
                onClick={() => void handleSaveAvatar()}
              >
                {isUploadingAvatar ? (
                  <Loader2 className="size-4 animate-spin" strokeWidth={2} />
                ) : (
                  "Save photo"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploadingAvatar}
                onClick={clearAvatarSelection}
              >
                Cancel
              </Button>
            </div>
          ) : null}

          {avatarUploadError ? (
            <p className="mb-2 text-[13px] text-accent">{avatarUploadError}</p>
          ) : null}

          {isEditingName && isAdmin ? (
            <div className="mx-auto mb-3 w-full max-w-sm space-y-3 rounded-[13px] border border-border/70 bg-surface-1/50 p-3.5 text-left">
              <label
                htmlFor="group-name-edit"
                className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted"
              >
                Group name
              </label>
              <Input
                id="group-name-edit"
                value={editedName}
                onChange={(event) => setEditedName(event.target.value)}
                maxLength={100}
                disabled={isSavingName}
              />
              {nameError ? (
                <p className="text-[13px] text-accent">{nameError}</p>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSavingName}
                  onClick={() => {
                    setEditedName(groupDisplayName);
                    setIsEditingName(false);
                    setNameError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-accent text-white hover:bg-accent-hover"
                  disabled={isSavingName || !editedName.trim()}
                  onClick={() => void handleSaveName()}
                >
                  {isSavingName ? (
                    <Loader2 className="size-4 animate-spin" strokeWidth={2} />
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mb-1 flex min-w-0 items-center justify-center gap-2 px-2">
              <h1 className="truncate text-[clamp(1.5rem,4vw,2rem)] font-semibold tracking-[-0.03em] text-text-primary">
                {groupDisplayName}
              </h1>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditedName(groupDisplayName);
                    setIsEditingName(true);
                    setNameError(null);
                  }}
                  className="inline-flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-text-muted transition-opacity hover:opacity-80"
                  aria-label="Edit group name"
                >
                  <Pencil className="size-4" strokeWidth={2} />
                </button>
              ) : null}
            </div>
          )}

          <p className="inline-flex items-center justify-center gap-1.5 text-sm text-text-muted">
            <Users className="size-4 shrink-0" strokeWidth={2} />
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </p>
        </div>

        <section className="mt-8 border-t border-border/70 pt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
              Members
            </h2>
            {isAdmin ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-2"
                onClick={() => {
                  resetAddMembersDialog();
                  setIsAddMembersOpen(true);
                }}
              >
                <UserPlus className="size-4" strokeWidth={2} />
                Add Members
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            {members.length === 0 ? (
              <div className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-3.5 py-8 text-center">
                <p className="text-sm font-medium text-text-secondary">
                  No members found
                </p>
                <p className="mt-1 text-[13px] text-text-muted">
                  This group does not have any members to show yet.
                </p>
              </div>
            ) : (
              members.map((member) => {
              const isCurrentUser = member.id === currentUser?.id;
              const showMemberMenu = isAdmin && !isCurrentUser;

              return (
                <MemberRow
                  key={member.id}
                  member={member}
                  groupId={conversationId}
                  creatorId={creatorId}
                  isCurrentUser={isCurrentUser}
                  showMemberMenu={showMemberMenu}
                  isRoleActionLoading={roleActionLoadingUserId === member.id}
                  onManageRole={() =>
                    setPendingConfirmAction({
                      type: "role-change",
                      member,
                      role: member.role === "admin" ? "member" : "admin",
                    })
                  }
                  onRemove={() =>
                    setPendingConfirmAction({
                      type: "remove-member",
                      member,
                    })
                  }
                />
              );
            })
            )}
          </div>
        </section>

        <div className="mt-8 border-t border-border/70 pt-6">
          <Button
            type="button"
            variant="destructive"
            className="w-full gap-2"
            onClick={() => setPendingConfirmAction({ type: "leave-group" })}
          >
            <LogOut className="size-4" strokeWidth={2} />
            Leave Group
          </Button>
        </div>
      </div>

      <Dialog
        open={isAddMembersOpen}
        onOpenChange={(open) => {
          if (!open && !isAddingMembers) {
            setIsAddMembersOpen(false);
            resetAddMembersDialog();
          }
        }}
      >
        <DialogContent showCloseButton={!isAddingMembers} className="flex max-h-[min(90dvh,640px)] flex-col sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add members</DialogTitle>
            <DialogDescription>
              Select connections to add to {groupDisplayName}.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            {isLoadingConnections ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded-[13px]" />
                <Skeleton className="h-12 w-full rounded-[13px]" />
                <Skeleton className="h-12 w-full rounded-[13px]" />
              </div>
            ) : connectionOptions.length === 0 ? (
              <p className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-3.5 py-4 text-[13px] text-text-muted">
                No available connections to add. Everyone you chat with is already in
                this group.
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
                    strokeWidth={2}
                  />
                  <Input
                    value={addMembersSearchQuery}
                    onChange={(event) => setAddMembersSearchQuery(event.target.value)}
                    placeholder="Search connections..."
                    disabled={isAddingMembers}
                    className="pl-9"
                  />
                </div>

                {selectedMemberIds.length > 0 ? (
                  <p className="text-[13px] font-medium text-text-secondary">
                    {selectedMemberIds.length} selected
                  </p>
                ) : null}

                {filteredConnectionOptions.length === 0 ? (
                  <p className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-3.5 py-4 text-[13px] text-text-muted">
                    No connections match your search.
                  </p>
                ) : (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-[13px] border border-border/70 bg-surface-1/30 p-2">
                    {filteredConnectionOptions.map((connection) => {
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
                            disabled={isAddingMembers}
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

            {addMembersError ? (
              <p className="text-[13px] leading-relaxed text-accent">
                {addMembersError}
              </p>
            ) : null}
          </div>

          <DialogFooter className="border-t-0 bg-transparent sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isAddingMembers}
              onClick={() => {
                setIsAddMembersOpen(false);
                resetAddMembersDialog();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-accent text-white hover:bg-accent-hover"
              disabled={
                isAddingMembers ||
                isLoadingConnections ||
                selectedMemberIds.length < 1
              }
              onClick={() => void handleAddMembers()}
            >
              {isAddingMembers ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2} />
              ) : (
                "Add Selected"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingConfirmAction !== null}
        onOpenChange={(open) => {
          if (!open && !isConfirmLoading) {
            setPendingConfirmAction(null);
          }
        }}
      >
        <DialogContent showCloseButton={!isConfirmLoading} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription>{confirmDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t-0 bg-transparent sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isConfirmLoading}
              onClick={() => setPendingConfirmAction(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={
                pendingConfirmAction?.type === "role-change" ? "default" : "destructive"
              }
              disabled={isConfirmLoading}
              onClick={() => void handleConfirmAction()}
            >
              {isConfirmLoading ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2} />
              ) : (
                confirmButtonLabel
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

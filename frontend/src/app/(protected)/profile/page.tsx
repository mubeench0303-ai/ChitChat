"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Calendar, Clock, Eye, ImagePlus, Loader2, Mail, Pencil, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  SignupSubmitButton,
  signupGradientBgClass,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { removeAvatar, updateAvatar } from "@/lib/api/auth";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const avatarRingGradient =
  "conic-gradient(from 0deg, #e6404d, #ff7347, #ffb347, #ffd166, #06d6a0, #4cc9f0, #4361ee, #7209b7, #e6404d)";

const saveAvatarGradientClass =
  "bg-[linear-gradient(135deg,#059669,#10b981)] dark:bg-[linear-gradient(135deg,#10b981,#34d399)]";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

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

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return dateFormatter.format(date);
}

function validateAvatarFile(file: File): string | null {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return "Avatar must be a JPEG, PNG, or WebP image.";
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return "Avatar must be at most 2MB.";
  }

  return null;
}

function AvatarMenuItem({
  icon,
  label,
  onClick,
  disabled = false,
  destructive = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors",
        disabled
          ? "cursor-not-allowed opacity-45"
          : "cursor-pointer hover:bg-surface-1/80",
        destructive && !disabled && "text-accent"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ProfileRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3">
      <span className="mt-0.5 text-text-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
          {label}
        </p>
        <div className="mt-1 text-sm text-text-primary">{children}</div>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="h-full overflow-y-auto">
      <AuthShell className="min-h-full">
      <AuthCard>
        <div className="mt-7 space-y-4">
          <Skeleton className="mx-auto size-32 rounded-full" />
          <Skeleton className="mx-auto h-7 w-40" />
          <Skeleton className="mx-auto h-4 w-28" />
          <Skeleton className="h-16 w-full rounded-[13px]" />
          <Skeleton className="h-14 w-full rounded-[13px]" />
          <Skeleton className="h-14 w-full rounded-[13px]" />
          <Skeleton className="h-[51px] w-full rounded-[14px]" />
        </div>
      </AuthCard>
      </AuthShell>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const reduceMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const clearSelection = useCallback(() => {
    setPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
      }
      return null;
    });
    setSelectedFile(null);
    setValidationError(null);
    setUploadError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!isImagePreviewOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsImagePreviewOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isImagePreviewOpen]);

  useEffect(() => {
    if (!isRemoveConfirmOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isRemoving) {
        setIsRemoveConfirmOpen(false);
        setRemoveError(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRemoveConfirmOpen, isRemoving]);

  useEffect(() => {
    if (!isAvatarMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (
        avatarMenuRef.current &&
        !avatarMenuRef.current.contains(event.target as Node)
      ) {
        setIsAvatarMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAvatarMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAvatarMenuOpen]);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleViewPhoto = () => {
    setIsAvatarMenuOpen(false);
    setIsImagePreviewOpen(true);
  };

  const handleUploadNewPhoto = () => {
    setIsAvatarMenuOpen(false);
    openFilePicker();
  };

  const handleRemovePhotoRequest = () => {
    setIsAvatarMenuOpen(false);
    setRemoveError(null);
    setIsRemoveConfirmOpen(true);
  };

  const handleConfirmRemove = async () => {
    setIsRemoving(true);
    setRemoveError(null);

    try {
      const updatedUser = await removeAvatar();
      setUser(updatedUser);
      clearSelection();
      setIsRemoveConfirmOpen(false);
      toast.success("Profile photo removed successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove photo, try again.";
      setRemoveError(message);
      toast.error(message);
    } finally {
      setIsRemoving(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    setUploadError(null);

    if (!file) {
      return;
    }

    const error = validateAvatarFile(file);
    if (error) {
      clearSelection();
      setValidationError(error);
      toast.error(error);
      return;
    }

    setValidationError(null);
    setPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
      }
      return URL.createObjectURL(file);
    });
    setSelectedFile(file);
  };

  const handleCancel = () => {
    clearSelection();
  };

  const handleSave = async () => {
    if (!selectedFile) {
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const updatedUser = await updateAvatar(selectedFile);
      setUser(updatedUser);
      clearSelection();
      toast.success("Profile photo updated successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed, try again.";
      setUploadError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  if (!user) {
    return <ProfileSkeleton />;
  }

  const joinedDate = formatDate(user.createdAt);
  const lastSeenDate = formatDate(user.lastSeen);
  const displayedAvatarUrl = previewUrl ?? user.avatarUrl;
  const hasPendingAvatar = Boolean(selectedFile && previewUrl);
  const canViewPhoto = Boolean(displayedAvatarUrl);
  const canRemovePhoto = Boolean(user.avatarUrl);

  return (
    <div className="h-full overflow-y-auto">
      <AuthShell className="min-h-full">
      <AuthCard aria-labelledby="profile-title">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-text-muted transition-opacity hover:opacity-80"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
            Back to chat
          </Link>

          <Link
            href="/search"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-border/70 bg-surface-1/50 px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary transition-opacity hover:opacity-80"
            aria-label="Search users"
          >
            <Search className="size-3.5" strokeWidth={2} />
            Search
          </Link>
        </div>

        <motion.div
          variants={fadeUp(0.12, reduceMotion)}
          initial="hidden"
          animate="visible"
          className="mb-6 mt-6 text-center"
        >
          <div ref={avatarMenuRef} className="relative mx-auto mb-4 inline-block">
            <div className="relative overflow-hidden rounded-full p-[3px] shadow-[0_8px_24px_color-mix(in_srgb,var(--accent)_22%,transparent)]">
              <motion.div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 size-[280%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: avatarRingGradient }}
                animate={reduceMotion ? undefined : { rotate: 360 }}
                transition={
                  reduceMotion
                    ? undefined
                    : { duration: 5, repeat: Infinity, ease: "linear" }
                }
              />

              <div className="relative z-10 rounded-full bg-background">
                <Avatar className="size-32 [&::after]:hidden">
                  {displayedAvatarUrl ? (
                    <AvatarImage src={displayedAvatarUrl} alt={user.fullName} />
                  ) : null}
                  <AvatarFallback
                    className={cn(
                      "text-3xl font-semibold text-white",
                      signupGradientBgClass
                    )}
                  >
                    {getInitials(user.fullName)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsAvatarMenuOpen((open) => !open)}
              disabled={isUploading || isRemoving}
              aria-expanded={isAvatarMenuOpen}
              aria-haspopup="menu"
              aria-label="Edit avatar"
              className={cn(
                "absolute bottom-0 right-0 z-20 grid size-9 cursor-pointer place-items-center rounded-full border-2 border-background text-white shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-70",
                signupGradientBgClass
              )}
            >
              <Pencil className="size-4" strokeWidth={2} />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />

            {isAvatarMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+8px)] z-40 w-52 overflow-hidden rounded-[13px] border border-border/70 bg-background text-left shadow-[0_16px_40px_color-mix(in_srgb,var(--text-primary)_12%,transparent)]"
              >
                <AvatarMenuItem
                  icon={<Eye className="size-4" strokeWidth={2} />}
                  label="View Photo"
                  onClick={handleViewPhoto}
                  disabled={!canViewPhoto}
                />
                <AvatarMenuItem
                  icon={<ImagePlus className="size-4" strokeWidth={2} />}
                  label="Upload New Photo"
                  onClick={handleUploadNewPhoto}
                  disabled={isUploading || isRemoving}
                />
                <div className="border-t border-border/70" />
                <AvatarMenuItem
                  icon={<Trash2 className="size-4" strokeWidth={2} />}
                  label="Remove Photo"
                  onClick={handleRemovePhotoRequest}
                  disabled={!canRemovePhoto || isUploading || isRemoving}
                  destructive
                />
              </div>
            ) : null}
          </div>

          {isImagePreviewOpen && displayedAvatarUrl ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
              onClick={() => setIsImagePreviewOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label={`${user.fullName}'s profile photo`}
            >
              <button
                type="button"
                onClick={() => setIsImagePreviewOpen(false)}
                className={cn(
                  "absolute right-4 top-4 grid size-10 cursor-pointer place-items-center rounded-full text-white shadow-[0_8px_20px_color-mix(in_srgb,var(--accent)_35%,transparent)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  signupGradientBgClass
                )}
                aria-label="Close preview"
              >
                <X className="size-5" strokeWidth={2} />
              </button>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayedAvatarUrl}
                alt={user.fullName}
                className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          ) : null}

          {isRemoveConfirmOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
              onClick={() => {
                if (!isRemoving) {
                  setIsRemoveConfirmOpen(false);
                  setRemoveError(null);
                }
              }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="remove-avatar-title"
            >
              <div
                className="w-full max-w-sm rounded-[16px] border border-border/70 bg-background p-5 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <h2
                  id="remove-avatar-title"
                  className="text-lg font-semibold tracking-[-0.02em] text-text-primary"
                >
                  Remove profile photo?
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
                  This will remove your current profile picture. You can upload a
                  new one anytime.
                </p>

                {removeError ? (
                  <p className="mt-3 text-[13px] leading-relaxed text-accent">
                    {removeError}
                  </p>
                ) : null}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRemoveConfirmOpen(false);
                      setRemoveError(null);
                    }}
                    disabled={isRemoving}
                    className="inline-flex h-9 cursor-pointer items-center rounded-[10px] border border-border/70 bg-surface-1/50 px-3.5 text-[12px] font-semibold text-text-secondary transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmRemove}
                    disabled={isRemoving}
                    className={cn(
                      "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] px-3.5 text-[12px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
                      signupGradientBgClass
                    )}
                  >
                    {isRemoving ? (
                      <Loader2
                        className={cn("size-3.5 animate-spin", reduceMotion && "animate-none")}
                        strokeWidth={2.5}
                      />
                    ) : null}
                    {isRemoving ? "Removing..." : "Remove"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {validationError ? (
            <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-accent">
              {validationError}
            </p>
          ) : null}

          {uploadError ? (
            <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-accent">
              {uploadError}
            </p>
          ) : null}

          {hasPendingAvatar ? (
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isUploading}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[10px] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60",
                  saveAvatarGradientClass
                )}
              >
                {isUploading ? (
                  <Loader2
                    className={cn("size-3.5 animate-spin", reduceMotion && "animate-none")}
                    strokeWidth={2.5}
                  />
                ) : null}
                {isUploading ? "Saving..." : "Save"}
              </button>

              <button
                type="button"
                onClick={handleCancel}
                disabled={isUploading}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center rounded-[10px] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60",
                  signupGradientBgClass
                )}
              >
                Cancel
              </button>
            </div>
          ) : null}

          <h1
            id="profile-title"
            className="mt-4 text-[clamp(1.75rem,5vw,2.25rem)] font-semibold leading-tight tracking-[-0.04em] text-text-primary"
          >
            {user.fullName}
          </h1>
          <p className={cn("mt-1 text-sm font-medium", signupGradientTextClass)}>
            @{user.username}
          </p>

          <p
            className={cn(
              "mx-auto mt-3 max-w-sm text-[13px] leading-relaxed",
              user.bio ? "text-text-secondary" : "italic text-text-muted"
            )}
          >
            {user.bio ?? "No bio yet."}
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp(0.2, reduceMotion)}
          initial="hidden"
          animate="visible"
          className="space-y-2.5"
        >
          <ProfileRow icon={<Mail className="size-4" strokeWidth={2} />} label="Email">
            {user.email}
          </ProfileRow>

          <ProfileRow
            icon={
              <span
                className={cn(
                  "block size-2.5 rounded-full",
                  user.isOnline ? "bg-success" : "bg-text-muted"
                )}
              />
            }
            label="Status"
          >
            {user.isOnline ? "Online" : "Offline"}
          </ProfileRow>

          {!user.isOnline && lastSeenDate ? (
            <ProfileRow
              icon={<Clock className="size-4" strokeWidth={2} />}
              label="Last seen"
            >
              {lastSeenDate}
            </ProfileRow>
          ) : null}

          {joinedDate ? (
            <ProfileRow
              icon={<Calendar className="size-4" strokeWidth={2} />}
              label="Joined"
            >
              {joinedDate}
            </ProfileRow>
          ) : null}
        </motion.div>

        <motion.div
          variants={fadeUp(0.32, reduceMotion)}
          initial="hidden"
          animate="visible"
          className="mt-6 space-y-3"
        >
          <SignupSubmitButton
            type="button"
            onClick={() => router.push("/profile/edit")}
          >
            Edit Profile
          </SignupSubmitButton>
          <Link
            href="/settings"
            className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] border border-border/70 bg-surface-1/50 px-4 py-3 text-[13px] font-semibold text-text-secondary transition-ui hover:bg-surface-hover hover:text-text-primary"
          >
            Settings
          </Link>
        </motion.div>
      </AuthCard>
      </AuthShell>
    </div>
  );
}

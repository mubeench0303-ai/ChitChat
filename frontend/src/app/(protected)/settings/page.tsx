"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Bell,
  ChevronRight,
  Loader2,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Shield,
  Sun,
  Trash2,
  User,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { fieldHintClassName } from "@/components/auth/auth-card";
import { SignupPasswordInput } from "@/components/auth/signup-field";
import {
  SignupSubmitButton,
  signupGradientBgClass,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import {
  changePassword,
  deleteAccount,
  getBlockedUsers,
  logout,
  unblockUser,
} from "@/lib/api/auth";
import { updateNotificationSound } from "@/lib/api/notifications";
import { getApiErrorStatus } from "@/lib/api/errors";
import {
  changePasswordSchema,
  type ChangePasswordFormData,
} from "@/lib/validations/auth";
import { useAuthStore } from "@/store/auth-store";
import type { BlockedUser } from "@/types";
import { cn } from "@/lib/utils";
import { PrivacyPanel } from "@/components/settings/privacy-panel";

type SettingsPanelId =
  | "change-password"
  | "blocked-users"
  | "privacy"
  | "notifications"
  | "appearance"
  | "delete-account";

type ThemeChoice = "light" | "dark" | "system";

const THEME_OPTIONS: Array<{
  id: ThemeChoice;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "light",
    label: "Light",
    description: "Always use the light theme",
    icon: <Sun className="size-4" strokeWidth={2} />,
  },
  {
    id: "dark",
    label: "Dark",
    description: "Always use the dark theme",
    icon: <Moon className="size-4" strokeWidth={2} />,
  },
  {
    id: "system",
    label: "System",
    description: "Match your device appearance",
    icon: <Monitor className="size-4" strokeWidth={2} />,
  },
];

type SettingsOption =
  | {
      id: SettingsPanelId;
      label: string;
      icon: React.ReactNode;
      kind: "panel";
      description: string;
    }
  | {
      id: "profile";
      label: string;
      icon: React.ReactNode;
      kind: "navigate";
      href: string;
      description: string;
    }
  | {
      id: "logout";
      label: string;
      icon: React.ReactNode;
      kind: "action";
      description: string;
    };

const SETTINGS_OPTIONS: SettingsOption[] = [
  {
    id: "change-password",
    label: "Change Password",
    icon: <Lock className="size-4" strokeWidth={2} />,
    kind: "panel",
    description: "Update your account password",
  },
  {
    id: "blocked-users",
    label: "Blocked Users",
    icon: <Ban className="size-4" strokeWidth={2} />,
    kind: "panel",
    description: "Manage people you have blocked",
  },
  {
    id: "privacy",
    label: "Privacy",
    icon: <Shield className="size-4" strokeWidth={2} />,
    kind: "panel",
    description: "Control who sees your profile details",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: <Bell className="size-4" strokeWidth={2} />,
    kind: "panel",
    description: "Manage message alerts and sounds",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: <Palette className="size-4" strokeWidth={2} />,
    kind: "panel",
    description: "Choose light, dark, or system theme",
  },
  {
    id: "profile",
    label: "Profile",
    icon: <User className="size-4" strokeWidth={2} />,
    kind: "navigate",
    href: "/profile",
    description: "View and edit your public profile",
  },
  {
    id: "logout",
    label: "Logout",
    icon: <LogOut className="size-4" strokeWidth={2} />,
    kind: "action",
    description: "Sign out of your account",
  },
];

function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatBlockedDate(dateString: string) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SettingsNavItem({
  option,
  isActive,
  onClick,
}: {
  option: SettingsOption;
  isActive: boolean;
  onClick: () => void;
}) {
  const isLogout = option.kind === "action" && option.id === "logout";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-ui sm:py-3",
        isLogout
          ? "text-accent hover:bg-accent/10"
          : isActive
            ? "bg-accent-subtle text-text-primary"
            : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      )}
    >
      {isActive && !isLogout ? (
        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
      ) : null}
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
          isLogout
            ? "bg-accent/10 text-accent group-hover:bg-accent/15"
            : isActive
              ? "bg-accent text-white"
              : "bg-surface-2 text-text-secondary group-hover:text-text-primary"
        )}
      >
        {option.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{option.label}</span>
        <span
          className={cn(
            "mt-0.5 block truncate text-[11px] font-normal lg:hidden",
            isLogout ? "text-accent/80" : "text-text-muted"
          )}
        >
          {option.description}
        </span>
      </span>
      {option.kind === "navigate" ? (
        <ChevronRight
          className="size-4 shrink-0 text-text-muted lg:hidden"
          strokeWidth={2}
        />
      ) : null}
    </button>
  );
}

function BlockedUsersSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-[13px] border border-border/60 bg-surface-1/40 px-3 py-3"
        >
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function BlockedUserRow({
  user,
  isUnblocking,
  onUnblock,
}: {
  user: BlockedUser;
  isUnblocking: boolean;
  onUnblock: (conversationId: string) => void;
}) {
  return (
    <div className="flex flex-col items-stretch gap-3 rounded-[13px] border border-border/60 bg-surface-1/40 px-3 py-3 sm:flex-row sm:items-center">
      <Avatar className="size-11 shrink-0">
        {user.avatarUrl ? (
          <AvatarImage src={user.avatarUrl} alt={user.fullName} />
        ) : null}
        <AvatarFallback className="bg-surface-2 text-sm font-medium text-text-secondary">
          {getInitials(user.fullName)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">
          {user.fullName}
        </p>
        <p className="truncate text-[13px] text-text-secondary">
          @{user.username}
        </p>
        <p className="mt-0.5 text-[12px] text-text-muted">
          Blocked on {formatBlockedDate(user.blockedAt)}
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isUnblocking}
        onClick={() => onUnblock(user.conversationId)}
        className="w-full shrink-0 sm:w-auto"
      >
        {isUnblocking ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Unblocking
          </>
        ) : (
          "Unblock"
        )}
      </Button>
    </div>
  );
}

function ChangePasswordPanel({
  form,
  submitError,
  isSubmitting,
  onSubmit,
}: {
  form: ReturnType<typeof useForm<ChangePasswordFormData>>;
  submitError: string | null;
  isSubmitting: boolean;
  onSubmit: (data: ChangePasswordFormData) => void;
}) {
  return (
    <>
      <div className="mb-5">
        <h2 className="text-base font-semibold text-text-primary">
          Change Password
        </h2>
        <p className="mt-1 text-[13px] text-text-secondary">
          Update your password while staying signed in on this device.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {submitError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          ) : null}

          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current password</FormLabel>
                <FormControl>
                  <SignupPasswordInput
                    {...field}
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(form.formState.errors.currentPassword)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <SignupPasswordInput
                    {...field}
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(form.formState.errors.newPassword)}
                  />
                </FormControl>
                <p className={fieldHintClassName}>
                  At least 8 characters with uppercase, lowercase, and a number.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmNewPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm new password</FormLabel>
                <FormControl>
                  <SignupPasswordInput
                    {...field}
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(
                      form.formState.errors.confirmNewPassword
                    )}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <SignupSubmitButton type="submit" loading={isSubmitting}>
            Save
          </SignupSubmitButton>
        </form>
      </Form>
    </>
  );
}

function DeleteAccountPanel({
  password,
  error,
  isDeleting,
  onPasswordChange,
  onSubmit,
}: {
  password: string;
  error: string | null;
  isDeleting: boolean;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const canDelete = password.trim().length > 0 && !isDeleting;

  return (
    <>
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <Trash2 className="size-4 text-accent" strokeWidth={2} />
          <h2 className="text-base font-semibold text-text-primary">
            Delete Account
          </h2>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
          This permanently deletes your account, removes your profile details,
          and signs you out everywhere. Your message history may remain visible
          to others as &quot;Deleted User&quot;. This action cannot be undone.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="delete-account-password"
            className="text-sm font-medium text-text-primary"
          >
            Confirm with your password
          </label>
          <SignupPasswordInput
            id="delete-account-password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoComplete="current-password"
            disabled={isDeleting}
            aria-invalid={Boolean(error)}
          />
        </div>

        <Button
          type="button"
          variant="destructive"
          disabled={!canDelete}
          onClick={onSubmit}
          className="w-full sm:w-auto"
        >
          {isDeleting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Deleting account...
            </>
          ) : (
            "Delete My Account"
          )}
        </Button>
      </div>
    </>
  );
}

function AppearancePanel() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = (theme ?? "system") as ThemeChoice;

  return (
    <>
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-text-muted" strokeWidth={2} />
          <h2 className="text-base font-semibold text-text-primary">
            Appearance
          </h2>
        </div>
        <p className="mt-1 text-[13px] text-text-secondary">
          Choose how ChitChat looks on this device.
        </p>
      </div>

      {!mounted ? (
        <div className="space-y-2">
          <Skeleton className="h-[52px] w-full rounded-xl" />
          <Skeleton className="h-[52px] w-full rounded-xl" />
          <Skeleton className="h-[52px] w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-1">
          {THEME_OPTIONS.map((option) => {
            const isActive = activeTheme === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                className={cn(
                  "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-ui sm:py-3",
                  isActive
                    ? "bg-accent-subtle text-text-primary"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                )}
              >
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
                  {option.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-normal text-text-muted">
                    {option.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function NotificationsPanel() {
  const user = useAuthStore((state) => state.user);
  const setNotificationSoundEnabled = useAuthStore(
    (state) => state.setNotificationSoundEnabled
  );
  const [isUpdating, setIsUpdating] = useState(false);

  const soundEnabled = user?.notificationSoundEnabled ?? true;

  async function handleToggle() {
    const nextValue = !soundEnabled;
    setIsUpdating(true);

    try {
      await updateNotificationSound(nextValue);
      setNotificationSoundEnabled(nextValue);
      toast.success(
        nextValue ? "Notification sound enabled" : "Notification sound disabled"
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update setting";
      toast.error(message);
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <>
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-text-muted" strokeWidth={2} />
          <h2 className="text-base font-semibold text-text-primary">
            Notifications
          </h2>
        </div>
        <p className="mt-1 text-[13px] text-text-secondary">
          Control how ChitChat alerts you when new messages arrive.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void handleToggle()}
        disabled={isUpdating}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface-1/40 px-3.5 py-3 text-left transition-ui",
          "hover:bg-surface-1/70 disabled:cursor-not-allowed disabled:opacity-70"
        )}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-text-primary">
            Notification Sound
          </span>
          <span className="mt-0.5 block text-[12px] text-text-muted">
            Play a sound when a new message arrives outside the open chat
          </span>
        </span>
        <span
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
            soundEnabled ? "bg-accent" : "bg-surface-2"
          )}
          aria-hidden
        >
          <span
            className={cn(
              "inline-block size-5 translate-x-0.5 rounded-full bg-white transition-transform",
              soundEnabled ? "translate-x-[22px]" : "translate-x-0.5"
            )}
          />
        </span>
      </button>
    </>
  );
}

function BlockedUsersPanel({
  isLoading,
  error,
  users,
  unblockingId,
  onUnblock,
}: {
  isLoading: boolean;
  error: string | null;
  users: BlockedUser[];
  unblockingId: string | null;
  onUnblock: (conversationId: string) => void;
}) {
  return (
    <>
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <Ban className="size-4 text-text-muted" strokeWidth={2} />
          <h2 className="text-base font-semibold text-text-primary">
            Blocked Users
          </h2>
        </div>
        <p className="mt-1 text-[13px] text-text-secondary">
          People you have blocked will not be able to message you until you
          unblock them.
        </p>
      </div>

      {isLoading ? (
        <BlockedUsersSkeleton />
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : users.length === 0 ? (
        <p className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-4 py-8 text-center text-[13px] text-text-secondary">
          You haven&apos;t blocked anyone
        </p>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <BlockedUserRow
              key={user.conversationId}
              user={user}
              isUnblocking={unblockingId === user.conversationId}
              onUnblock={onUnblock}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const clearUser = useAuthStore((state) => state.clearUser);

  const [selectedPanel, setSelectedPanel] =
    useState<SettingsPanelId>("change-password");
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [isLoadingBlockedUsers, setIsLoadingBlockedUsers] = useState(true);
  const [blockedUsersError, setBlockedUsersError] = useState<string | null>(
    null
  );
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const form = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    },
  });

  const { isSubmitting } = form.formState;

  const loadBlockedUsers = useCallback(async () => {
    setIsLoadingBlockedUsers(true);
    setBlockedUsersError(null);

    try {
      const users = await getBlockedUsers();
      setBlockedUsers(users);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load blocked users";
      setBlockedUsersError(message);
    } finally {
      setIsLoadingBlockedUsers(false);
    }
  }, []);

  useEffect(() => {
    void loadBlockedUsers();
  }, [loadBlockedUsers]);

  function handleSelectOption(option: SettingsOption) {
    if (option.kind === "navigate") {
      router.push(option.href);
      return;
    }

    if (option.kind === "action") {
      setIsLogoutDialogOpen(true);
      return;
    }

    setSelectedPanel(option.id);
    setShowMobilePanel(true);
  }

  async function handleConfirmLogout() {
    setIsLoggingOut(true);

    try {
      await logout();
    } finally {
      clearUser();
      setIsLoggingOut(false);
      setIsLogoutDialogOpen(false);
      router.replace("/login");
    }
  }

  async function onSubmit(data: ChangePasswordFormData) {
    setSubmitError(null);

    try {
      const result = await changePassword(data.currentPassword, data.newPassword);
      toast.success(result.message || "Password changed successfully.");
      form.reset();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      setSubmitError(message);
    }
  }

  async function handleDeleteAccount() {
    if (!deletePassword.trim() || isDeletingAccount) {
      return;
    }

    setDeleteError(null);
    setIsDeletingAccount(true);

    try {
      const result = await deleteAccount(deletePassword);
      clearUser();
      toast.success(result.message || "Account deleted successfully.");
      router.replace("/login");
    } catch (error) {
      const status = getApiErrorStatus(error);
      const message =
        error instanceof Error ? error.message : "Something went wrong";

      if (status === 400) {
        setDeleteError("Incorrect password");
      } else {
        setDeleteError(message);
      }
    } finally {
      setIsDeletingAccount(false);
    }
  }

  function handleSelectDeleteAccount() {
    setSelectedPanel("delete-account");
    setShowMobilePanel(true);
    setDeleteError(null);
  }

  async function handleUnblock(conversationId: string) {
    setUnblockingId(conversationId);

    try {
      const result = await unblockUser(conversationId);
      setBlockedUsers((current) =>
        current.filter((user) => user.conversationId !== conversationId)
      );
      toast.success(result.message || "Chat restored successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to unblock user";
      toast.error(message);
    } finally {
      setUnblockingId(null);
    }
  }

  const activePanelOption =
    selectedPanel === "delete-account"
      ? {
          label: "Delete Account",
          description: "Permanently remove your account",
          kind: "panel" as const,
        }
      : SETTINGS_OPTIONS.find(
          (option) => option.kind === "panel" && option.id === selectedPanel
        );

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-5 sm:px-6 lg:flex-row lg:gap-6 lg:py-8">
        <div
          className={cn(
            "lg:flex lg:w-64 lg:shrink-0 lg:flex-col",
            showMobilePanel ? "hidden" : "flex flex-col"
          )}
        >
          <div className="mb-5 shrink-0 lg:mb-6">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[1.2px]">
              <i
                className={cn(
                  "block h-0.5 w-[18px] rounded-full",
                  signupGradientBgClass
                )}
              />
              <span className={signupGradientTextClass}>Account</span>
            </span>
          <h1 className="mt-2.5 text-xl font-semibold leading-tight tracking-[-0.04em] text-text-primary lg:text-[clamp(1.5rem,4vw,2rem)]">
              Settings
            </h1>
            <p className="mt-1.5 hidden text-[13px] leading-relaxed text-text-secondary sm:block">
              Manage your account preferences and security.
            </p>
          </div>

          <nav className="space-y-1 rounded-[13px] border border-border/70 bg-surface-1/40 p-2">
            {SETTINGS_OPTIONS.map((option) => (
              <SettingsNavItem
                key={option.id}
                option={option}
                isActive={
                  option.kind === "panel" && option.id === selectedPanel
                }
                onClick={() => handleSelectOption(option)}
              />
            ))}
          </nav>

          <div className="mt-4 border-t border-border/70 pt-4">
            <button
              type="button"
              onClick={handleSelectDeleteAccount}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-ui sm:py-3",
                selectedPanel === "delete-account"
                  ? "bg-accent/10 text-accent"
                  : "text-accent hover:bg-accent/10"
              )}
            >
              {selectedPanel === "delete-account" ? (
                <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
              ) : null}
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent/15">
                <Trash2 className="size-4" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">Delete Account</span>
                <span className="mt-0.5 block truncate text-[11px] font-normal text-accent/80 lg:hidden">
                  Permanently remove your account
                </span>
              </span>
            </button>
          </div>
        </div>

        <div
          className={cn(
            "min-w-0 flex-1",
            showMobilePanel ? "block" : "hidden lg:block"
          )}
        >
          <div className="mb-4 flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setShowMobilePanel(false)}
              className="inline-flex items-center justify-center rounded-lg p-1.5 text-text-muted transition-opacity hover:opacity-80"
              aria-label="Back to settings options"
            >
              <ArrowLeft className="size-5" strokeWidth={2} />
            </button>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-text-primary">
                {activePanelOption?.label}
              </h2>
              {activePanelOption?.kind === "panel" ? (
                <p className="truncate text-[12px] text-text-muted">
                  {activePanelOption.description}
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-[13px] border border-border/70 bg-surface-1/50 p-4 sm:p-5">
            {selectedPanel === "change-password" ? (
              <ChangePasswordPanel
                form={form}
                submitError={submitError}
                isSubmitting={isSubmitting}
                onSubmit={onSubmit}
              />
            ) : null}

            {selectedPanel === "blocked-users" ? (
              <BlockedUsersPanel
                isLoading={isLoadingBlockedUsers}
                error={blockedUsersError}
                users={blockedUsers}
                unblockingId={unblockingId}
                onUnblock={handleUnblock}
              />
            ) : null}

            {selectedPanel === "privacy" ? <PrivacyPanel /> : null}

            {selectedPanel === "notifications" ? <NotificationsPanel /> : null}

            {selectedPanel === "appearance" ? <AppearancePanel /> : null}

            {selectedPanel === "delete-account" ? (
              <DeleteAccountPanel
                password={deletePassword}
                error={deleteError}
                isDeleting={isDeletingAccount}
                onPasswordChange={setDeletePassword}
                onSubmit={() => void handleDeleteAccount()}
              />
            ) : null}
          </div>
        </div>
      </div>

      <Dialog
        open={isLogoutDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isLoggingOut) {
            setIsLogoutDialogOpen(false);
          }
        }}
      >
        <DialogContent showCloseButton={!isLoggingOut} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log out?</DialogTitle>
            <DialogDescription>
              Are you sure you want to log out? You will need to sign in again
              to access your chats.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t-0 bg-transparent sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isLoggingOut}
              onClick={() => setIsLogoutDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-accent text-white hover:bg-accent-hover"
              disabled={isLoggingOut}
              onClick={() => void handleConfirmLogout()}
            >
              {isLoggingOut ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={2} />
              ) : (
                "Log out"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  Plus,
  Shield,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addPrivacyException,
  getFriends,
  getPrivacyExceptions,
  getPrivacySettings,
  removePrivacyException,
  updatePrivacySetting,
} from "@/lib/api/auth";
import { useAuthStore } from "@/store/auth-store";
import type {
  Friend,
  PrivacyApiField,
  PrivacyExceptionUser,
  PrivacyFieldKey,
  PrivacySettings,
  PrivacyVisibility,
} from "@/types";
import { cn } from "@/lib/utils";

type PrivacyPanelView = "main" | "select" | "exceptions";

const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  lastSeenAndOnline: "everyone",
  profilePhoto: "everyone",
  bio: "everyone",
  status: "connections",
};

const PRIVACY_FIELDS: Array<{
  key: PrivacyFieldKey;
  apiField: PrivacyApiField;
  label: string;
  description: string;
}> = [
  {
    key: "lastSeenAndOnline",
    apiField: "last_seen_and_online",
    label: "Last Seen & Online Status",
    description: "Who can see when you are online and when you were last active",
  },
  {
    key: "profilePhoto",
    apiField: "profile_photo",
    label: "Profile Photo",
    description: "Who can see your profile picture",
  },
  {
    key: "bio",
    apiField: "bio",
    label: "Bio",
    description: "Who can read your profile bio",
  },
  {
    key: "status",
    apiField: "status",
    label: "Status",
    description: "Who can see your status updates",
  },
];

const VISIBILITY_OPTIONS: Array<{
  value: PrivacyVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "everyone",
    label: "Everyone",
    description: "Any ChitChat user can see this",
  },
  {
    value: "connections",
    label: "My Connections",
    description: "Only people you are connected with",
  },
  {
    value: "connections_except",
    label: "My Connections Except...",
    description: "Connections minus people you exclude",
  },
  {
    value: "nobody",
    label: "Nobody",
    description: "Hidden from everyone else",
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

function getVisibilityLabel(value: PrivacyVisibility) {
  return (
    VISIBILITY_OPTIONS.find((option) => option.value === value)?.label ??
    "Everyone"
  );
}

function getFieldConfig(key: PrivacyFieldKey) {
  return PRIVACY_FIELDS.find((field) => field.key === key)!;
}

function PrivacyPanelSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-[52px] w-full rounded-xl" />
      ))}
    </div>
  );
}

function PrivacyExceptionsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-[13px] border border-border/60 bg-surface-1/40 px-3 py-3"
        >
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="size-8 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function ExceptionUserRow({
  user,
  isRemoving,
  onRemove,
}: {
  user: PrivacyExceptionUser;
  isRemoving: boolean;
  onRemove: (userId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[13px] border border-border/60 bg-surface-1/40 px-3 py-3">
      <Avatar className="size-10 shrink-0">
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
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={isRemoving}
        onClick={() => onRemove(user.id)}
        aria-label={`Remove ${user.fullName} from exceptions`}
        className="shrink-0 text-text-muted hover:text-accent"
      >
        {isRemoving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <X className="size-4" strokeWidth={2} />
        )}
      </Button>
    </div>
  );
}

function AddExceptionPicker({
  options,
  isAdding,
  addingUserId,
  onAdd,
}: {
  options: Friend[];
  isAdding: boolean;
  addingUserId: string | null;
  onAdd: (userId: string) => void;
}) {
  if (options.length === 0) {
    return (
      <p className="rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-4 py-6 text-center text-[13px] text-text-secondary">
        No connections available to add
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] font-medium uppercase tracking-wide text-text-muted">
        Add connection
      </p>
      <div className="space-y-2">
        {options.map((friend) => {
          const isAddingThis = isAdding && addingUserId === friend.id;

          return (
            <button
              key={friend.id}
              type="button"
              disabled={isAdding}
              onClick={() => onAdd(friend.id)}
              className="flex w-full items-center gap-3 rounded-[13px] border border-border/60 bg-surface-1/40 px-3 py-3 text-left transition-ui hover:bg-surface-hover disabled:opacity-60"
            >
              <Avatar className="size-10 shrink-0">
                {friend.avatarUrl ? (
                  <AvatarImage src={friend.avatarUrl} alt={friend.fullName} />
                ) : null}
                <AvatarFallback className="bg-surface-2 text-sm font-medium text-text-secondary">
                  {getInitials(friend.fullName)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text-primary">
                  {friend.fullName}
                </p>
                <p className="truncate text-[13px] text-text-secondary">
                  @{friend.username}
                </p>
              </div>

              {isAddingThis ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-text-muted" />
              ) : (
                <Plus className="size-4 shrink-0 text-accent" strokeWidth={2} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PrivacyPanel() {
  const currentUserId = useAuthStore((state) => state.user?.id);

  const [settings, setSettings] = useState<PrivacySettings>(
    DEFAULT_PRIVACY_SETTINGS
  );
  const [exceptionsByField, setExceptionsByField] = useState<
    Record<PrivacyFieldKey, PrivacyExceptionUser[]>
  >({
    lastSeenAndOnline: [],
    profilePhoto: [],
    bio: [],
    status: [],
  });
  const [friends, setFriends] = useState<Friend[]>([]);

  const [view, setView] = useState<PrivacyPanelView>("main");
  const [activeField, setActiveField] = useState<PrivacyFieldKey | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingExceptions, setIsLoadingExceptions] = useState(false);
  const [exceptionsError, setExceptionsError] = useState<string | null>(null);

  const [updatingField, setUpdatingField] = useState<PrivacyFieldKey | null>(
    null
  );
  const [removingExceptionId, setRemovingExceptionId] = useState<string | null>(
    null
  );
  const [addingExceptionId, setAddingExceptionId] = useState<string | null>(
    null
  );

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await getPrivacySettings();
      setSettings(data);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Couldn't load privacy settings";
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const loadExceptionsForField = useCallback(async (fieldKey: PrivacyFieldKey) => {
    const fieldConfig = getFieldConfig(fieldKey);
    setIsLoadingExceptions(true);
    setExceptionsError(null);

    try {
      const [exceptions, connections] = await Promise.all([
        getPrivacyExceptions(fieldConfig.apiField),
        getFriends(),
      ]);

      setExceptionsByField((current) => ({
        ...current,
        [fieldKey]: exceptions,
      }));
      setFriends(connections);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Couldn't load privacy exceptions";
      setExceptionsError(message);
    } finally {
      setIsLoadingExceptions(false);
    }
  }, []);

  const activeFieldConfig = activeField ? getFieldConfig(activeField) : null;
  const activeVisibility = activeField ? settings[activeField] : null;

  const addableFriends = useMemo(() => {
    if (!activeField || !currentUserId) {
      return [];
    }

    const excludedIds = new Set(
      exceptionsByField[activeField].map((user) => user.id)
    );

    return friends.filter(
      (friend) => friend.id !== currentUserId && !excludedIds.has(friend.id)
    );
  }, [activeField, currentUserId, exceptionsByField, friends]);

  function openFieldSelection(fieldKey: PrivacyFieldKey) {
    setActiveField(fieldKey);
    setView("select");
  }

  function openExceptions(fieldKey: PrivacyFieldKey) {
    setActiveField(fieldKey);
    setView("exceptions");
    void loadExceptionsForField(fieldKey);
  }

  function handleBack() {
    if (view === "exceptions" || view === "select") {
      setView("main");
      setActiveField(null);
      setExceptionsError(null);
    }
  }

  async function handleSelectVisibility(
    fieldKey: PrivacyFieldKey,
    visibility: PrivacyVisibility
  ) {
    const fieldConfig = getFieldConfig(fieldKey);
    const previousValue = settings[fieldKey];

    setSettings((current) => ({
      ...current,
      [fieldKey]: visibility,
    }));
    setView("main");
    setActiveField(null);
    setUpdatingField(fieldKey);

    try {
      await updatePrivacySetting(fieldConfig.apiField, visibility);
    } catch (error) {
      setSettings((current) => ({
        ...current,
        [fieldKey]: previousValue,
      }));

      const message =
        error instanceof Error
          ? error.message
          : "Failed to update privacy setting";
      toast.error(message);
    } finally {
      setUpdatingField(null);
    }
  }

  async function handleRemoveException(userId: string) {
    if (!activeField) {
      return;
    }

    const fieldConfig = getFieldConfig(activeField);
    const previousExceptions = exceptionsByField[activeField];
    setRemovingExceptionId(userId);

    setExceptionsByField((current) => ({
      ...current,
      [activeField]: current[activeField].filter((user) => user.id !== userId),
    }));

    try {
      await removePrivacyException(fieldConfig.apiField, userId);
    } catch (error) {
      setExceptionsByField((current) => ({
        ...current,
        [activeField]: previousExceptions,
      }));

      const message =
        error instanceof Error ? error.message : "Failed to remove exception";
      toast.error(message);
    } finally {
      setRemovingExceptionId(null);
    }
  }

  async function handleAddException(userId: string) {
    if (!activeField) {
      return;
    }

    const fieldConfig = getFieldConfig(activeField);
    const friend = friends.find((item) => item.id === userId);
    if (!friend) {
      return;
    }

    const previousExceptions = exceptionsByField[activeField];
    const optimisticUser: PrivacyExceptionUser = {
      id: friend.id,
      fullName: friend.fullName,
      username: friend.username,
      avatarUrl: friend.avatarUrl,
    };

    setAddingExceptionId(userId);
    setExceptionsByField((current) => ({
      ...current,
      [activeField]: [...current[activeField], optimisticUser],
    }));

    try {
      await addPrivacyException(fieldConfig.apiField, userId);
    } catch (error) {
      setExceptionsByField((current) => ({
        ...current,
        [activeField]: previousExceptions,
      }));

      const message =
        error instanceof Error ? error.message : "Failed to add exception";
      toast.error(message);
    } finally {
      setAddingExceptionId(null);
    }
  }

  if (isLoading) {
    return (
      <>
        <PrivacyPanelHeader />
        <PrivacyPanelSkeleton />
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <PrivacyPanelHeader />
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadSettings()}
              className="shrink-0"
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </>
    );
  }

  if (view === "select" && activeField && activeFieldConfig && activeVisibility) {
    return (
      <>
        <PrivacySubHeader
          title={activeFieldConfig.label}
          description="Choose who can see this information"
          onBack={handleBack}
        />

        <div className="space-y-1">
          {VISIBILITY_OPTIONS.map((option) => {
            const isActive = activeVisibility === option.value;
            const isUpdating = updatingField === activeField;

            return (
              <button
                key={option.value}
                type="button"
                disabled={isUpdating}
                onClick={() =>
                  void handleSelectVisibility(activeField, option.value)
                }
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
                  {isActive ? (
                    <Check className="size-4" strokeWidth={2.5} />
                  ) : (
                    <Shield className="size-4" strokeWidth={2} />
                  )}
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

        {activeVisibility === "connections_except" ? (
          <div className="mt-4 border-t border-border/70 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openExceptions(activeField)}
            >
              Manage exceptions
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  if (view === "exceptions" && activeField && activeFieldConfig) {
    const exceptions = exceptionsByField[activeField];

    return (
      <>
        <PrivacySubHeader
          title={`${activeFieldConfig.label} exceptions`}
          description="Connections who cannot see this information"
          onBack={handleBack}
        />

        {isLoadingExceptions ? (
          <PrivacyExceptionsSkeleton />
        ) : exceptionsError ? (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="size-4" />
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{exceptionsError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadExceptionsForField(activeField)}
                className="shrink-0"
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {exceptions.length === 0 ? (
              <p className="mb-4 rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-4 py-6 text-center text-[13px] text-text-secondary">
                No exceptions yet — all connections can still see this
              </p>
            ) : (
              <div className="mb-4 space-y-3">
                {exceptions.map((user) => (
                  <ExceptionUserRow
                    key={user.id}
                    user={user}
                    isRemoving={removingExceptionId === user.id}
                    onRemove={(userId) => void handleRemoveException(userId)}
                  />
                ))}
              </div>
            )}

            <AddExceptionPicker
              options={addableFriends}
              isAdding={addingExceptionId !== null}
              addingUserId={addingExceptionId}
              onAdd={(userId) => void handleAddException(userId)}
            />
          </>
        )}
      </>
    );
  }

  return (
    <>
      <PrivacyPanelHeader />

      <div className="space-y-1">
        {PRIVACY_FIELDS.map((field) => {
          const visibility = settings[field.key];
          const isUpdating = updatingField === field.key;

          return (
            <div key={field.key} className="space-y-2">
              <button
                type="button"
                onClick={() => openFieldSelection(field.key)}
                className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-ui hover:bg-surface-hover sm:py-3"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-secondary transition-colors group-hover:text-text-primary">
                  <Shield className="size-4" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-text-primary">
                    {field.label}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 truncate text-[11px] font-normal text-text-muted">
                    {isUpdating ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      getVisibilityLabel(visibility)
                    )}
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-text-muted"
                  strokeWidth={2}
                />
              </button>

              {visibility === "connections_except" ? (
                <div className="pl-11">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openExceptions(field.key)}
                    className="h-8 px-2 text-[12px] text-accent hover:text-accent"
                  >
                    Manage exceptions
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function PrivacyPanelHeader() {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2">
        <Shield className="size-4 text-text-muted" strokeWidth={2} />
        <h2 className="text-base font-semibold text-text-primary">Privacy</h2>
      </div>
      <p className="mt-1 text-[13px] text-text-secondary">
        Control who can see your last seen, online status, profile photo, and
        bio.
      </p>
    </div>
  );
}

function PrivacySubHeader({
  title,
  description,
  onBack,
}: {
  title: string;
  description: string;
  onBack: () => void;
}) {
  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[13px] font-medium text-text-secondary transition-ui hover:bg-surface-hover hover:text-text-primary"
      >
        <ArrowLeft className="size-4" strokeWidth={2} />
        Back
      </button>
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      <p className="mt-1 text-[13px] text-text-secondary">{description}</p>
    </div>
  );
}

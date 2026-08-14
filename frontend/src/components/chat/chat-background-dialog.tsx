"use client";

import { useRef, useState } from "react";
import { Check, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  resetConversationBackground,
  setConversationBackgroundCustom,
  setConversationBackgroundPreset,
} from "@/lib/api/auth";
import {
  CHAT_BACKGROUND_PRESETS,
  type ChatBackgroundType,
} from "@/lib/chat-backgrounds";
import {
  MESSAGE_IMAGE_ACCEPT,
  validateMessageImageFile,
} from "@/lib/validations/image";
import { cn } from "@/lib/utils";

type ChatBackgroundDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  backgroundType?: ChatBackgroundType;
  backgroundValue?: string | null;
  onBackgroundChange: (next: {
    backgroundType: ChatBackgroundType;
    backgroundValue?: string | null;
  }) => void;
};

export function ChatBackgroundDialog({
  open,
  onOpenChange,
  conversationId,
  backgroundType = "default",
  backgroundValue,
  onBackgroundChange,
}: ChatBackgroundDialogProps) {
  const customInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSelection, setActiveSelection] = useState<string>("default");

  const resolvedActiveSelection =
    backgroundType === "preset" && backgroundValue
      ? backgroundValue
      : backgroundType === "custom"
        ? "custom"
        : "default";

  const highlightedSelection = isSaving ? activeSelection : resolvedActiveSelection;

  async function handleSelectDefault() {
    setActiveSelection("default");
    setIsSaving(true);

    try {
      await resetConversationBackground(conversationId);
      onBackgroundChange({ backgroundType: "default", backgroundValue: null });
      toast.success("Background reset to default");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reset background"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSelectPreset(presetId: string) {
    setActiveSelection(presetId);
    setIsSaving(true);

    try {
      const response = await setConversationBackgroundPreset(
        conversationId,
        presetId
      );
      onBackgroundChange({
        backgroundType: response.backgroundType,
        backgroundValue: response.backgroundValue ?? presetId,
      });
      toast.success("Background updated");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update background"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCustomImageSelect(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const validationError = validateMessageImageFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setActiveSelection("custom");
    setIsSaving(true);

    try {
      const response = await setConversationBackgroundCustom(
        conversationId,
        file
      );
      onBackgroundChange({
        backgroundType: response.backgroundType,
        backgroundValue: response.backgroundValue ?? null,
      });
      toast.success("Custom background applied");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upload background"
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90dvh,640px)] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chat Background</DialogTitle>
          <DialogDescription>
            Choose a background for this chat. Only you will see it.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSelectDefault()}
            className={cn(
              "flex w-full items-center justify-between rounded-[13px] border px-3.5 py-3 text-left transition-ui",
              highlightedSelection === "default"
                ? "border-accent bg-accent-subtle"
                : "border-border/70 bg-surface-1/50 hover:bg-surface-1/80"
            )}
          >
            <div>
              <p className="text-sm font-semibold text-text-primary">Default</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Use the app&apos;s normal chat background
              </p>
            </div>
            {highlightedSelection === "default" ? (
              <Check className="size-4 shrink-0 text-accent" strokeWidth={2} />
            ) : null}
          </button>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Presets
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {CHAT_BACKGROUND_PRESETS.map((preset) => {
                const isActive = highlightedSelection === preset.id;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isSaving}
                    aria-label={preset.label}
                    onClick={() => void handleSelectPreset(preset.id)}
                    className={cn(
                      "group relative aspect-[3/4] overflow-hidden rounded-xl border transition-ui",
                      isActive
                        ? "border-accent ring-2 ring-accent/30"
                        : "border-border/70 hover:border-accent/40"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preset.src}
                      alt={preset.label}
                      className="size-full object-cover"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1.5 text-[10px] font-semibold text-white">
                      {preset.label}
                    </span>
                    {isActive ? (
                      <span className="absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-accent text-white shadow-sm">
                        <Check className="size-3" strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Custom
            </p>
            <input
              ref={customInputRef}
              type="file"
              accept={MESSAGE_IMAGE_ACCEPT}
              className="hidden"
              aria-hidden
              onChange={(event) => void handleCustomImageSelect(event)}
            />
            <button
              type="button"
              disabled={isSaving}
              onClick={() => customInputRef.current?.click()}
              className={cn(
                "flex w-full items-center justify-between rounded-[13px] border px-3.5 py-3 text-left transition-ui",
                highlightedSelection === "custom"
                  ? "border-accent bg-accent-subtle"
                  : "border-border/70 bg-surface-1/50 hover:bg-surface-1/80"
              )}
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-surface-1">
                  <ImageIcon className="size-4 text-text-muted" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    Upload image
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    JPEG, PNG, or WebP up to 5MB
                  </p>
                </div>
              </div>
              {isSaving && highlightedSelection === "custom" ? (
                <Loader2
                  className="size-4 shrink-0 animate-spin text-accent"
                  strokeWidth={2}
                />
              ) : highlightedSelection === "custom" ? (
                <Check className="size-4 shrink-0 text-accent" strokeWidth={2} />
              ) : null}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

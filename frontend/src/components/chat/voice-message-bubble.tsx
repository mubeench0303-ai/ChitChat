"use client";

import { Loader2, Pause, Play } from "lucide-react";

import { useVoicePlayback } from "@/components/chat/voice-playback-context";
import { Button } from "@/components/ui/button";
import { formatVoiceDuration } from "@/lib/validations/audio";
import { cn } from "@/lib/utils";

interface VoiceMessageBubbleProps {
  messageId: string;
  audioUrl?: string | null;
  durationSeconds: number;
  isSent: boolean;
  isUploading?: boolean;
}

const BAR_COUNT = 24;

export function VoiceMessageBubble({
  messageId,
  audioUrl,
  durationSeconds,
  isSent,
  isUploading = false,
}: VoiceMessageBubbleProps) {
  const { togglePlayback, getProgress, getElapsedSeconds, isPlaying } =
    useVoicePlayback();

  const playing = isPlaying(messageId);
  const progress = getProgress(messageId);
  const elapsedSeconds = getElapsedSeconds(messageId);
  const displaySeconds = playing ? elapsedSeconds : durationSeconds;
  const canPlay = Boolean(audioUrl) && !isUploading;

  return (
    <div className="flex min-w-[min(100%,14rem)] items-center gap-2.5 py-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={!canPlay}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className={cn(
          "size-8 shrink-0 rounded-full",
          isSent
            ? "bg-white/15 text-white hover:bg-white/25 hover:text-white"
            : "bg-muted text-text-primary hover:bg-muted/80"
        )}
        onClick={() => {
          if (audioUrl) {
            togglePlayback(messageId, audioUrl);
          }
        }}
      >
        {isUploading ? (
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
        ) : playing ? (
          <Pause className="size-3.5" strokeWidth={2} />
        ) : (
          <Play className="size-3.5" strokeWidth={2} />
        )}
      </Button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex h-5 items-end gap-0.5">
          {Array.from({ length: BAR_COUNT }, (_, index) => {
            const barProgress = (index + 1) / BAR_COUNT;
            const filled = progress >= barProgress;
            const baseHeight = 35 + ((index * 17) % 65);

            return (
              <span
                key={index}
                className={cn(
                  "w-0.5 rounded-full transition-colors",
                  filled
                    ? isSent
                      ? "bg-white"
                      : "bg-accent"
                    : isSent
                      ? "bg-white/35"
                      : "bg-border"
                )}
                style={{ height: `${baseHeight}%` }}
              />
            );
          })}
        </div>
        <div
          className={cn(
            "h-0.5 w-full overflow-hidden rounded-full",
            isSent ? "bg-white/25" : "bg-border"
          )}
        >
          <div
            className={cn(
              "h-full rounded-full",
              isSent ? "bg-white" : "bg-accent"
            )}
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      </div>

      <span
        className={cn(
          "shrink-0 text-[11px] tabular-nums",
          isSent ? "text-white/90" : "text-text-muted"
        )}
      >
        {formatVoiceDuration(displaySeconds)}
      </span>
    </div>
  );
}

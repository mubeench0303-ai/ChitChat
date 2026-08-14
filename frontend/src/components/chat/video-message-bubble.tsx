"use client";

import { Loader2, Play } from "lucide-react";

import { formatVideoDuration } from "@/lib/validations/video";
import { cn } from "@/lib/utils";

interface VideoMessageBubbleProps {
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds: number;
  isSent: boolean;
  isUploading?: boolean;
  uploadProgress?: number | null;
  onOpen: () => void;
}

export function VideoMessageBubble({
  videoUrl,
  thumbnailUrl,
  durationSeconds,
  isSent,
  isUploading = false,
  uploadProgress = null,
  onOpen,
}: VideoMessageBubbleProps) {
  const canOpen = Boolean(videoUrl) && !isUploading;
  const poster = thumbnailUrl ?? undefined;

  return (
    <button
      type="button"
      disabled={!canOpen && !isUploading}
      onClick={() => {
        if (canOpen) {
          onOpen();
        }
      }}
      className={cn(
        "relative block w-full max-w-[min(100%,16rem)] overflow-hidden rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        canOpen && "cursor-pointer"
      )}
      aria-label={isUploading ? "Uploading video" : "Play video message"}
    >
      <div className="relative aspect-[4/3] w-full bg-black/20">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            className="size-full object-cover"
          />
        ) : videoUrl ? (
          <video
            src={videoUrl}
            muted
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center bg-muted/40" />
        )}

        <div className="absolute inset-0 bg-black/20" />

        <div className="absolute inset-0 grid place-items-center">
          {isUploading ? (
            <div className="flex flex-col items-center gap-2 text-white">
              <Loader2 className="size-7 animate-spin" strokeWidth={2} />
              <span className="text-[11px] font-medium">
                {uploadProgress !== null && uploadProgress >= 0
                  ? `Uploading ${uploadProgress}%`
                  : "Uploading video..."}
              </span>
            </div>
          ) : (
            <span
              className={cn(
                "grid size-10 place-items-center rounded-full shadow-sm",
                isSent ? "bg-white/90 text-text-primary" : "bg-accent text-white"
              )}
            >
              <Play className="size-4 fill-current" strokeWidth={0} />
            </span>
          )}
        </div>

        {!isUploading ? (
          <span
            className={cn(
              "absolute right-2 bottom-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              isSent ? "bg-black/55 text-white" : "bg-black/60 text-white"
            )}
          >
            {formatVideoDuration(durationSeconds)}
          </span>
        ) : null}

        {isUploading && uploadProgress !== null && uploadProgress >= 0 ? (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${Math.min(100, uploadProgress)}%` }}
            />
          </div>
        ) : null}
      </div>
    </button>
  );
}

"use client";

import type { RefObject } from "react";

import { cn } from "@/lib/utils";

interface StatusVideoDisplayProps {
  videoUrl: string;
  caption?: string | null;
  className?: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
  muted?: boolean;
  autoPlay?: boolean;
  onEnded?: () => void;
  onTimeUpdate?: () => void;
  onLoadedMetadata?: () => void;
}

export function StatusVideoDisplay({
  videoUrl,
  caption,
  className,
  videoRef,
  muted = true,
  autoPlay = true,
  onEnded,
  onTimeUpdate,
  onLoadedMetadata,
}: StatusVideoDisplayProps) {
  return (
    <div
      className={cn(
        "relative flex size-full min-h-0 items-center justify-center overflow-hidden",
        className
      )}
    >
      <video
        src={videoUrl}
        aria-hidden
        muted
        playsInline
        className="absolute inset-0 size-full scale-110 object-cover opacity-35 blur-2xl"
      />
      <video
        ref={videoRef}
        src={videoUrl}
        muted={muted}
        playsInline
        autoPlay={autoPlay}
        onEnded={onEnded}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        className="relative z-10 max-h-full max-w-full object-contain"
      />
      {caption?.trim() ? (
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 pb-6 pt-16 text-center text-sm leading-relaxed text-white">
          {caption}
        </div>
      ) : null}
    </div>
  );
}

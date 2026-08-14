"use client";

import { cn } from "@/lib/utils";

type StatusImageDisplayProps = {
  src: string;
  alt: string;
  caption?: string | null;
  className?: string;
  captionClassName?: string;
};

export function StatusImageDisplay({
  src,
  alt,
  caption,
  className,
  captionClassName,
}: StatusImageDisplayProps) {
  const trimmedCaption = caption?.trim();

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      <div className="absolute inset-0" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="size-full scale-110 object-cover blur-2xl"
        />
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="relative z-[1] size-full object-contain"
      />

      {trimmedCaption ? (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-28 pt-10 text-center text-sm leading-relaxed text-white",
            captionClassName
          )}
        >
          {trimmedCaption}
        </div>
      ) : null}
    </div>
  );
}

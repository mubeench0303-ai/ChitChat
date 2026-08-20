"use client";

import { cn } from "@/lib/utils";

interface AuthFormHeadingProps {
  id: string;
  title: string;
  emoji: string;
  subtitle: string;
  className?: string;
}

export function AuthFormHeading({
  id,
  title,
  emoji,
  subtitle,
  className,
}: AuthFormHeadingProps) {
  return (
    <div className={cn("mb-7", className)}>
      <h2
        id={id}
        className="text-[clamp(1.5rem,2.4vw,1.85rem)] font-bold leading-tight tracking-[-0.02em] text-text-primary"
      >
        {title}{" "}
        <span
          aria-hidden
          className="inline-block origin-[70%_70%] align-[-0.08em] text-[1.35em] leading-none animate-[wave_2.4s_ease-in-out_infinite]"
        >
          {emoji}
        </span>
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-text-secondary sm:text-[15.5px]">
        {subtitle}
      </p>
    </div>
  );
}

export const authSplitCardClassName = cn(
  "relative w-full max-w-[480px] overflow-hidden rounded-[24px] border border-border/70",
  "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-1)_85%,transparent),color-mix(in_srgb,var(--surface-1)_92%,transparent))]",
  "px-5 pt-7 pb-6 shadow-[0_50px_100px_-30px_color-mix(in_srgb,var(--text-primary)_14%,transparent)]",
  "backdrop-blur-[20px] sm:px-9 sm:pt-10 sm:pb-8"
);

export const authSplitLayoutClassName =
  "grid min-h-dvh w-full lg:grid-cols-[1.15fr_1fr]";

export const authSplitFormWrapClassName =
  "relative flex items-center justify-center px-5 py-9 sm:px-8 lg:px-8 lg:py-[50px]";

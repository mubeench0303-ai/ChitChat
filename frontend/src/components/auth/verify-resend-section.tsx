"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

const RESEND_SECONDS = 60;
const CIRCUMFERENCE = 2 * Math.PI * 22;

const reveal = (delay: number, reduceMotion: boolean | null) => ({
  initial: { opacity: 0, y: reduceMotion ? 0 : 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.65,
      delay,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
});

interface VerifyResendSectionProps {
  disabled: boolean;
  sending: boolean;
  onResend: () => void;
  onCountdownComplete?: () => void;
  resetKey?: number;
}

export function VerifyResendSection({
  disabled,
  sending,
  onResend,
  onCountdownComplete,
  resetKey = 0,
}: VerifyResendSectionProps) {
  const reduceMotion = useReducedMotion();
  const [remaining, setRemaining] = useState(RESEND_SECONDS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setRemaining(RESEND_SECONDS);
    setReady(false);

    const interval = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          setReady(true);
          onCountdownComplete?.();
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [resetKey, onCountdownComplete]);

  const progress = (RESEND_SECONDS - remaining) / RESEND_SECONDS;
  const ringOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <motion.div
      {...reveal(0.32, reduceMotion)}
      className="mt-4 flex items-center justify-center gap-3.5 sm:gap-4"
    >
      <div className="relative size-12 shrink-0">
        <svg
          aria-hidden
          className="size-12 -rotate-90"
          viewBox="0 0 48 48"
        >
          <circle
            cx="24"
            cy="24"
            r="22"
            fill="none"
            stroke="var(--border)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle
            cx="24"
            cy="24"
            r="22"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={ready ? 0 : ringOffset}
            className={cn(
              "transition-[stroke-dashoffset] duration-300",
              ready && "stroke-success"
            )}
          />
        </svg>
        <span
          className={cn(
            "absolute inset-0 grid place-items-center font-mono text-xs font-bold tracking-wide",
            ready ? "text-success" : "text-text-primary"
          )}
        >
          {ready ? "✓" : remaining}
        </span>
      </div>

      <div className="text-left text-sm text-text-secondary">
        <p>Didn&apos;t get it?</p>
        <button
          type="button"
          onClick={onResend}
          disabled={!ready || disabled || sending}
          className={cn(
            "group relative mt-0.5 inline-flex items-center gap-2 overflow-hidden rounded-[10px] px-3.5 py-2 text-[13px] font-bold text-accent transition-all",
            "hover:bg-accent-subtle disabled:cursor-not-allowed disabled:text-text-muted disabled:hover:bg-transparent",
            sending && "text-accent"
          )}
        >
          {sending ? (
            <span
              aria-hidden
              className="absolute inset-0 animate-[shimmer_1.2s_infinite] bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--accent)_20%,transparent),transparent)]"
            />
          ) : null}
          <span className="relative">{sending ? "Sending…" : "Resend code"}</span>
          <span className="relative transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </button>
      </div>
    </motion.div>
  );
}

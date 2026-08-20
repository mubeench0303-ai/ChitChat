"use client";

import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";

import { useAuthSuccessOverlay } from "@/components/auth/auth-success-overlay-utils";
import {
  signupGradientBgClass,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
import { cn } from "@/lib/utils";

const REDIRECT_MS = 4200;

interface LoginSuccessOverlayProps {
  open: boolean;
  displayName: string;
  onContinue: () => void;
}

export function LoginSuccessOverlay({
  open,
  displayName,
  onContinue,
}: LoginSuccessOverlayProps) {
  const reduceMotion = useReducedMotion();
  const { mounted, visible, animated, countdownLabel, burstRef } =
    useAuthSuccessOverlay({
      open,
      redirectMs: REDIRECT_MS,
      initialCountdown: 3,
      onComplete: onContinue,
      reduceMotion,
    });

  if (!mounted || !visible) {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-success-title"
      className={cn(
        "auth-success-overlay fixed inset-0 z-200 flex items-center justify-center bg-[rgba(8,8,12,0.88)] p-4 backdrop-blur-[18px] sm:p-6",
        animated && "is-open"
      )}
    >
      <div
        ref={burstRef}
        aria-hidden
        className="auth-success-confetti-burst pointer-events-none absolute inset-0 overflow-hidden"
      />

      <div
        className={cn(
          "auth-success-card relative w-full max-w-[440px] overflow-hidden rounded-[24px] border border-border/70",
          "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-1)_95%,transparent),color-mix(in_srgb,var(--surface-1)_88%,transparent))]",
          "px-6 py-10 text-center sm:px-12 sm:py-[50px]",
          "shadow-[0_60px_120px_-30px_color-mix(in_srgb,var(--text-primary)_18%,transparent)]"
        )}
      >
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-12 -top-16 size-36 rounded-full opacity-40 blur-3xl",
            signupGradientBgClass
          )}
        />

        <svg
          aria-hidden
          className="auth-success-okmark mx-auto mb-5 size-16 sm:size-[90px]"
          viewBox="0 0 84 84"
        >
          <circle cx="42" cy="42" r="36" />
          <path d="M26 43 37 54 58 31" />
        </svg>

        <h3
          id="login-success-title"
          className="auth-success-title relative mb-2.5 text-[clamp(1.35rem,4vw,1.65rem)] font-bold tracking-[-0.02em] text-text-primary"
        >
          Welcome{" "}
          <span className={cn("not-italic", signupGradientTextClass)}>
            back
          </span>
          !
        </h3>

        <p className="auth-success-copy relative text-sm leading-relaxed text-text-secondary sm:text-[14.5px]">
          Good to see you again,{" "}
          <strong className="font-semibold text-text-primary">{displayName}</strong>.
          <br />
          Your conversations are right where you left them.
        </p>

        <p className="auth-success-redirect relative mt-5 font-mono text-[10px] tracking-[0.12em] text-text-muted sm:text-[11px]">
          redirecting to chat in{" "}
          <strong className="font-semibold text-accent">{countdownLabel}</strong>
          …
        </p>
      </div>
    </div>,
    document.body
  );
}

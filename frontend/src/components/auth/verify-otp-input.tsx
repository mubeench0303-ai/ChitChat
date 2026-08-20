"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

export type VerifyOtpPhase = "idle" | "verifying" | "error" | "success";

export interface VerifyOtpInputHandle {
  focus: () => void;
  clear: () => void;
}

interface VerifyOtpInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  phase?: VerifyOtpPhase;
  successCount?: number;
}

function sanitizeCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export const VerifyOtpInput = forwardRef<VerifyOtpInputHandle, VerifyOtpInputProps>(
  function VerifyOtpInput(
    {
      value,
      onChange,
      disabled = false,
      phase = "idle",
      successCount = 0,
    },
    ref
  ) {
    const hiddenRef = useRef<HTMLInputElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const digits = sanitizeCode(value).split("");
    const padded = Array.from({ length: 6 }, (_, index) => digits[index] ?? "");

    useImperativeHandle(ref, () => ({
      focus: () => hiddenRef.current?.focus(),
      clear: () => {
        onChange("");
        setActiveIndex(0);
        hiddenRef.current?.focus();
      },
    }));

    useEffect(() => {
      const timer = window.setTimeout(() => hiddenRef.current?.focus(), 900);
      return () => window.clearTimeout(timer);
    }, []);

    function applyCode(next: string) {
      const cleaned = sanitizeCode(next);
      onChange(cleaned);
      setActiveIndex(Math.min(cleaned.length, 5));
    }

    function handleInput(event: React.ChangeEvent<HTMLInputElement>) {
      const incoming = event.target.value;

      if (incoming.length > 1) {
        applyCode(incoming);
        event.target.value = "";
        return;
      }

      if (/\d/.test(incoming)) {
        const next = sanitizeCode(value + incoming);
        applyCode(next);
      }

      event.target.value = "";
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
      if (event.key === "Backspace") {
        event.preventDefault();
        const next = value.slice(0, -1);
        applyCode(next);
        setActiveIndex(Math.max(0, next.length));
        return;
      }

      if (event.key === "ArrowLeft") {
        setActiveIndex((current) => Math.max(0, current - 1));
        return;
      }

      if (event.key === "ArrowRight") {
        setActiveIndex((current) => Math.min(5, current + 1));
        return;
      }

      if (event.key === "Enter" && value.length === 6) {
        hiddenRef.current?.blur();
      }
    }

    return (
      <div className="relative">
        <input
          ref={hiddenRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Verification code"
          disabled={disabled}
          className="pointer-events-none absolute -left-[9999px] opacity-0"
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setActiveIndex(Math.min(value.length, 5))}
          onBlur={() => {
            if (phase === "idle") {
              setActiveIndex(-1);
            }
          }}
        />

        <div className="grid grid-cols-6 gap-1.5 sm:gap-2.5">
          {padded.map((digit, index) => {
            const isActive = activeIndex === index && phase === "idle" && !disabled;
            const isFilled = Boolean(digit);
            const isSuccess =
              phase === "success" || (successCount > 0 && index < successCount);
            const isError = phase === "error";

            return (
              <motion.button
                key={index}
                type="button"
                disabled={disabled}
                onClick={() => {
                  hiddenRef.current?.focus();
                  setActiveIndex(index);
                }}
                animate={
                  isError
                    ? { x: [0, -7, 6, -4, 3, 0] }
                    : isSuccess
                      ? { scale: [1, 1.08, 1] }
                      : { x: 0, scale: 1 }
                }
                transition={{ duration: isError ? 0.45 : 0.35 }}
                className={cn(
                  "relative aspect-[1/1.1] rounded-[14px] border-[1.5px] bg-surface-1/70 text-xl font-bold text-text-primary transition-all duration-300 sm:text-[clamp(1.35rem,5vw,2rem)]",
                  "grid place-items-center select-none",
                  isActive &&
                    "z-[1] -translate-y-0.5 scale-[1.04] border-accent bg-surface-1 shadow-[0_0_0_4px_var(--accent-subtle)]",
                  !isActive &&
                    !isFilled &&
                    !isError &&
                    !isSuccess &&
                    "border-border hover:border-border/80",
                  isFilled &&
                    !isError &&
                    !isSuccess &&
                    "border-border",
                  isError && "border-danger bg-danger/5 text-danger",
                  isSuccess &&
                    "border-success/70 bg-success/10 text-success shadow-[0_0_24px_color-mix(in_srgb,var(--success)_35%,transparent)]"
                )}
              >
                {isFilled ? (
                  <motion.span
                    key={`${index}-${digit}-${phase}`}
                    initial={{ opacity: 0, y: 12, scale: 0.5 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 20,
                    }}
                    className="font-semibold tracking-tight"
                  >
                    {digit}
                  </motion.span>
                ) : null}
                {isActive && !isFilled ? (
                  <span className="absolute inset-y-[15%] left-1/2 w-0.5 -translate-x-1/2 animate-pulse rounded-full bg-accent" />
                ) : null}
              </motion.button>
            );
          })}
        </div>

        <p className="mt-3.5 flex flex-wrap items-center justify-center gap-1.5 text-center font-mono text-[11px] tracking-wide text-text-muted sm:text-[11.5px]">
          <kbd className="inline-flex min-w-[22px] items-center justify-center rounded-[5px] border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold shadow-[0_2px_0_var(--border)]">
            Ctrl
          </kbd>
          <span>+</span>
          <kbd className="inline-flex min-w-[22px] items-center justify-center rounded-[5px] border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold shadow-[0_2px_0_var(--border)]">
            V
          </kbd>
          <span>to paste the whole code at once</span>
        </p>
      </div>
    );
  }
);

export function useVerifyOtpPaste(onPasteCode: (code: string) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handlePaste(event: ClipboardEvent) {
      const text = event.clipboardData?.getData("text") ?? "";
      const cleaned = sanitizeCode(text);
      if (cleaned) {
        event.preventDefault();
        onPasteCode(cleaned);
      }
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [enabled, onPasteCode]);
}

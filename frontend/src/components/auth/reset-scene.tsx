"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Lock, ShieldCheck } from "lucide-react";

import {
  signupGradientBgClass,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
import { cn } from "@/lib/utils";

const reveal = (delay: number, reduceMotion: boolean | null) => ({
  initial: { opacity: 0, y: reduceMotion ? 0 : 16 },
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

interface ResetSceneProps {
  codeDigits?: string[];
}

function FloatingCode({ digits }: { digits: string[] }) {
  return (
    <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2 font-mono text-lg font-bold tracking-[0.35em] text-accent sm:bottom-8 sm:text-[22px] sm:tracking-[0.4em]">
      {digits.map((digit, index) => (
        <motion.span
          key={index}
          animate={{ y: [0, -3, 0] }}
          transition={{
            duration: 3,
            delay: index * 0.15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="text-accent"
        >
          {digit}
        </motion.span>
      ))}
    </div>
  );
}

function LockScene() {
  return (
    <div className="relative mx-auto h-[220px] max-w-[420px] sm:h-[300px]">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          aria-hidden
          className={cn(
            "absolute left-1/2 top-1/2 size-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] sm:size-[220px]",
            index === 0 && "border-accent/25",
            index === 1 && "size-[150px] border-dashed border-accent/15 sm:size-[180px]",
            index === 2 && "size-[120px] border-[#ff6b9d]/20 sm:size-[140px]"
          )}
          animate={{ rotate: 360 }}
          transition={{
            duration: index === 0 ? 20 : index === 1 ? 14 : 28,
            repeat: Infinity,
            ease: "linear",
            repeatType: index === 1 ? "reverse" : "loop",
          }}
        />
      ))}

      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        <div
          className={cn(
            "relative grid size-[88px] place-items-center rounded-[22px] text-white shadow-[0_24px_60px_-16px_color-mix(in_srgb,var(--accent)_45%,transparent)] sm:size-[100px] sm:rounded-[24px]",
            signupGradientBgClass
          )}
        >
          <Lock className="size-9 sm:size-10" strokeWidth={2.2} />
          <motion.span
            animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -right-1 -top-1 grid size-7 place-items-center rounded-full border-[3px] border-surface-1 bg-success"
          >
            <ShieldCheck className="size-3.5 text-white" strokeWidth={2.5} />
          </motion.span>
        </div>
      </motion.div>

      {Array.from({ length: 6 }).map((_, index) => (
        <motion.span
          key={index}
          aria-hidden
          className="absolute left-1/2 top-[18%] h-10 w-0.5 origin-bottom rounded-full bg-[linear-gradient(180deg,var(--accent),transparent)] opacity-40 sm:top-[16%] sm:h-12"
          style={{ transform: `translateX(-50%) rotate(${index * 60}deg)` }}
          animate={{ height: [28, 48, 28], opacity: [0.15, 0.7, 0.15] }}
          transition={{
            duration: 2.6,
            delay: index * 0.35,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function ResetScene({ codeDigits }: ResetSceneProps) {
  const reduceMotion = useReducedMotion();
  const [countdown, setCountdown] = useState("15:00");

  const displayDigits =
    codeDigits && codeDigits.some((digit) => digit)
      ? codeDigits.map((digit) => digit || "?")
      : Array.from({ length: 6 }, () => "?");

  useEffect(() => {
    const expiresAt = Date.now() + 15 * 60 * 1000;

    const interval = window.setInterval(() => {
      const remaining = Math.max(0, expiresAt - Date.now());
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setCountdown(
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <motion.aside
      initial={{ opacity: 0, x: reduceMotion ? 0 : -28 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
      className="hidden min-h-full flex-col border-r border-border/70 px-6 py-8 lg:flex xl:px-14 xl:py-11"
    >
      <motion.div {...reveal(0.08, reduceMotion)}>
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 font-semibold tracking-[-0.04em] text-text-primary no-underline"
        >
          <motion.span
            aria-hidden
            className={cn(
              "grid size-8 place-items-center rounded-[10px] text-sm text-white shadow-[0_8px_24px_color-mix(in_srgb,var(--accent)_32%,transparent)]",
              signupGradientBgClass
            )}
            animate={{ rotate: 360 }}
            transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
          >
            ✦
          </motion.span>
          <span className="text-[19px]">chitchat</span>
        </Link>
      </motion.div>

      <div className="my-auto max-w-[430px] py-8 xl:py-12">
        <motion.span
          {...reveal(0.16, reduceMotion)}
          className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-subtle px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-accent"
        >
          <i className={cn("block h-0.5 w-4 rounded-full", signupGradientBgClass)} />
          Step 2 of 3 · reset
        </motion.span>

        <motion.h1
          {...reveal(0.24, reduceMotion)}
          className="mt-7 text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[0.97] tracking-[-0.04em] text-text-primary"
        >
          Choose a new
          <br />
          <em className={cn("not-italic", signupGradientTextClass)}>
            password.
          </em>
        </motion.h1>

        <motion.p
          {...reveal(0.32, reduceMotion)}
          className="mt-5 max-w-[41ch] text-[15px] leading-relaxed text-text-secondary"
        >
          Enter the reset code from your email, then set a strong new password.
          Your account stays protected the whole way through.
        </motion.p>

        <motion.div {...reveal(0.44, reduceMotion)} className="relative mt-8 sm:mt-11">
          <LockScene />
          <FloatingCode digits={displayDigits} />
        </motion.div>

        <motion.div
          {...reveal(0.52, reduceMotion)}
          className="mt-8 flex flex-wrap gap-6 sm:gap-8"
        >
          <div>
            <span className="flex items-center gap-1.5 text-lg font-bold tracking-tight text-text-primary">
              <span className="size-2 animate-pulse rounded-full bg-success" />
              secure
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              reset link
            </span>
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-text-primary">
              {countdown}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              code expires
            </span>
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-text-primary">
              256-bit
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              encrypted
            </span>
          </div>
        </motion.div>
      </div>
    </motion.aside>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

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

interface VerifySceneProps {
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

function EnvelopeScene() {
  return (
    <div className="relative mx-auto h-[220px] max-w-[420px] sm:h-[300px]">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--accent)_30%,transparent),transparent)]">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className={cn(
              "absolute top-1/2 size-2 -translate-y-1/2 rounded-full",
              index === 0 && "bg-accent shadow-[0_0_14px_var(--accent)]",
              index === 1 && "size-1.5 bg-[#c06eff] shadow-[0_0_14px_#c06eff]",
              index === 2 && "size-1 bg-[#ff9a5a] shadow-[0_0_14px_#ff9a5a]"
            )}
            animate={{ left: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
            transition={{
              duration: 2.4,
              delay: index * 0.3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <motion.div
        animate={{ y: [0, -8, 0], rotate: [-2, 2, -2] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-1/2 top-1/2 h-[120px] w-[180px] -translate-x-1/2 -translate-y-1/2"
      >
        <div className="absolute inset-0 rounded-[10px] border-[1.5px] border-accent/25 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--surface-2)_80%,#2a2340),color-mix(in_srgb,var(--surface-1)_70%,#1a1530))] shadow-[0_30px_60px_-20px_color-mix(in_srgb,var(--accent)_35%,transparent)]" />

        <motion.div
          animate={{ rotateX: [0, 0, 180, 180, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-px left-0 h-0 w-0 border-x-[90px] border-t-[60px] border-x-transparent border-t-[color-mix(in_srgb,var(--accent)_35%,var(--surface-2))]"
          style={{ transformOrigin: "top center" }}
        />

        <motion.div
          animate={{ y: ["0%", "-35%", "0%"], scale: [0.95, 1, 0.95] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-x-[10%] top-[15%] flex h-[80%] items-center justify-center rounded bg-[linear-gradient(180deg,var(--surface-1),color-mix(in_srgb,var(--surface-1)_80%,#f5f0ff))] shadow-md"
        >
          <span className="text-sm font-bold tracking-[0.1em] text-accent">
            ✦ CODE
          </span>
        </motion.div>
      </motion.div>
    </div>
  );
}

export function VerifyScene({ codeDigits }: VerifySceneProps) {
  const reduceMotion = useReducedMotion();
  const [elapsed, setElapsed] = useState("0.0s");

  const displayDigits =
    codeDigits && codeDigits.length === 6
      ? codeDigits.map((digit) => digit || "?")
      : Array.from({ length: 6 }, () => "?");

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      setElapsed(`${seconds}s`);
    }, 100);

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
          Step 2 of 3 · verification
        </motion.span>

        <motion.h1
          {...reveal(0.24, reduceMotion)}
          className="mt-7 text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[0.97] tracking-[-0.04em] text-text-primary"
        >
          Check your
          <br />
          <em className={cn("not-italic", signupGradientTextClass)}>inbox.</em>
        </motion.h1>

        <motion.p
          {...reveal(0.32, reduceMotion)}
          className="mt-5 max-w-[41ch] text-[15px] leading-relaxed text-text-secondary"
        >
          We just sent a 6-digit verification code to the email you provided.
          Paste it below to unlock your happy place.
        </motion.p>

        <motion.div {...reveal(0.44, reduceMotion)} className="relative mt-8 sm:mt-11">
          <EnvelopeScene />
          <FloatingCode digits={displayDigits} />
        </motion.div>

        <motion.div
          {...reveal(0.52, reduceMotion)}
          className="mt-8 flex flex-wrap gap-6 sm:gap-8"
        >
          <div>
            <span className="flex items-center gap-1.5 text-lg font-bold tracking-tight text-text-primary">
              <span className="size-2 animate-pulse rounded-full bg-success" />
              live
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              code in transit
            </span>
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-text-primary">
              {elapsed}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              elapsed
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

"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

const orbTransition = (duration: number, delay = 0) => ({
  duration,
  delay,
  repeat: Infinity,
  repeatType: "reverse" as const,
  ease: "easeInOut" as const,
});

export function AuthShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <main
      className={cn(
        "relative isolate grid min-h-dvh place-items-center overflow-hidden px-[13px] py-5 max-sm:items-start sm:px-5 sm:py-[52px]",
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          background:
            "radial-gradient(circle at 12% 8%, var(--surface-1) 0 13%, transparent 35%), linear-gradient(135deg, var(--background) 0%, color-mix(in srgb, var(--accent) 4%, var(--background)) 50%, var(--background) 100%)",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0 -z-[2] opacity-[0.28] dark:opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in srgb, var(--accent) 8%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--accent) 8%, transparent) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
          maskImage:
            "radial-gradient(ellipse at center, black, transparent 72%)",
        }}
      />

      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-[90px] -top-[140px] -z-10 size-[360px] rounded-full blur-[4px]"
        style={{
          background:
            "radial-gradient(circle at 40% 40%, color-mix(in srgb, var(--accent) 22%, white), color-mix(in srgb, var(--accent) 8%, white) 42%, transparent 70%)",
        }}
        animate={
          reduceMotion
            ? undefined
            : { x: [0, 24], y: [0, 25], scale: [1, 1.1] }
        }
        transition={orbTransition(9)}
      />

      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-[105px] -right-[80px] -z-10 size-[330px] rounded-full blur-[4px]"
        style={{
          background:
            "radial-gradient(circle at 45% 45%, color-mix(in srgb, var(--accent) 16%, var(--surface-2)), color-mix(in srgb, var(--accent) 6%, var(--surface-1)) 48%, transparent 71%)",
        }}
        animate={
          reduceMotion
            ? undefined
            : { x: [0, -18], y: [0, -20], scale: [1, 1.08] }
        }
        transition={orbTransition(9, -3)}
      />

      <motion.div
        aria-hidden
        className="pointer-events-none absolute right-[15%] top-[24%] -z-10 size-[180px] rounded-full opacity-55 blur-[35px]"
        style={{
          background: "color-mix(in srgb, var(--accent) 12%, var(--surface-2))",
        }}
        animate={
          reduceMotion ? undefined : { x: [0, 14], y: [0, -16], scale: [1, 1.12] }
        }
        transition={orbTransition(12)}
      />

      {children}
    </main>
  );
}

/** @deprecated Use AuthShell */
export const SignupShell = AuthShell;

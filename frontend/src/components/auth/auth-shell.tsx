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
  variant = "centered",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "centered" | "split";
}) {
  const reduceMotion = useReducedMotion();
  const isSplit = variant === "split";

  return (
    <main
      className={cn(
        "relative isolate overflow-x-hidden",
        isSplit
          ? "min-h-dvh w-full"
          : "grid min-h-dvh place-items-center overflow-hidden px-[13px] py-5 max-sm:items-start sm:px-5 sm:py-[52px]",
        className
      )}
    >
      <div
        className="pointer-events-none fixed inset-0 -z-20"
        style={{
          background:
            "radial-gradient(circle at 12% 8%, var(--surface-1) 0 13%, transparent 35%), linear-gradient(135deg, var(--background) 0%, color-mix(in srgb, var(--accent) 4%, var(--background)) 50%, var(--background) 100%)",
        }}
      />

      {isSplit ? (
        <div
          className="pointer-events-none fixed inset-0 -z-[3] opacity-40 dark:opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(color-mix(in srgb, var(--text-primary) 4%, transparent) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute inset-0 -z-[2]",
          isSplit ? "opacity-[0.22] dark:opacity-[0.14]" : "opacity-[0.28] dark:opacity-[0.18]"
        )}
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in srgb, var(--accent) 8%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--accent) 8%, transparent) 1px, transparent 1px)",
          backgroundSize: isSplit ? "22px 22px" : "52px 52px",
          maskImage: isSplit
            ? "radial-gradient(ellipse at 75% 50%, black 10%, transparent 70%)"
            : "radial-gradient(ellipse at center, black, transparent 72%)",
        }}
      />

      <motion.div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -z-10 rounded-full blur-[4px]",
          isSplit
            ? "-left-[8%] -top-[10%] size-[520px] opacity-20"
            : "-left-[90px] -top-[140px] size-[360px]"
        )}
        style={{
          background: "radial-gradient(circle at 40% 40%, color-mix(in srgb, var(--accent) 22%, white), color-mix(in srgb, var(--accent) 8%, white) 42%, transparent 70%)",
        }}
        animate={
          reduceMotion
            ? undefined
            : isSplit
              ? { x: [0, 40], y: [0, -30], scale: [1, 1.1] }
              : { x: [0, 24], y: [0, 25], scale: [1, 1.1] }
        }
        transition={orbTransition(isSplit ? 22 : 9)}
      />

      <motion.div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -z-10 rounded-full blur-[4px]",
          isSplit
            ? "-right-[12%] top-[40%] size-[620px] opacity-15"
            : "-bottom-[105px] -right-[80px] size-[330px]"
        )}
        style={{
          background: "radial-gradient(circle at 45% 45%, color-mix(in srgb, var(--accent) 16%, var(--surface-2)), color-mix(in srgb, var(--accent) 6%, var(--surface-1)) 48%, transparent 71%)",
        }}
        animate={
          reduceMotion
            ? undefined
            : isSplit
              ? { x: [0, -30], y: [0, 40], scale: [1, 0.95] }
              : { x: [0, -18], y: [0, -20], scale: [1, 1.08] }
        }
        transition={orbTransition(isSplit ? 22 : 9, -3)}
      />

      <motion.div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -z-10 rounded-full",
          isSplit
            ? "bottom-[-10%] left-[30%] size-[460px] opacity-15 blur-[90px]"
            : "right-[15%] top-[24%] size-[180px] opacity-55 blur-[35px]"
        )}
        style={{
          background: "color-mix(in srgb, var(--accent) 12%, var(--surface-2))",
        }}
        animate={
          reduceMotion
            ? undefined
            : isSplit
              ? { x: [0, 20], y: [0, 20], scale: [1, 1.05] }
              : { x: [0, 14], y: [0, -16], scale: [1, 1.12] }
        }
        transition={orbTransition(isSplit ? 22 : 12, -7)}
      />

      {children}
    </main>
  );
}

/** @deprecated Use AuthShell */
export const SignupShell = AuthShell;

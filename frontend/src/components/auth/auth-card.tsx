"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

interface AuthCardProps {
  children: React.ReactNode;
  "aria-labelledby"?: string;
  className?: string;
}

export function AuthCard({
  children,
  "aria-labelledby": ariaLabelledBy,
  className,
}: AuthCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      aria-labelledby={ariaLabelledBy}
      initial={
        reduceMotion ? false : { opacity: 0, y: 28, scale: 0.975 }
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "relative w-full max-w-[500px] overflow-hidden rounded-[24px] border border-surface-1/80 px-4 pb-6 pt-6 sm:rounded-[30px] sm:px-11 sm:pb-8 sm:pt-[38px]",
        "bg-surface-1/76 shadow-[0_28px_70px_color-mix(in_srgb,var(--text-primary)_8%,transparent),0_2px_8px_color-mix(in_srgb,var(--text-primary)_4%,transparent)]",
        "backdrop-blur-[16px]",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[70px] -top-[95px] size-40 rounded-full bg-accent-subtle opacity-60 blur-[22px]"
      />
      {children}
    </motion.section>
  );
}

export const fieldHintClassName = "mt-1 text-xs leading-relaxed text-text-muted";

"use client";

import { Check } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

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

type ResetStep = 1 | 2 | 3;

interface ResetStepperProps {
  activeStep?: ResetStep;
  className?: string;
}

function StepDot({
  step,
  activeStep,
}: {
  step: ResetStep;
  activeStep: ResetStep;
}) {
  const done = step < activeStep;
  const active = step === activeStep;

  return (
    <div
      className={cn(
        "grid size-7 place-items-center rounded-full border-[1.5px] text-[11px] font-bold transition-all duration-400",
        done && "border-success bg-success text-white",
        active &&
          "border-accent text-accent shadow-[0_0_0_5px_var(--accent-subtle)]",
        !done && !active && "border-border text-text-muted"
      )}
    >
      {done ? <Check className="size-3" strokeWidth={3.5} /> : step}
    </div>
  );
}

export function ResetStepper({
  activeStep = 2,
  className,
}: ResetStepperProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      {...reveal(0.12, reduceMotion)}
      className={cn("mb-6 flex items-center justify-center", className)}
    >
      <div className="flex items-center gap-2">
        <StepDot step={1} activeStep={activeStep} />
        <span
          className={cn(
            "hidden text-xs font-semibold sm:inline",
            activeStep > 1 ? "text-success" : "text-text-muted"
          )}
        >
          Request
        </span>
      </div>

      <div className="relative mx-2.5 h-px w-6 overflow-hidden bg-border sm:w-10">
        {activeStep > 1 ? (
          <span className="absolute inset-0 origin-left scale-x-100 bg-accent" />
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <StepDot step={2} activeStep={activeStep} />
        <span
          className={cn(
            "hidden text-xs font-semibold sm:inline",
            activeStep >= 2 ? "text-text-primary" : "text-text-muted"
          )}
        >
          Reset
        </span>
      </div>

      <div className="relative mx-2.5 h-px w-6 overflow-hidden bg-border sm:w-10">
        {activeStep > 2 ? (
          <span className="absolute inset-0 origin-left scale-x-100 bg-accent" />
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <StepDot step={3} activeStep={activeStep} />
        <span className="hidden text-xs font-semibold text-text-muted sm:inline">
          Done
        </span>
      </div>
    </motion.div>
  );
}

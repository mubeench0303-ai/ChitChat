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

type VerifyStep = 1 | 2 | 3;

interface VerifyStepperProps {
  activeStep?: VerifyStep;
  className?: string;
}

function StepDot({
  step,
  activeStep,
}: {
  step: VerifyStep;
  activeStep: VerifyStep;
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

export function VerifyStepper({
  activeStep = 2,
  className,
}: VerifyStepperProps) {
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
          Sign up
        </span>
      </div>

      <div
        className={cn(
          "relative mx-2.5 h-px w-6 overflow-hidden bg-border sm:w-10",
          activeStep > 1 && "bg-border"
        )}
      >
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
          Verify
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

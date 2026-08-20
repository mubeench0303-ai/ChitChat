"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

interface SignupSubmitButtonProps {
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  type?: "submit" | "button";
  onClick?: () => void;
}

const fillTransition = { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const };

const baseGradientLight =
  "linear-gradient(104deg, #e6404d 0%, #ff7347 50%, #e6404d 100%)";
const baseGradientDark =
  "linear-gradient(104deg, #ff404f 0%, #ff8a5c 50%, #ff404f 100%)";
const fillGradientLight =
  "linear-gradient(104deg, #ff7347 0%, #c92a44 100%)";
const fillGradientDark =
  "linear-gradient(104deg, #ff8a5c 0%, #e93645 100%)";

export function SignupSubmitButton({
  disabled,
  loading = false,
  children,
  type = "submit",
  onClick,
}: SignupSubmitButtonProps) {
  const reduceMotion = useReducedMotion();
  const isDisabled = disabled || loading;

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      initial="rest"
      whileHover={reduceMotion || isDisabled ? "rest" : "hover"}
      whileTap={reduceMotion || isDisabled ? "rest" : "tap"}
      variants={{
        rest: { y: 0 },
        hover: { y: -3 },
        tap: { y: -1 },
      }}
      className="group relative h-[51px] w-full cursor-pointer overflow-hidden rounded-[14px] shadow-[0_12px_20px_rgba(230,64,77,0.24)] transition-shadow duration-300 hover:shadow-[0_17px_26px_rgba(230,64,77,0.34)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 dark:hidden"
        style={{
          backgroundImage: baseGradientLight,
          backgroundSize: "200% 100%",
        }}
        variants={{
          rest: { backgroundPosition: "0% 50%" },
          hover: { backgroundPosition: "100% 50%" },
          tap: { backgroundPosition: "100% 50%" },
        }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
      />
      <motion.span
        aria-hidden
        className="absolute inset-0 hidden dark:block"
        style={{
          backgroundImage: baseGradientDark,
          backgroundSize: "200% 100%",
        }}
        variants={{
          rest: { backgroundPosition: "0% 50%" },
          hover: { backgroundPosition: "100% 50%" },
          tap: { backgroundPosition: "100% 50%" },
        }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
      />

      <motion.span
        aria-hidden
        className="absolute inset-y-0 left-0 w-full origin-left dark:hidden"
        style={{ backgroundImage: fillGradientLight }}
        variants={{
          rest: { scaleX: 0 },
          hover: { scaleX: 1 },
          tap: { scaleX: 1 },
        }}
        transition={fillTransition}
      />
      <motion.span
        aria-hidden
        className="absolute inset-y-0 left-0 hidden w-full origin-left dark:block"
        style={{ backgroundImage: fillGradientDark }}
        variants={{
          rest: { scaleX: 0 },
          hover: { scaleX: 1 },
          tap: { scaleX: 1 },
        }}
        transition={fillTransition}
      />

      <span className="relative z-10 flex h-full items-center justify-between px-[22px] pr-[18px] text-[13px] font-bold text-white">
        {loading ? (
          <span
            aria-label="Creating account"
            className="mx-auto flex gap-1.5"
          >
            <i
              className={cn(
                "size-1.5 animate-bounce rounded-full bg-white",
                reduceMotion && "animate-none"
              )}
            />
            <i
              className={cn(
                "size-1.5 animate-bounce rounded-full bg-white [animation-delay:150ms]",
                reduceMotion && "animate-none"
              )}
            />
            <i
              className={cn(
                "size-1.5 animate-bounce rounded-full bg-white [animation-delay:300ms]",
                reduceMotion && "animate-none"
              )}
            />
          </span>
        ) : (
          <>
            <span className="flex items-center gap-2">{children}</span>
            <motion.span
              aria-hidden
              className="grid size-[25px] place-items-center rounded-lg bg-white/18 text-lg leading-none"
              variants={{
                rest: { x: 0, scale: 1 },
                hover: { x: 4, scale: 1.08 },
                tap: { x: 2, scale: 1.04 },
              }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              →
            </motion.span>
          </>
        )}
      </span>
    </motion.button>
  );
}

export const signupGradientTextClass =
  "bg-[linear-gradient(100deg,#e6404d,#ff7347)] bg-clip-text text-transparent dark:bg-[linear-gradient(100deg,#ff404f,#ff8a5c)]";

export const signupGradientBgClass =
  "bg-[linear-gradient(135deg,#e6404d,#ff7347)] dark:bg-[linear-gradient(135deg,#ff404f,#ff8a5c)]";

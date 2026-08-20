"use client";

import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { Check, Eye, EyeOff, LoaderCircle, Lock, X } from "lucide-react";

import { cn } from "@/lib/utils";

function fieldShellClassName(state?: ValidationState) {
  return cn(
    "flex h-12 items-center overflow-hidden rounded-[13px] border bg-surface-1/70 transition-all duration-250 focus-within:-translate-y-px focus-within:bg-surface-1",
    state === "valid" &&
      "border-emerald-500/35 focus-within:border-emerald-500/50 focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-emerald-500)_12%,transparent)]",
    state === "invalid" &&
      "border-danger/60 bg-danger/5 focus-within:border-danger focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--danger)_12%,transparent)]",
    state === "checking" &&
      "border-[#c06eff]/40 focus-within:border-[#c06eff]/60 focus-within:shadow-[0_0_0_4px_rgba(192,110,255,0.12)]",
    (!state || state === "idle") &&
      "border-border focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--accent-subtle)] has-[input[aria-invalid=true]]:border-danger has-[input[aria-invalid=true]]:shadow-[0_0_0_4px_color-mix(in_srgb,var(--danger)_12%,transparent)]"
  );
}

const inputClassName =
  "h-full w-full min-w-0 border-0 bg-transparent px-3.5 text-sm font-medium text-text-primary outline-none placeholder:text-text-muted";

interface SignupFieldIconProps {
  children: ReactNode;
}

function SignupFieldIcon({ children }: SignupFieldIconProps) {
  return (
    <span className="flex w-[38px] shrink-0 items-center justify-center text-text-muted">
      {children}
    </span>
  );
}

export interface SignupTextInputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode;
  floatingLabel?: string;
  validationState?: ValidationState;
}

export type ValidationState = "idle" | "checking" | "valid" | "invalid";

function FieldStatus({ state }: { state?: ValidationState }) {
  if (!state || state === "idle") {
    return null;
  }

  return (
    <span
      aria-hidden
      className={cn(
        "absolute right-3 grid size-6 place-items-center rounded-full",
        state === "valid" && "bg-emerald-500/15 text-emerald-500",
        state === "invalid" && "bg-danger/15 text-danger",
        state === "checking" && "text-[#c06eff]"
      )}
    >
      {state === "valid" ? (
        <Check className="size-3.5" strokeWidth={3} />
      ) : state === "invalid" ? (
        <X className="size-3.5" strokeWidth={3} />
      ) : (
        <LoaderCircle className="size-4 animate-spin" strokeWidth={2.5} />
      )}
    </span>
  );
}

export const SignupTextInput = forwardRef<
  HTMLInputElement,
  SignupTextInputProps
>(({ className, leadingIcon, floatingLabel, validationState, id, ...props }, ref) => {
  return (
    <div
      className={cn(
        fieldShellClassName(validationState),
        floatingLabel && "relative overflow-visible",
        className
      )}
    >
      {leadingIcon ? <SignupFieldIcon>{leadingIcon}</SignupFieldIcon> : null}
      <input
        ref={ref}
        id={id}
        className={cn(inputClassName, "peer", leadingIcon && "pl-0")}
        placeholder=" "
        {...props}
      />
      <FieldStatus state={validationState} />
      {floatingLabel ? (
        <label
          htmlFor={id}
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 bg-surface-1 px-1 text-[13px] font-bold text-text-secondary transition-all duration-200 ease-[cubic-bezier(.3,.7,.3,1)]",
            "peer-focus:top-0 peer-focus:text-[10px] peer-focus:uppercase peer-focus:tracking-[0.14em] peer-focus:text-accent",
            "peer-not-placeholder-shown:top-0 peer-not-placeholder-shown:text-[10px] peer-not-placeholder-shown:uppercase peer-not-placeholder-shown:tracking-[0.14em] peer-aria-invalid:text-danger",
            leadingIcon ? "left-[34px]" : "left-3.5"
          )}
        >
          {floatingLabel}
        </label>
      ) : null}
    </div>
  );
});

SignupTextInput.displayName = "SignupTextInput";

export interface SignupPasswordInputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  floatingLabel?: string;
  validationState?: ValidationState;
}

export const SignupPasswordInput = forwardRef<
  HTMLInputElement,
  SignupPasswordInputProps
>(({ className, floatingLabel, validationState, id, ...props }, ref) => {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className={cn(
        fieldShellClassName(validationState),
        floatingLabel && "relative overflow-visible",
        className
      )}
    >
      <SignupFieldIcon>
        <Lock className="size-4" strokeWidth={2} />
      </SignupFieldIcon>
      <input
        ref={ref}
        id={id}
        type={visible ? "text" : "password"}
        className={cn(inputClassName, "peer pl-0 pr-2")}
        placeholder=" "
        {...props}
      />
      <FieldStatus state={validationState} />
      {floatingLabel ? (
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-[34px] top-1/2 -translate-y-1/2 bg-surface-1 px-1 text-[13px] font-bold text-text-secondary transition-all duration-200 ease-[cubic-bezier(.3,.7,.3,1)] peer-focus:top-0 peer-focus:text-[10px] peer-focus:uppercase peer-focus:tracking-[0.14em] peer-focus:text-accent peer-not-placeholder-shown:top-0 peer-not-placeholder-shown:text-[10px] peer-not-placeholder-shown:uppercase peer-not-placeholder-shown:tracking-[0.14em] peer-aria-invalid:text-danger"
        >
          {floatingLabel}
        </label>
      ) : null}
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className={cn(
          "mr-9 shrink-0 cursor-pointer rounded-sm p-1 text-text-muted transition-ui",
          "hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-subtle"
        )}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? (
          <EyeOff className="size-4" strokeWidth={1.75} />
        ) : (
          <Eye className="size-4" strokeWidth={1.75} />
        )}
      </button>
    </div>
  );
});

SignupPasswordInput.displayName = "SignupPasswordInput";

export const SignupTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, id, ...props }, ref) => {
  return (
    <div
      className={cn(
        fieldShellClassName,
        "h-auto min-h-[120px] items-start py-3",
        className
      )}
    >
      <textarea
        ref={ref}
        id={id}
        className={cn(inputClassName, "resize-none py-0 leading-relaxed")}
        {...props}
      />
    </div>
  );
});

SignupTextarea.displayName = "SignupTextarea";

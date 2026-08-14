"use client";

import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { Lock, Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";

const fieldShellClassName =
  "flex h-12 items-center overflow-hidden rounded-[13px] border border-border bg-surface-1/70 transition-all duration-250 focus-within:-translate-y-px focus-within:border-accent focus-within:bg-surface-1 focus-within:shadow-[0_0_0_4px_var(--accent-subtle)] has-[input[aria-invalid=true]]:border-danger has-[input[aria-invalid=true]]:shadow-[0_0_0_4px_color-mix(in_srgb,var(--danger)_12%,transparent)]";

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
}

export const SignupTextInput = forwardRef<
  HTMLInputElement,
  SignupTextInputProps
>(({ className, leadingIcon, id, ...props }, ref) => {
  return (
    <div className={cn(fieldShellClassName, className)}>
      {leadingIcon ? <SignupFieldIcon>{leadingIcon}</SignupFieldIcon> : null}
      <input
        ref={ref}
        id={id}
        className={cn(inputClassName, leadingIcon && "pl-0")}
        {...props}
      />
    </div>
  );
});

SignupTextInput.displayName = "SignupTextInput";

export interface SignupPasswordInputProps
  extends InputHTMLAttributes<HTMLInputElement> {}

export const SignupPasswordInput = forwardRef<
  HTMLInputElement,
  SignupPasswordInputProps
>(({ className, id, ...props }, ref) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn(fieldShellClassName, className)}>
      <SignupFieldIcon>
        <Lock className="size-4" strokeWidth={2} />
      </SignupFieldIcon>
      <input
        ref={ref}
        id={id}
        type={visible ? "text" : "password"}
        className={cn(inputClassName, "pl-0 pr-2")}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className={cn(
          "mr-2 shrink-0 cursor-pointer rounded-sm p-1 text-text-muted transition-ui",
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

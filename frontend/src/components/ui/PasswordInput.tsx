"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";

import { Label } from "./label";

export interface PasswordInputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    const inputId =
      id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="flex flex-col gap-1">
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={visible ? "text" : "password"}
            className={cn(
              "h-9 w-full rounded-md border border-border bg-surface-2 py-2 pl-3 pr-10 text-base text-text-primary",
              "placeholder:text-text-muted focus-accent transition-ui",
              error && "border-danger",
              "aria-invalid:border-danger",
              className
            )}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-sm p-1 text-text-muted transition-ui",
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
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

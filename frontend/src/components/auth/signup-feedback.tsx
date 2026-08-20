"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type UsernameAvailabilityStatus =
  | "idle"
  | "checking"
  | "valid"
  | "invalid";

export type GmailBadgeState = "neutral" | "match" | "bad";

export function getGmailBadgeState(email: string): GmailBadgeState {
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes("@")) {
    return "neutral";
  }

  return /@gmail\.com$/i.test(trimmed) ? "match" : "bad";
}

export function isSignupEmailValid(email: string) {
  return /^[^\s@]+@gmail\.com$/i.test(email.trim());
}

/** @deprecated Use getGmailBadgeState + isSignupEmailValid with blur handling */
export function getSignupEmailStatus(
  email: string
): "idle" | "valid" | "invalid" {
  if (isSignupEmailValid(email)) {
    return "valid";
  }

  return getGmailBadgeState(email) === "bad" ? "invalid" : "idle";
}

export function SuccessHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-xs font-medium text-emerald-500">{children}</p>
  );
}

export function UsernameAvailabilityChip({
  status,
  username,
}: {
  status: UsernameAvailabilityStatus;
  username: string;
}) {
  if (!username.trim() || status === "idle") {
    return null;
  }

  const label =
    status === "checking"
      ? "Checking availability…"
      : status === "valid"
        ? "Available ✓"
        : status === "invalid"
          ? "Username unavailable"
          : null;

  if (!label) {
    return null;
  }

  return (
    <span
      className={cn(
        "mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.06em]",
        status === "checking" &&
          "bg-[rgba(192,110,255,0.12)] text-[#c06eff]",
        status === "valid" && "bg-emerald-500/10 text-emerald-500",
        status === "invalid" && "bg-danger/10 text-danger"
      )}
    >
      {status === "checking" ? (
        <i className="size-1.5 animate-pulse rounded-full bg-current" />
      ) : (
        <i className="size-1.5 rounded-full bg-current" />
      )}
      {label}
    </span>
  );
}

export function GmailBadge({ email }: { email: string }) {
  const state = getGmailBadgeState(email);

  if (state === "match") {
    return (
      <span className="inline-flex items-center rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-500">
        ✓ Gmail verified
      </span>
    );
  }

  if (state === "bad") {
    return (
      <span className="inline-flex items-center rounded-md bg-danger/15 px-2 py-0.5 text-[10.5px] font-semibold text-danger">
        ✗ Gmail only
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-md bg-surface-2/80 px-2 py-0.5 text-[10.5px] font-semibold text-text-muted opacity-70">
      📧 only @gmail.com
    </span>
  );
}

export function GmailErrorHint({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }

  return (
    <p className="mt-1.5 text-[11.5px] font-medium text-danger">
      Only @gmail.com addresses are supported
    </p>
  );
}

const STRENGTH_LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];

const PASSWORD_CRITERIA = [
  { label: "8+ characters", test: (password: string) => password.length >= 8 },
  {
    label: "Uppercase letter",
    test: (password: string) => /[A-Z]/.test(password),
  },
  {
    label: "Lowercase letter",
    test: (password: string) => /[a-z]/.test(password),
  },
  { label: "Number", test: (password: string) => /\d/.test(password) },
] as const;

function scorePassword(password: string) {
  let score = 0;
  PASSWORD_CRITERIA.forEach((criterion) => {
    if (criterion.test(password)) {
      score++;
    }
  });
  return score;
}

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) {
    return null;
  }

  const score = scorePassword(password);
  const filledBars = Math.max(1, score);

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, index) => (
          <i
            key={index}
            className={cn(
              "h-[3px] flex-1 rounded-full bg-surface-2 transition-colors duration-300",
              index < filledBars &&
                (score <= 1
                  ? "bg-danger"
                  : score === 2
                    ? "bg-amber-400"
                    : score === 3
                      ? "bg-lime-400"
                      : "bg-emerald-500")
            )}
          />
        ))}
      </div>
      <p className="mt-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        <span>{STRENGTH_LABELS[score] ?? "Too short"}</span>
        <span>{Math.min(password.length, 8)}/8</span>
      </p>
      <ul className="mt-2 space-y-1">
        {PASSWORD_CRITERIA.map((criterion) => {
          const met = criterion.test(password);

          return (
            <li
              key={criterion.label}
              className={cn(
                "flex items-center gap-2 text-[11px] font-medium transition-colors",
                met ? "text-emerald-500" : "text-text-muted"
              )}
            >
              <span
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                  met
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-border bg-surface-2"
                )}
              >
                {met ? <Check className="size-2.5" strokeWidth={3} /> : null}
              </span>
              {criterion.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PasswordMatchHint({
  password,
  confirmPassword,
}: {
  password: string;
  confirmPassword: string;
}) {
  if (!confirmPassword) {
    return null;
  }

  const matches = confirmPassword === password;

  return (
    <p
      className={cn(
        "mt-1.5 flex items-center gap-1.5 text-xs font-medium",
        matches ? "text-emerald-500" : "text-danger"
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {matches ? "Passwords match ✓" : "Passwords don't match"}
    </p>
  );
}

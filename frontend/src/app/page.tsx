"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { signupGradientBgClass } from "@/components/auth/signup-submit-button";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    router.replace(user ? "/chat" : "/login");
  }, [isInitialized, user, router]);

  if (isInitialized) {
    return null;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="inline-flex items-center gap-2.5 font-semibold tracking-[-0.04em] text-text-primary animate-pulse">
        <span
          aria-hidden
          className={cn(
            "grid size-8 place-items-center rounded-[10px] text-sm text-white shadow-[0_8px_24px_color-mix(in_srgb,var(--accent)_32%,transparent)] animate-spin-slow",
            signupGradientBgClass
          )}
        >
          ✦
        </span>
        <span className="text-[19px] font-semibold tracking-[-0.04em] text-text-primary">
          chitchat
        </span>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/auth-store";

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
      <Skeleton className="h-10 w-48 rounded-xl" />
    </div>
  );
}

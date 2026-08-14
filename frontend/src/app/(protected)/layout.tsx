"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ProtectedAppShell } from "@/components/layout/protected-app-shell";
import { NotificationProvider } from "@/components/providers/notification-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/auth-store";

export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  useEffect(() => {
    if (isInitialized && !user) {
      router.replace("/login");
    }
  }, [isInitialized, user, router]);

  if (!isInitialized) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Skeleton className="h-10 w-48 rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <NotificationProvider>
      <ProtectedAppShell>{children}</ProtectedAppShell>
    </NotificationProvider>
  );
}

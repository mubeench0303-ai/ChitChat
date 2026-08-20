"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { useAuthStore } from "@/store/auth-store";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  const isSplitLayout = pathname === "/login" || pathname === "/signup";

  useEffect(() => {
    if (isInitialized && user) {
      router.replace("/chat");
    }
  }, [isInitialized, user, router]);

  if (isInitialized && user) {
    return null;
  }

  return (
    <AuthShell variant={isSplitLayout ? "split" : "centered"}>
      {children}
    </AuthShell>
  );
}

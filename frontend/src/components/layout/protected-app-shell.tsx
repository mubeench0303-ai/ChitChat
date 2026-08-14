"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

interface ProtectedAppShellProps {
  children: React.ReactNode;
}

function isFullBleedRoute(pathname: string) {
  return /^\/chat\/[^/]+$/.test(pathname);
}

export function ProtectedAppShell({ children }: ProtectedAppShellProps) {
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const hideMobileHeader = isFullBleedRoute(pathname);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <div className="hidden h-full min-h-0 shrink-0 lg:flex">
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {hideMobileHeader ? null : (
          <header className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-background px-3 py-2 lg:hidden">
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              aria-label="Open navigation menu"
              onClick={() => setIsMobileNavOpen(true)}
            >
              <Menu className="size-4" strokeWidth={2} />
            </Button>
            <p className="truncate text-sm font-semibold text-text-primary">
              ChitChat
            </p>
          </header>
        )}

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>

      <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
        <SheetContent
          side="left"
          className="flex h-full w-[min(100vw,272px)] flex-col gap-0 p-0"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            className="h-full min-h-0 w-full border-r-0"
            onNavigate={() => setIsMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

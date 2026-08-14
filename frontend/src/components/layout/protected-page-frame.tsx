import { cn } from "@/lib/utils";

interface ProtectedPageFrameProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function ProtectedPageFrame({
  children,
  className,
  contentClassName,
}: ProtectedPageFrameProps) {
  return (
    <div className={cn("h-full overflow-y-auto overscroll-contain", className)}>
      <div
        className={cn(
          "mx-auto flex min-h-full w-full max-w-[500px] flex-col px-4 py-5 sm:px-6 sm:py-8",
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

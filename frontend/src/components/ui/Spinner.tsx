import { cn } from "@/lib/utils";

export interface SpinnerProps {
  size?: "sm" | "md";
  className?: string;
}

const sizeClasses = {
  sm: "size-4 border-2",
  md: "size-5 border-2",
} as const;

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block animate-spin rounded-full border-accent border-t-transparent",
        sizeClasses[size],
        className
      )}
    />
  );
}

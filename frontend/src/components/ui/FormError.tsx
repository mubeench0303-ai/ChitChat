import { cn } from "@/lib/utils";

export interface FormErrorProps {
  message?: string;
  className?: string;
}

export function FormError({ message, className }: FormErrorProps) {
  if (!message) {
    return null;
  }

  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border border-danger bg-danger/10 p-3 text-sm text-danger",
        className
      )}
    >
      {message}
    </div>
  );
}

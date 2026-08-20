"use client";

import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";

export type VerifyStatusType = "error" | "success" | "info";

export interface VerifyStatusMessage {
  type: VerifyStatusType;
  text: string;
}

interface VerifyStatusBannerProps {
  status: VerifyStatusMessage | null;
}

const icons = {
  error: XCircle,
  success: CheckCircle2,
  info: AlertCircle,
};

export function VerifyStatusBanner({ status }: VerifyStatusBannerProps) {
  return (
    <AnimatePresence mode="wait">
      {status ? (
        <motion.div
          key={`${status.type}-${status.text}`}
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -4, height: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "mb-4 flex items-center gap-2.5 overflow-hidden rounded-[11px] border px-4 py-2.5 text-xs font-semibold sm:text-[12.5px]",
            status.type === "error" &&
              "border-danger/25 bg-danger/10 text-danger",
            status.type === "success" &&
              "border-success/25 bg-success/10 text-success",
            status.type === "info" &&
              "border-accent/20 bg-accent-subtle text-accent"
          )}
        >
          {(() => {
            const Icon = icons[status.type];
            return (
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  status.type === "error" && "animate-[shake_0.45s_ease]"
                )}
                strokeWidth={2}
              />
            );
          })()}
          <span>{status.text}</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

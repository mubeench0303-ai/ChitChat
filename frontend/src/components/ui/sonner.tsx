"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-right"
      offset={24}
      duration={4000}
      closeButton
      expand
      visibleToasts={5}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" strokeWidth={2} />,
        info: <InfoIcon className="size-4 text-text-secondary" strokeWidth={2} />,
        warning: (
          <TriangleAlertIcon className="size-4 text-amber-500" strokeWidth={2} />
        ),
        error: <OctagonXIcon className="size-4 text-danger" strokeWidth={2} />,
        loading: <Loader2Icon className="size-4 animate-spin text-text-muted" />,
      }}
      toastOptions={{
        classNames: {
          toast: "chitchat-toast",
          title: "chitchat-toast-title",
          description: "chitchat-toast-description",
          actionButton: "chitchat-toast-action",
          cancelButton: "chitchat-toast-cancel",
          closeButton: "chitchat-toast-close",
          success: "chitchat-toast-success",
          error: "chitchat-toast-error",
          warning: "chitchat-toast-warning",
          info: "chitchat-toast-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

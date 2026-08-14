"use client";

import { useEffect } from "react";

import { connect, subscribe } from "@/lib/ws/socket";
import { useAuthStore } from "@/store/auth-store";
import type { PresenceEventPayload } from "@/types";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const fetchCurrentUser = useAuthStore((state) => state.fetchCurrentUser);
  const updatePresence = useAuthStore((state) => state.updatePresence);
  const user = useAuthStore((state) => state.user);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (isInitialized && user) {
      connect();
    }
  }, [isInitialized, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const unsubConnected = subscribe("__connected", () => {
      updatePresence(true);
    });

    const unsubPresence = subscribe("presence", (payload) => {
      const event = payload as PresenceEventPayload;

      if (event.userId === user.id) {
        updatePresence(event.isOnline, event.lastSeen ?? null);
      }
    });

    return () => {
      unsubConnected();
      unsubPresence();
    };
  }, [updatePresence, user?.id]);

  return children;
}
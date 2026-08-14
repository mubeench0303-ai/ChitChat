import { create } from "zustand";

import { getMe } from "@/lib/api/auth";
import { disconnect, getConnectionState } from "@/lib/ws/socket";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  setUser: (user: User | null) => void;
  updatePresence: (isOnline: boolean, lastSeen?: string | null) => void;
  setNotificationSoundEnabled: (enabled: boolean) => void;
  fetchCurrentUser: () => Promise<void>;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,

  setUser: (user) => set({ user }),

  updatePresence: (isOnline, lastSeen) =>
    set((state) => {
      if (!state.user) {
        return state;
      }

      return {
        user: {
          ...state.user,
          isOnline,
          lastSeen:
            lastSeen !== undefined ? lastSeen : state.user.lastSeen,
        },
      };
    }),

  setNotificationSoundEnabled: (enabled) =>
    set((state) => {
      if (!state.user) {
        return state;
      }

      return {
        user: {
          ...state.user,
          notificationSoundEnabled: enabled,
        },
      };
    }),

  fetchCurrentUser: async () => {
    set({ isLoading: true });

    try {
      const user = await getMe();
      const isConnected = getConnectionState() === "connected";

      set({
        user: {
          ...user,
          isOnline: user.isOnline || isConnected,
        },
      });
    } catch {
      set({ user: null });
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },

  clearUser: () => {
    disconnect();
    set({ user: null });
  },
}));
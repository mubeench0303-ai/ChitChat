"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface VoicePlaybackContextValue {
  currentlyPlayingId: string | null;
  togglePlayback: (messageId: string, audioUrl: string) => void;
  getProgress: (messageId: string) => number;
  getElapsedSeconds: (messageId: string) => number;
  isPlaying: (messageId: string) => boolean;
}

const VoicePlaybackContext = createContext<VoicePlaybackContextValue | null>(
  null
);

export function VoicePlaybackProvider({ children }: { children: ReactNode }) {
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioUrlsRef = useRef<Map<string, string>>(new Map());
  const currentlyPlayingIdRef = useRef<string | null>(null);
  const progressLoopRef = useRef<number | null>(null);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(
    null
  );
  const [progressById, setProgressById] = useState<Record<string, number>>({});
  const [elapsedById, setElapsedById] = useState<Record<string, number>>({});

  const stopProgressLoop = useCallback(() => {
    if (progressLoopRef.current !== null) {
      cancelAnimationFrame(progressLoopRef.current);
      progressLoopRef.current = null;
    }
  }, []);

  const syncProgress = useCallback((messageId: string, audio: HTMLAudioElement) => {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : null;

    if (!duration) {
      return;
    }

    setProgressById((current) => ({
      ...current,
      [messageId]: audio.currentTime / duration,
    }));
    setElapsedById((current) => ({
      ...current,
      [messageId]: audio.currentTime,
    }));
  }, []);

  const startProgressLoop = useCallback(
    (messageId: string, audio: HTMLAudioElement) => {
      stopProgressLoop();

      const tick = () => {
        if (
          audio.paused ||
          currentlyPlayingIdRef.current !== messageId
        ) {
          stopProgressLoop();
          return;
        }

        syncProgress(messageId, audio);
        progressLoopRef.current = requestAnimationFrame(tick);
      };

      progressLoopRef.current = requestAnimationFrame(tick);
    },
    [stopProgressLoop, syncProgress]
  );

  const pauseMessage = useCallback(
    (messageId: string) => {
      const audio = audioElementsRef.current.get(messageId);
      if (!audio || audio.paused) {
        return;
      }

      audio.pause();
      syncProgress(messageId, audio);

      if (currentlyPlayingIdRef.current === messageId) {
        currentlyPlayingIdRef.current = null;
        setCurrentlyPlayingId(null);
        stopProgressLoop();
      }
    },
    [stopProgressLoop, syncProgress]
  );

  const getOrCreateAudio = useCallback(
    (messageId: string, audioUrl: string) => {
      const existing = audioElementsRef.current.get(messageId);
      const storedUrl = audioUrlsRef.current.get(messageId);

      if (existing && storedUrl === audioUrl) {
        return existing;
      }

      if (existing) {
        existing.src = audioUrl;
        audioUrlsRef.current.set(messageId, audioUrl);
        return existing;
      }

      const audio = new Audio(audioUrl);
      audio.preload = "metadata";
      audioUrlsRef.current.set(messageId, audioUrl);

      audio.addEventListener("ended", () => {
        syncProgress(messageId, audio);
        if (currentlyPlayingIdRef.current === messageId) {
          currentlyPlayingIdRef.current = null;
          setCurrentlyPlayingId(null);
          stopProgressLoop();
        }
      });

      audio.addEventListener("loadedmetadata", () => {
        syncProgress(messageId, audio);
      });

      audioElementsRef.current.set(messageId, audio);
      return audio;
    },
    [stopProgressLoop, syncProgress]
  );

  useEffect(() => {
    const audioElements = audioElementsRef.current;

    return () => {
      stopProgressLoop();
      audioElements.forEach((audio) => {
        audio.pause();
      });
      audioElements.clear();
      audioUrlsRef.current.clear();
    };
  }, [stopProgressLoop]);

  const togglePlayback = useCallback(
    (messageId: string, audioUrl: string) => {
      const audio = getOrCreateAudio(messageId, audioUrl);
      const activeMessageId = currentlyPlayingIdRef.current;

      if (activeMessageId === messageId && !audio.paused) {
        pauseMessage(messageId);
        return;
      }

      if (activeMessageId && activeMessageId !== messageId) {
        pauseMessage(activeMessageId);
      }

      currentlyPlayingIdRef.current = messageId;
      setCurrentlyPlayingId(messageId);

      void audio.play().then(() => {
        startProgressLoop(messageId, audio);
      }).catch(() => {
        if (currentlyPlayingIdRef.current === messageId) {
          currentlyPlayingIdRef.current = null;
          setCurrentlyPlayingId(null);
        }
        stopProgressLoop();
      });
    },
    [getOrCreateAudio, pauseMessage, startProgressLoop, stopProgressLoop]
  );

  const value = useMemo<VoicePlaybackContextValue>(
    () => ({
      currentlyPlayingId,
      togglePlayback,
      getProgress: (messageId) => progressById[messageId] ?? 0,
      getElapsedSeconds: (messageId) => elapsedById[messageId] ?? 0,
      isPlaying: (messageId) => {
        const audio = audioElementsRef.current.get(messageId);
        return (
          currentlyPlayingId === messageId &&
          Boolean(audio && !audio.paused)
        );
      },
    }),
    [currentlyPlayingId, elapsedById, progressById, togglePlayback]
  );

  return (
    <VoicePlaybackContext.Provider value={value}>
      {children}
    </VoicePlaybackContext.Provider>
  );
}

export function useVoicePlayback() {
  const context = useContext(VoicePlaybackContext);
  if (!context) {
    throw new Error("useVoicePlayback must be used within VoicePlaybackProvider");
  }

  return context;
}

"use client";

import { Lock, Mic, Send, Square, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  MAX_VOICE_MESSAGE_DURATION_SECONDS,
  formatVoiceDuration,
} from "@/lib/validations/audio";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  disabled?: boolean;
  onComplete: (blob: Blob, durationSeconds: number) => void;
  onError: (message: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
}

type RecorderMode = "idle" | "recording" | "locked";

const SLIDE_CANCEL_THRESHOLD_PX = 80;
const LOCK_THRESHOLD_PX = 80;

function getSupportedMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];

  for (const candidate of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return "";
}

export function VoiceRecorder({
  disabled = false,
  onComplete,
  onError,
  onRecordingChange,
}: VoiceRecorderProps) {
  const [mode, setMode] = useState<RecorderMode>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [slideOffsetX, setSlideOffsetX] = useState(0);
  const [slideOffsetY, setSlideOffsetY] = useState(0);
  const [isCancelArmed, setIsCancelArmed] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(16).fill(0.2));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const shouldSendRef = useRef(true);
  const slideOffsetXRef = useRef(0);
  const isCancelArmedRef = useRef(false);

  const cleanupMedia = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    mediaRecorderRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    chunksRef.current = [];
  }, []);

  const resetUi = useCallback(() => {
    setMode("idle");
    setElapsedSeconds(0);
    setSlideOffsetX(0);
    setSlideOffsetY(0);
    setIsCancelArmed(false);
    setLevels(Array(16).fill(0.2));
    onRecordingChange?.(false);
  }, [onRecordingChange]);

  const stopRecording = useCallback(
    (shouldSend: boolean) => {
      shouldSendRef.current = shouldSend;
      const recorder = mediaRecorderRef.current;

      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
        return;
      }

      cleanupMedia();
      resetUi();
    },
    [cleanupMedia, resetUi]
  );

  const finalizeRecording = useCallback(
    (blob: Blob, durationSeconds: number) => {
      cleanupMedia();
      resetUi();

      if (!shouldSendRef.current) {
        return;
      }

      onComplete(blob, durationSeconds);
    },
    [cleanupMedia, onComplete, resetUi]
  );

  const startAnalyserLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) {
      return;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const nextLevels = Array.from({ length: 16 }, (_, index) => {
        const sampleIndex = Math.floor((index / 16) * data.length);
        const value = data[sampleIndex] ?? 0;
        return Math.max(0.12, value / 255);
      });
      setLevels(nextLevels);
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const startRecording = useCallback(async () => {
    if (disabled || mode !== "idle") {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError("Voice recording is not supported in this browser");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = chunksRef.current;
        const blobType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: blobType });
        const durationSeconds = Math.max(
          1,
          Math.round((Date.now() - startTimeRef.current) / 1000)
        );
        finalizeRecording(blob, durationSeconds);
      };

      recorder.onerror = () => {
        cleanupMedia();
        resetUi();
        onError("Failed to record voice message");
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      startTimeRef.current = Date.now();
      setMode("recording");
      onRecordingChange?.(true);
      setElapsedSeconds(0);
      shouldSendRef.current = true;
      startAnalyserLoop();

      timerRef.current = setInterval(() => {
        const nextElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedSeconds(nextElapsed);

        if (nextElapsed >= MAX_VOICE_MESSAGE_DURATION_SECONDS) {
          stopRecording(true);
        }
      }, 250);
    } catch (error) {
      cleanupMedia();
      resetUi();

      const domError = error as DOMException;
      if (domError.name === "NotAllowedError" || domError.name === "PermissionDeniedError") {
        onError("Microphone access denied — enable it in browser settings");
        return;
      }

      onError("Failed to access microphone");
    }
  }, [
    cleanupMedia,
    disabled,
    finalizeRecording,
    mode,
    onError,
    onRecordingChange,
    resetUi,
    startAnalyserLoop,
    stopRecording,
  ]);

  useEffect(() => {
    if (mode !== "recording") {
      return;
    }

    function handleDocumentPointerMove(event: PointerEvent) {
      if (!pointerStartRef.current) {
        return;
      }

      const deltaX = event.clientX - pointerStartRef.current.x;
      const deltaY = pointerStartRef.current.y - event.clientY;
      const nextOffsetX = Math.min(0, deltaX);
      const nextCancelArmed = nextOffsetX <= -SLIDE_CANCEL_THRESHOLD_PX;
      slideOffsetXRef.current = nextOffsetX;
      isCancelArmedRef.current = nextCancelArmed;
      setSlideOffsetX(nextOffsetX);
      setSlideOffsetY(Math.max(0, deltaY));
      setIsCancelArmed(nextCancelArmed);

      if (deltaY >= LOCK_THRESHOLD_PX) {
        setMode("locked");
        onRecordingChange?.(true);
        pointerStartRef.current = null;
        setSlideOffsetX(0);
        setSlideOffsetY(0);
        setIsCancelArmed(false);
      }
    }

    function handleDocumentPointerUp() {
      if (mode !== "recording") {
        return;
      }

      pointerStartRef.current = null;
      const shouldCancel =
        isCancelArmedRef.current ||
        slideOffsetXRef.current <= -SLIDE_CANCEL_THRESHOLD_PX;
      slideOffsetXRef.current = 0;
      isCancelArmedRef.current = false;
      setSlideOffsetX(0);
      setSlideOffsetY(0);
      setIsCancelArmed(false);
      stopRecording(!shouldCancel);
    }

    document.addEventListener("pointermove", handleDocumentPointerMove);
    document.addEventListener("pointerup", handleDocumentPointerUp);
    document.addEventListener("pointercancel", handleDocumentPointerUp);

    return () => {
      document.removeEventListener("pointermove", handleDocumentPointerMove);
      document.removeEventListener("pointerup", handleDocumentPointerUp);
      document.removeEventListener("pointercancel", handleDocumentPointerUp);
    };
  }, [mode, onRecordingChange, stopRecording]);

  useEffect(() => {
    return () => {
      stopRecording(false);
    };
  }, [stopRecording]);

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled || mode !== "idle") {
      return;
    }

    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    void startRecording();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (mode !== "recording" || !pointerStartRef.current) {
      return;
    }

    const deltaX = event.clientX - pointerStartRef.current.x;
    const deltaY = pointerStartRef.current.y - event.clientY;
    const nextOffsetX = Math.min(0, deltaX);
    const nextCancelArmed = nextOffsetX <= -SLIDE_CANCEL_THRESHOLD_PX;
    slideOffsetXRef.current = nextOffsetX;
    isCancelArmedRef.current = nextCancelArmed;
    setSlideOffsetX(nextOffsetX);
    setSlideOffsetY(Math.max(0, deltaY));
    setIsCancelArmed(nextCancelArmed);

    if (deltaY >= LOCK_THRESHOLD_PX) {
      setMode("locked");
      onRecordingChange?.(true);
      pointerStartRef.current = null;
      setSlideOffsetX(0);
      setSlideOffsetY(0);
      setIsCancelArmed(false);
    }
  }

  function handlePointerUp() {
    if (mode !== "recording") {
      return;
    }

    pointerStartRef.current = null;
    const shouldCancel =
      isCancelArmedRef.current ||
      slideOffsetXRef.current <= -SLIDE_CANCEL_THRESHOLD_PX;
    slideOffsetXRef.current = 0;
    isCancelArmedRef.current = false;
    setSlideOffsetX(0);
    setSlideOffsetY(0);
    setIsCancelArmed(false);
    stopRecording(!shouldCancel);
  }

  if (mode === "recording" || mode === "locked") {
    return (
      <div className="flex min-w-0 w-full items-center gap-2">
        <div
          className={cn(
            "flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border px-2.5 py-2 transition-transform sm:gap-3 sm:px-3",
            isCancelArmed
              ? "border-destructive/50 bg-destructive/5"
              : "border-border/70 bg-surface-1/50"
          )}
          style={
            mode === "recording"
              ? { transform: `translate(${slideOffsetX}px, ${-slideOffsetY}px)` }
              : undefined
          }
        >
          <span className="relative flex size-2.5 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
          </span>

          <div className="flex min-w-0 flex-1 items-end gap-0.5">
            {levels.map((level, index) => (
              <span
                key={index}
                className="w-0.5 rounded-full bg-accent transition-[height] duration-75"
                style={{ height: `${Math.max(4, level * 20)}px` }}
              />
            ))}
          </div>

          <span className="shrink-0 text-xs tabular-nums text-text-secondary">
            {formatVoiceDuration(elapsedSeconds)}
          </span>

          {mode === "recording" ? (
            <span
              className={cn(
                "hidden shrink-0 text-[11px] sm:inline",
                isCancelArmed ? "text-destructive" : "text-text-muted"
              )}
            >
              {isCancelArmed ? "Release to cancel" : "Slide to cancel"}
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-text-muted">
              <Lock className="size-3" strokeWidth={2} />
              <span className="hidden sm:inline">Locked</span>
            </span>
          )}
        </div>

        {mode === "locked" ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Discard recording"
              className="size-10 shrink-0 rounded-xl text-destructive"
              onClick={() => stopRecording(false)}
            >
              <Trash2 className="size-4" strokeWidth={2} />
            </Button>
            <Button
              type="button"
              size="icon"
              aria-label="Send voice message"
              className="size-10 shrink-0 rounded-xl"
              onClick={() => stopRecording(true)}
            >
              <Send className="size-4" strokeWidth={2} />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Stop recording"
            className="size-10 shrink-0 rounded-xl"
            onClick={() => stopRecording(true)}
          >
            <Square className="size-4" strokeWidth={2} />
          </Button>
        )}
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      disabled={disabled}
      aria-label="Record voice message"
      className="size-10 shrink-0 rounded-xl"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <Mic className="size-4" strokeWidth={2} />
    </Button>
  );
}

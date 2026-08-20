"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const AUTH_SUCCESS_BURST_CLEAR_MS = 2600;

export const AUTH_SUCCESS_BURST_COLORS = [
  "#ff6b9d",
  "#c06eff",
  "#ff9a5a",
  "#4ade80",
  "#ffb547",
  "#ffffff",
] as const;

export const AUTH_SUCCESS_BURST_CHARS = [
  "✦",
  "✧",
  "💜",
  "✨",
  "👋",
  "⭐",
  "🎉",
  "✓",
] as const;

interface SpawnConfettiOptions {
  count?: number;
  chars?: readonly string[];
  spread?: number;
}

export function spawnAuthSuccessConfetti(
  container: HTMLElement | null,
  options: SpawnConfettiOptions = {}
) {
  if (!container) {
    return;
  }

  const {
    count = 60,
    chars = AUTH_SUCCESS_BURST_CHARS,
    spread = 60,
  } = options;

  container.replaceChildren();

  const fragment = document.createDocumentFragment();

  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement("span");
    particle.className = "auth-success-confetti-particle";
    particle.textContent = chars[Math.floor(Math.random() * chars.length)];
    particle.style.color =
      AUTH_SUCCESS_BURST_COLORS[
        Math.floor(Math.random() * AUTH_SUCCESS_BURST_COLORS.length)
      ];
    particle.style.fontSize = `${14 + Math.random() * 18}px`;
    particle.style.animationDelay = `${Math.random() * 0.35}s`;
    particle.style.setProperty("--tx", `${(Math.random() * 2 - 1) * spread}vmin`);
    particle.style.setProperty("--ty", `${(Math.random() * 2 - 1) * spread}vmin`);
    particle.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
    fragment.appendChild(particle);
  }

  container.appendChild(fragment);

  window.setTimeout(() => {
    container.replaceChildren();
  }, AUTH_SUCCESS_BURST_CLEAR_MS);
}

interface UseAuthSuccessOverlayOptions {
  open: boolean;
  redirectMs: number;
  initialCountdown: number;
  onComplete: () => void;
  reduceMotion: boolean | null;
  confettiChars?: readonly string[];
  confettiCount?: number;
}

export function useAuthSuccessOverlay({
  open,
  redirectMs,
  initialCountdown,
  onComplete,
  reduceMotion,
  confettiChars,
  confettiCount,
}: UseAuthSuccessOverlayOptions) {
  const burstRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animated, setAnimated] = useState(false);
  const [countdown, setCountdown] = useState(initialCountdown);

  onCompleteRef.current = onComplete;

  useEffect(() => {
    setMounted(true);
  }, []);

  const startBurst = useCallback(() => {
    if (reduceMotion) {
      return;
    }

    spawnAuthSuccessConfetti(burstRef.current, {
      count: confettiCount,
      chars: confettiChars,
    });
  }, [confettiChars, confettiCount, reduceMotion]);

  useEffect(() => {
    if (!open) {
      setAnimated(false);
      setVisible(false);
      setCountdown(initialCountdown);
      burstRef.current?.replaceChildren();
      return;
    }

    setVisible(true);
    setCountdown(initialCountdown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let frameOne = 0;
    let frameTwo = 0;
    let burstTimer = 0;

    frameOne = window.requestAnimationFrame(() => {
      frameTwo = window.requestAnimationFrame(() => {
        setAnimated(true);
        burstTimer = window.setTimeout(startBurst, reduceMotion ? 0 : 16);
      });
    });

    const interval = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    const redirectTimer = window.setTimeout(() => {
      onCompleteRef.current();
    }, redirectMs);

    return () => {
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
      window.clearTimeout(burstTimer);
      window.clearInterval(interval);
      window.clearTimeout(redirectTimer);
      document.body.style.overflow = previousOverflow;
      burstRef.current?.replaceChildren();
    };
  }, [initialCountdown, open, redirectMs, reduceMotion, startBurst]);

  const countdownLabel = countdown > 0 ? String(countdown) : "now!";

  return {
    mounted,
    visible,
    animated,
    countdownLabel,
    burstRef,
  };
}

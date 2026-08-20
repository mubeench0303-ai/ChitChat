"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import {
  signupGradientBgClass,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
import { cn } from "@/lib/utils";

const reveal = (delay: number, reduceMotion: boolean | null) => ({
  initial: { opacity: 0, y: reduceMotion ? 0 : 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.65,
      delay,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
});

const LAST_SEEN_MESSAGES = [
  "Last login · 2 hours ago · Chrome · London",
  "Last login · yesterday · Safari · New York",
  "Last login · 3 days ago · Firefox · Tokyo",
  "Last login · just now · this device",
] as const;

const WELCOME_MESSAGES = [
  {
    id: "w1",
    who: "Alex · 2m ago",
    text: "Hey! Just saw your post 🔥",
    className: "left-[8%] top-[6%] lg:left-[2%]",
  },
  {
    id: "w2",
    who: "Priya · 5m ago",
    text: "Missed you in the group chat 💜",
    className: "bottom-[16%] right-[4%] lg:right-[-15%]",
    accent: true,
  },
  {
    id: "w3",
    who: "Marcus · now",
    text: "Typing…",
    className: "left-[14%] top-[56%] lg:left-[0%]",
  },
] as const;

const STATS = [
  { target: 12, label: "unread messages" },
  { target: 4, label: "active chats" },
  { target: 38, label: "friends online" },
] as const;

function useCountUp(target: number, enabled: boolean) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const start = performance.now();
    const duration = 1800;
    let frame = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        setValue(target);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [enabled, target]);

  return value;
}

function AnimatedStat({
  target,
  label,
  enabled,
  delay,
  reduceMotion,
}: {
  target: number;
  label: string;
  enabled: boolean;
  delay: number;
  reduceMotion: boolean | null;
}) {
  const value = useCountUp(target, enabled);

  return (
    <motion.div {...reveal(delay, reduceMotion)} className="flex flex-col items-center gap-0.1">
      <span className="text-xl font-bold tracking-tight text-text-primary sm:text-[26px]">
        {value}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted sm:text-xs">
        {label}
      </span>
    </motion.div>
  );
}

function PortalScene({ avatarInitial }: { avatarInitial: string }) {
  return (
    <div className="relative flex h-[300px] items-center justify-center lg:h-[360px]">
      {WELCOME_MESSAGES.map((message, index) => (
        <motion.div
          key={message.id}
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 0.92, y: 0, scale: 1 }}
          transition={{
            duration: 0.6,
            delay: 1.3 + index * 0.4,
            ease: [0.2, 1.4, 0.4, 1],
          }}
          className={cn(
            "absolute hidden max-w-[240px] rounded-[14px] border border-border/70 bg-surface-1/80 px-4 py-3 shadow-lg backdrop-blur-md lg:block",
            message.className
          )}
        >
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-text-muted">
            <span className="size-1.5 rounded-full bg-accent" />
            {message.who}
          </p>
          <p
            className={cn(
              "text-[13px] leading-relaxed text-text-primary",
              "accent" in message && message.accent && "text-accent"
            )}
          >
            {message.text}
          </p>
        </motion.div>
      ))}

      <div className="relative grid size-[250px] place-items-center sm:size-[260px]">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            aria-hidden
            className={cn(
              "absolute inset-0 rounded-full border-[1.5px]",
              index === 0 && "border-accent/30",
              index === 1 && "inset-3 border-dashed border-accent/20",
              index === 2 && "inset-6 border-[#ff6b9d]/25"
            )}
            animate={{ rotate: 360 }}
            transition={{
              duration: index === 0 ? 18 : index === 1 ? 12 : 24,
              repeat: Infinity,
              ease: "linear",
              repeatType: index === 1 ? "reverse" : "loop",
            }}
          />
        ))}

        <motion.span
          aria-hidden
          className="absolute inset-10 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_40%,transparent)_0%,color-mix(in_srgb,var(--accent)_15%,transparent)_40%,transparent_70%)] blur-md"
          animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        {Array.from({ length: 8 }).map((_, index) => (
          <motion.span
            key={index}
            aria-hidden
            className="absolute top-8 h-[72px] w-0.5 origin-bottom rounded-full bg-[linear-gradient(180deg,var(--accent),transparent)] opacity-50"
            style={{ transform: `rotate(${index * 45}deg)` }}
            animate={{ height: [48, 82, 48], opacity: [0.2, 0.8, 0.2] }}
            transition={{
              duration: 2.8,
              delay: index * 0.4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}

        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className={cn(
            "relative z-[3] grid size-[100px] place-items-center rounded-full text-[38px] font-bold text-white shadow-[0_10px_40px_color-mix(in_srgb,var(--accent)_45%,transparent)] sm:size-[104px] sm:text-[40px]",
            signupGradientBgClass
          )}
        >
          {avatarInitial}
          <span className="absolute bottom-0.5 right-0.5 size-[18px] rounded-full border-[3px] border-surface-1 bg-success shadow-[0_0_8px_var(--success)]" />
        </motion.div>
      </div>
    </div>
  );
}

interface LoginSceneProps {
  email?: string;
}

export function LoginScene({ email = "" }: LoginSceneProps) {
  const reduceMotion = useReducedMotion();
  const statsRef = useRef<HTMLDivElement>(null);
  const [statsVisible, setStatsVisible] = useState(false);
  const [lastSeenIndex, setLastSeenIndex] = useState(0);

  const avatarInitial =
    email.trim().match(/^([a-zA-Z])/)?.[1]?.toUpperCase() ?? "J";

  useEffect(() => {
    const node = statsRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLastSeenIndex((current) => (current + 1) % LAST_SEEN_MESSAGES.length);
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <motion.aside
      initial={{ opacity: 0, x: reduceMotion ? 0 : -28 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col border-b border-border/70 px-5 py-7 lg:min-h-dvh lg:border-b-0 lg:border-r lg:px-6 lg:py-8 xl:px-10 xl:py-11"
    >
      <motion.div {...reveal(0.08, reduceMotion)} className="mx-auto w-full max-w-[560px]">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 font-semibold tracking-[-0.04em] text-text-primary no-underline"
        >
          <motion.span
            aria-hidden
            className={cn(
              "grid size-8 place-items-center rounded-[10px] text-sm text-white shadow-[0_8px_24px_color-mix(in_srgb,var(--accent)_32%,transparent)]",
              signupGradientBgClass
            )}
            animate={{ rotate: 360 }}
            transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
          >
            ✦
          </motion.span>
          <span className="text-[19px]">chitchat</span>
        </Link>
      </motion.div>

      <div className="mx-auto w-full max-w-[560px] py-4 lg:my-auto lg:py-8 xl:py-12">
        <motion.span
          {...reveal(0.16, reduceMotion)}
          className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-subtle px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-accent"
        >
          <i className={cn("block h-0.5 w-4 rounded-full", signupGradientBgClass)} />
          Welcome back
        </motion.span>

        <motion.h1
          {...reveal(0.24, reduceMotion)}
          className="mt-7 text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[0.97] tracking-[-0.04em] text-text-primary"
        >
          Your happy
          <br />
          <em className={cn("not-italic", signupGradientTextClass)}>
            place awaits.
          </em>
        </motion.h1>

        <motion.p
          {...reveal(0.32, reduceMotion)}
          className="mt-5 max-w-[41ch] text-[15px] leading-relaxed text-text-secondary sm:text-base"
        >
          Pick up right where you left off. Your circle is online, your
          conversations are waiting, and a new message just arrived.
        </motion.p>

        <div className="mt-8 w-full sm:mt-10">
          <motion.div {...reveal(0.44, reduceMotion)}>
            <PortalScene avatarInitial={avatarInitial} />
          </motion.div>

          <motion.div
            {...reveal(0.52, reduceMotion)}
            className="mt-1 inline-flex items-center gap-2.5 rounded-xl border border-border/70 bg-surface-1/70 px-4 py-3 font-mono text-[12.5px] tracking-wide text-text-muted sm:text-[13px]"
          >
            <span className="size-2 animate-pulse rounded-full bg-success shadow-[0_0_8px_var(--success)]" />
            <motion.span
              key={lastSeenIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {LAST_SEEN_MESSAGES[lastSeenIndex]}
            </motion.span>
          </motion.div>

          <div ref={statsRef} className="mt-5 flex flex-wrap gap-6 lg:gap-8.5">
            {STATS.map((stat, index) => (
              <AnimatedStat
                key={stat.label}
                target={stat.target}
                label={stat.label}
                enabled={statsVisible}
                delay={0.58 + index * 0.08}
                reduceMotion={reduceMotion}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.aside>
  );
}

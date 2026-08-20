"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Globe2, MessageCircle, Users } from "lucide-react";

import {
  signupGradientBgClass,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
import { cn } from "@/lib/utils";

type ChatMessage =
  | { type: "sys"; text: string; delay: number }
  | { type: "in"; text: string; delay: number }
  | { type: "out"; text: string; delay: number }
  | { type: "typing"; delay: number };

const CHAT_SCRIPT: ChatMessage[] = [
  { type: "sys", text: "— a new conversation begins —", delay: 1200 },
  { type: "in", text: "Hey! Welcome to chitchat 👋", delay: 900 },
  { type: "in", text: "We're glad you found us.", delay: 1400 },
  { type: "typing", delay: 1200 },
  { type: "in", text: "Who's joining today?", delay: 900 },
  { type: "typing", delay: 1100 },
  { type: "out", text: "It's me! Signing up now ✨", delay: 1000 },
  { type: "in", text: "Perfect timing. Your circle is waiting 💜", delay: 1500 },
];

const STATS = [
  { icon: Users, target: 48210, label: "members" },
  { icon: MessageCircle, target: 2_140_000, label: "messages today" },
  { icon: Globe2, target: 127, label: "countries" },
] as const;

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

function formatStatValue(value: number, target: number) {
  if (target >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  }
  return value.toLocaleString();
}

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
  icon: Icon,
  target,
  label,
  enabled,
  delay,
  reduceMotion,
}: {
  icon: typeof Users;
  target: number;
  label: string;
  enabled: boolean;
  delay: number;
  reduceMotion: boolean | null;
}) {
  const value = useCountUp(target, enabled);

  return (
    <motion.div {...reveal(delay, reduceMotion)}>
      <span className="flex items-center gap-1.5 text-xl font-bold tracking-tight text-text-primary sm:text-[26px]">
        <Icon className="size-5 text-accent" strokeWidth={2} />
        {formatStatValue(value, target)}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted sm:text-xs">
        {label}
      </span>
    </motion.div>
  );
}

function AnimatedChatPanel({ reduceMotion }: { reduceMotion: boolean | null }) {
  const [messages, setMessages] = useState<
    Array<{ id: string; type: ChatMessage["type"]; text?: string }>
  >([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let elapsed = 0;
    const timers: number[] = [];

    CHAT_SCRIPT.forEach((entry, index) => {
      elapsed += entry.delay;
      timers.push(
        window.setTimeout(() => {
          setMessages((current) => {
            const withoutTyping = current.filter(
              (item) => item.type !== "typing"
            );
            const next = [...withoutTyping];

            if (entry.type === "typing") {
              next.push({ id: `typing-${index}`, type: "typing" });
            } else {
              next.push({
                id: `msg-${index}`,
                type: entry.type,
                text: entry.text,
              });
            }

            return next;
          });
        }, elapsed)
      );
    });

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  return (
    <motion.div
      {...reveal(0.44, reduceMotion)}
      className="rounded-[22px] border border-border/75 bg-surface-1/55 p-5 shadow-[0_35px_70px_-35px_rgba(0,0,0,.45)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-3 border-b border-dashed border-border pb-3.5">
        <span
          className={cn(
            "relative grid size-9 place-items-center rounded-full text-sm font-bold text-white",
            signupGradientBgClass
          )}
        >
          Y
          <i className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface-1 bg-emerald-500" />
        </span>
        <span>
          <strong className="block text-sm">Your future friends</strong>
          <small className="text-xs text-text-secondary">● online now</small>
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex min-h-48 max-h-48 flex-col gap-2.5 overflow-hidden py-4 text-sm sm:text-[14px]"
      >
        {messages.map((message) => {
          if (message.type === "typing") {
            return (
              <span
                key={message.id}
                className="flex w-fit gap-1 rounded-2xl rounded-bl-md bg-surface-2 px-3 py-3"
              >
                <i className="size-1.5 animate-bounce rounded-full bg-text-muted" />
                <i className="size-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:150ms]" />
                <i className="size-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:300ms]" />
              </span>
            );
          }

          if (message.type === "sys") {
            return (
              <span
                key={message.id}
                className="self-center text-[10px] text-text-muted"
              >
                {message.text}
              </span>
            );
          }

          return (
            <span
              key={message.id}
              className={cn(
                "max-w-[80%] rounded-2xl px-3 py-2.5",
                message.type === "in"
                  ? "rounded-bl-md bg-surface-2"
                  : "self-end rounded-br-md text-white",
                message.type === "out" && signupGradientBgClass
              )}
            >
              {message.text}
            </span>
          );
        })}
      </div>
    </motion.div>
  );
}

export function SignupScene() {
  const reduceMotion = useReducedMotion();
  const statsRef = useRef<HTMLDivElement>(null);
  const [statsVisible, setStatsVisible] = useState(false);

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

  return (
    <motion.aside
      initial={{ opacity: 0, x: reduceMotion ? 0 : -28 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
      className="hidden min-h-dvh flex-col border-r border-border/70 px-6 py-8 lg:flex xl:px-10 xl:py-11"
    >
      <motion.div {...reveal(0.08, reduceMotion)} className="mx-auto w-full max-w-[560px]">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 self-start font-semibold tracking-[-0.04em] text-text-primary no-underline"
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

      <div className="my-auto mx-auto w-full max-w-[560px] py-8 xl:py-12">
        <motion.span
          {...reveal(0.16, reduceMotion)}
          className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-subtle px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-accent"
        >
          <i
            className={cn("block h-0.5 w-4 rounded-full", signupGradientBgClass)}
          />
          Let&apos;s get started
        </motion.span>

        <motion.h1
          {...reveal(0.24, reduceMotion)}
          className="mt-7 text-[clamp(2.5rem,4.4vw,3.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-text-primary"
        >
          Create your
          <br />
          <em className={cn("not-italic", signupGradientTextClass)}>
            happy place.
          </em>
        </motion.h1>

        <motion.p
          {...reveal(0.32, reduceMotion)}
          className="mt-5 max-w-[41ch] text-[15px] leading-relaxed text-text-secondary sm:text-base"
        >
          Join thousands of people making every conversation count. Find your
          circle, share your world, keep the chat alive.
        </motion.p>

        <div className="mt-8 w-full pl-4 sm:mt-10 sm:pl-8 md:pl-12 lg:pl-14">
          <AnimatedChatPanel reduceMotion={reduceMotion} />

          <div ref={statsRef} className="mt-8 flex flex-wrap gap-8 sm:gap-10">
            {STATS.map((stat, index) => (
              <AnimatedStat
                key={stat.label}
                icon={stat.icon}
                target={stat.target}
                label={stat.label}
                enabled={statsVisible}
                delay={0.52 + index * 0.08}
                reduceMotion={reduceMotion}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.aside>
  );
}

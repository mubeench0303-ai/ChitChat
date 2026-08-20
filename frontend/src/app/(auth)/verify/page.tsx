"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Mail } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import {
  SignupSubmitButton,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
import {
  VerifyOtpInput,
  type VerifyOtpInputHandle,
  type VerifyOtpPhase,
  useVerifyOtpPaste,
} from "@/components/auth/verify-otp-input";
import { VerifyResendSection } from "@/components/auth/verify-resend-section";
import { VerifyScene } from "@/components/auth/verify-scene";
import {
  VerifyStatusBanner,
  type VerifyStatusMessage,
} from "@/components/auth/verify-status-message";
import { VerifyStepper } from "@/components/auth/verify-stepper";
import { VerifySuccessOverlay } from "@/components/auth/verify-success-overlay";
import { resendCode, verifyEmail } from "@/lib/api/auth";
import { cn } from "@/lib/utils";

const AUTO_SUBMIT_DELAY_MS = 400;
const MIN_VERIFY_MS = 1600;
const ERROR_RESET_MS = 1400;
const SUCCESS_CASCADE_STEP_MS = 90;

const fadeUp = (delay = 0, reduceMotion: boolean | null = false) => ({
  hidden: { opacity: 0, y: reduceMotion ? 0 : 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] as const },
  },
});

function VerifyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const email = searchParams.get("email")?.trim() ?? "";
  const otpRef = useRef<VerifyOtpInputHandle>(null);
  const verifyBusyRef = useRef(false);
  const autoSubmitTimerRef = useRef<number | null>(null);

  const [code, setCode] = useState("");
  const [otpPhase, setOtpPhase] = useState<VerifyOtpPhase>("idle");
  const [successCount, setSuccessCount] = useState(0);
  const [status, setStatus] = useState<VerifyStatusMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendSending, setResendSending] = useState(false);
  const [resendResetKey, setResendResetKey] = useState(0);
  const [stepperStep, setStepperStep] = useState<1 | 2 | 3>(2);
  const [successOpen, setSuccessOpen] = useState(false);

  const displayName =
    email.split("@")[0]?.replace(/^./, (char) => char.toUpperCase()) || "friend";

  const codeDigits = Array.from({ length: 6 }, (_, index) => code[index] ?? "");

  const runVerify = useCallback(
    async (nextCode: string) => {
      if (verifyBusyRef.current || nextCode.length !== 6 || !email) {
        return;
      }

      verifyBusyRef.current = true;
      setIsSubmitting(true);
      setOtpPhase("verifying");
      setStatus(null);
      setSuccessCount(0);

      const startedAt = Date.now();

      try {
        await verifyEmail({ email, code: nextCode });

        const remaining = MIN_VERIFY_MS - (Date.now() - startedAt);
        if (remaining > 0) {
          await new Promise((resolve) => setTimeout(resolve, remaining));
        }

        for (let index = 1; index <= 6; index++) {
          setSuccessCount(index);
          await new Promise((resolve) =>
            setTimeout(resolve, SUCCESS_CASCADE_STEP_MS)
          );
        }

        setOtpPhase("success");
        setStatus({
          type: "success",
          text: "Code verified! Preparing your account…",
        });

        await new Promise((resolve) => setTimeout(resolve, 800));

        setStepperStep(3);
        setSuccessOpen(true);
      } catch {
        const remaining = MIN_VERIFY_MS - (Date.now() - startedAt);
        if (remaining > 0) {
          await new Promise((resolve) => setTimeout(resolve, remaining));
        }

        setOtpPhase("error");
        setStatus({
          type: "error",
          text: "Invalid code. Please try again.",
        });

        await new Promise((resolve) => setTimeout(resolve, ERROR_RESET_MS));

        setCode("");
        setOtpPhase("idle");
        setSuccessCount(0);
        setStatus(null);
        verifyBusyRef.current = false;
        setIsSubmitting(false);
        otpRef.current?.focus();
      }
    },
    [email]
  );

  const scheduleAutoVerify = useCallback(
    (nextCode: string) => {
      if (verifyBusyRef.current || nextCode.length !== 6) {
        return;
      }

      if (autoSubmitTimerRef.current) {
        window.clearTimeout(autoSubmitTimerRef.current);
      }

      autoSubmitTimerRef.current = window.setTimeout(() => {
        void runVerify(nextCode);
      }, AUTO_SUBMIT_DELAY_MS);
    },
    [runVerify]
  );

  useVerifyOtpPaste(
    useCallback(
      (pasted) => {
        setCode(pasted);
        if (pasted.length === 6) {
          scheduleAutoVerify(pasted);
        }
      },
      [scheduleAutoVerify]
    ),
    otpPhase === "idle" && !verifyBusyRef.current
  );

  useEffect(() => {
    return () => {
      if (autoSubmitTimerRef.current) {
        window.clearTimeout(autoSubmitTimerRef.current);
      }
    };
  }, []);

  async function handleResend() {
    if (!email || resendSending) {
      return;
    }

    setResendSending(true);

    try {
      await resendCode(email);
      setStatus({ type: "info", text: `New code sent to ${email}` });
      window.setTimeout(() => setStatus(null), 3200);
      setCode("");
      setOtpPhase("idle");
      setSuccessCount(0);
      setResendResetKey((current) => current + 1);
      otpRef.current?.focus();
    } catch (error) {
      setStatus({
        type: "error",
        text:
          error instanceof Error ? error.message : "Failed to resend code",
      });
    } finally {
      setResendSending(false);
    }
  }

  const handleSuccessContinue = useCallback(() => {
    router.push("/login?verified=true");
  }, [router]);

  if (!email) {
    return (
      <motion.div
        initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid w-full max-w-[1320px] overflow-hidden rounded-[30px] border border-border/70 bg-surface-1/35 lg:grid-cols-[1.15fr_1fr]"
      >
        <div className="flex items-center justify-center p-8 lg:col-span-2">
          <AuthCard className="max-w-md border-0 bg-transparent shadow-none">
            <h1 className="text-2xl font-semibold text-text-primary">
              Missing email
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              Start from sign up so we know where to send your verification
              code.
            </p>
            <Link
              href="/signup"
              className={cn(
                "mt-6 inline-flex font-bold no-underline",
                signupGradientTextClass
              )}
            >
              Back to sign up →
            </Link>
          </AuthCard>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <VerifySuccessOverlay
        open={successOpen}
        displayName={displayName}
        onContinue={handleSuccessContinue}
      />

      <motion.div
        initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="grid w-full max-w-[1320px] overflow-hidden rounded-[30px] border border-border/70 bg-surface-1/35 lg:grid-cols-[1.15fr_1fr]"
      >
        <VerifyScene codeDigits={codeDigits} />

        <div className="flex items-center justify-center p-3 sm:p-6 lg:p-10">
          <AuthCard
            aria-labelledby="verify-title"
            className="max-w-[500px] border-0 bg-transparent shadow-none"
          >
            <VerifyStepper activeStep={stepperStep} />

            <motion.div
              variants={fadeUp(0.12, reduceMotion)}
              initial="hidden"
              animate="visible"
              className="mb-6"
            >
              <h1
                id="verify-title"
                className="text-[clamp(1.35rem,4vw,1.65rem)] font-bold tracking-[-0.02em] text-text-primary"
              >
                Enter the code{" "}
                <span aria-hidden className="inline-block animate-[wave_2.4s_ease-in-out_infinite]">
                  ✉️
                </span>
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                We sent a 6-digit code to{" "}
                <strong className="font-semibold text-text-primary">
                  {email}
                </strong>
                . It expires in 10 minutes.
              </p>
            </motion.div>

            <motion.div
              variants={fadeUp(0.18, reduceMotion)}
              initial="hidden"
              animate="visible"
              className="mb-5 flex items-center gap-2.5 rounded-xl border border-border/70 bg-surface-1/70 px-4 py-3 transition-colors hover:border-accent/30"
            >
              <Mail className="size-5 shrink-0 text-accent" strokeWidth={2} />
              <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-text-primary">
                {email}
              </span>
              <Link
                href="/signup"
                onClick={() =>
                  setStatus({ type: "info", text: "Redirecting back to sign up…" })
                }
                className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent no-underline transition-colors hover:bg-accent-subtle"
              >
                Edit
              </Link>
            </motion.div>

            <motion.div
              variants={fadeUp(0.24, reduceMotion)}
              initial="hidden"
              animate="visible"
              className="mb-2"
            >
              <VerifyOtpInput
                ref={otpRef}
                value={code}
                onChange={(next) => {
                  setCode(next);
                  if (next.length === 6 && otpPhase === "idle") {
                    scheduleAutoVerify(next);
                  }
                }}
                disabled={isSubmitting || otpPhase === "success" || successOpen}
                phase={otpPhase}
                successCount={successCount}
              />
            </motion.div>

            <VerifyStatusBanner status={status} />

            <motion.div
              variants={fadeUp(0.28, reduceMotion)}
              initial="hidden"
              animate="visible"
            >
              <SignupSubmitButton
                type="button"
                disabled={code.length !== 6 || isSubmitting || successOpen}
                loading={isSubmitting}
                onClick={() => runVerify(code)}
              >
                Verify &amp; continue
              </SignupSubmitButton>
            </motion.div>

            <VerifyResendSection
              disabled={!email || resendSending || successOpen}
              sending={resendSending}
              onResend={handleResend}
              resetKey={resendResetKey}
            />

            <motion.p
              variants={fadeUp(0.36, reduceMotion)}
              initial="hidden"
              animate="visible"
              className="mt-6 text-center text-[13px] text-text-muted"
            >
              <Link
                href="/signup"
                className={cn(
                  "inline-flex items-center gap-1 font-bold no-underline transition-opacity hover:opacity-80",
                  signupGradientTextClass
                )}
              >
                <span aria-hidden>←</span> Back to sign up
              </Link>
            </motion.p>
          </AuthCard>
        </div>
      </motion.div>
    </>
  );
}

function VerifyPageFallback() {
  return (
    <div className="grid w-full max-w-[1320px] overflow-hidden rounded-[30px] border border-border/70 bg-surface-1/35 lg:grid-cols-[1.15fr_1fr]">
      <div className="hidden min-h-[420px] bg-surface-2/30 lg:block" />
      <div className="flex items-center justify-center p-8">
        <div className="h-[420px] w-full max-w-[500px] animate-pulse rounded-[30px] bg-surface-2/40" />
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyPageFallback />}>
      <VerifyPageContent />
    </Suspense>
  );
}

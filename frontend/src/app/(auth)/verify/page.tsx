"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "framer-motion";
import { Hash, Mail } from "lucide-react";
import { toast } from "sonner";

import { AuthCard, fieldHintClassName } from "@/components/auth/auth-card";
import { SignupTextInput } from "@/components/auth/signup-field";
import {
  SignupSubmitButton,
  signupGradientBgClass,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { resendCode, verifyEmail } from "@/lib/api/auth";
import {
  verifyEmailSchema,
  type VerifyEmailFormData,
} from "@/lib/validations/auth";
import { cn } from "@/lib/utils";

const RESEND_RESET_MS = 30_000;
const SUCCESS_REDIRECT_DELAY_MS = 600;

const fadeUp = (delay = 0, reduceMotion: boolean | null = false) => ({
  hidden: { opacity: 0, y: reduceMotion ? 0 : 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] as const },
  },
});

type ResendState = "idle" | "sending" | "sent";

function VerifyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const emailFromQuery = searchParams.get("email")?.trim() ?? "";
  const resendResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [resendState, setResendState] = useState<ResendState>("idle");

  const form = useForm<VerifyEmailFormData>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: {
      email: emailFromQuery,
      code: "",
    },
  });

  const { isSubmitting } = form.formState;
  const email = form.watch("email");

  useEffect(() => {
    return () => {
      if (resendResetTimerRef.current) {
        clearTimeout(resendResetTimerRef.current);
      }
    };
  }, []);

  async function onSubmit(data: VerifyEmailFormData) {
    try {
      await verifyEmail({ email: data.email, code: data.code });
      toast.success("Email verified successfully.");
      await new Promise((resolve) =>
        setTimeout(resolve, SUCCESS_REDIRECT_DELAY_MS)
      );
      router.push("/login?verified=true");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    }
  }

  async function handleResend() {
    if (!email || resendState !== "idle") {
      return;
    }

    setResendState("sending");

    if (resendResetTimerRef.current) {
      clearTimeout(resendResetTimerRef.current);
      resendResetTimerRef.current = null;
    }

    try {
      await resendCode(email);
      setResendState("sent");
      toast.success("Code resent.");
      resendResetTimerRef.current = setTimeout(() => {
        setResendState("idle");
        resendResetTimerRef.current = null;
      }, RESEND_RESET_MS);
    } catch (error) {
      setResendState("idle");
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    }
  }

  const isResendDisabled = resendState === "sending" || resendState === "sent";

  return (
    <AuthCard aria-labelledby="verify-title">
      <Link
        href="/"
        className="inline-flex items-center gap-2.5 font-semibold tracking-[-0.04em] text-text-primary no-underline"
      >
        <span
          className={cn(
            "grid size-[29px] place-items-center rounded-[10px] text-sm text-white shadow-[0_5px_12px_color-mix(in_srgb,var(--accent)_30%,transparent)]",
            signupGradientBgClass
          )}
        >
          ✦
        </span>
        <span className="text-[19px] font-semibold">chitchat</span>
      </Link>

      <motion.div
        variants={fadeUp(0.12, reduceMotion)}
        initial="hidden"
        animate="visible"
        className="mb-6 mt-7"
      >
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[1.2px]">
          <i
            className={cn(
              "block h-0.5 w-[18px] rounded-full",
              signupGradientBgClass
            )}
          />
          <span className={signupGradientTextClass}>Almost there</span>
        </span>
        <h1
          id="verify-title"
          className="mt-2.5 text-[clamp(2rem,6vw,2.625rem)] font-semibold leading-[0.99] tracking-[-0.05em] text-text-primary"
        >
          Verify your
          <br />
          <em className={cn("not-italic", signupGradientTextClass)}>
            email address.
          </em>
        </h1>
        <p className="mt-2 max-w-[335px] text-[13px] leading-relaxed text-text-secondary">
          {email ? (
            <>
              We sent a 6-digit code to{" "}
              <span className="font-medium text-text-primary">{email}</span>.
            </>
          ) : (
            "Enter the 6-digit code we sent to your email."
          )}
        </p>
      </motion.div>

      <Form {...form}>
        <motion.form
          variants={fadeUp(0.2, reduceMotion)}
          initial="hidden"
          animate="visible"
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-0"
        >
          <input type="hidden" {...form.register("email")} />

          {email ? (
            <div className="mb-3.5">
              <label className="mb-[7px] ml-0.5 block text-[13px] font-bold text-text-secondary">
                Email
              </label>
              <SignupTextInput
                value={email}
                readOnly
                leadingIcon={<Mail className="size-4" strokeWidth={2} />}
                className="opacity-90"
                aria-readonly="true"
              />
            </div>
          ) : null}

          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem className="mb-5">
                <FormLabel className="mb-[7px] ml-0.5 block text-[13px] font-bold text-text-secondary">
                  Verification code
                </FormLabel>
                <FormControl>
                  <SignupTextInput
                    {...field}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    maxLength={6}
                    leadingIcon={<Hash className="size-4" strokeWidth={2} />}
                    className="tracking-[0.35em] [&_input]:font-mono [&_input]:placeholder:tracking-normal"
                    onChange={(event) => {
                      field.onChange(
                        event.target.value.replace(/\D/g, "").slice(0, 6)
                      );
                    }}
                  />
                </FormControl>
                <p className={fieldHintClassName}>
                  Enter the 6-digit code from your email
                </p>
                <FormMessage className="mt-1.5 text-xs text-danger" />
              </FormItem>
            )}
          />

          <SignupSubmitButton disabled={isSubmitting} loading={isSubmitting}>
            {isSubmitting ? "Verifying..." : "Verify Email"}
          </SignupSubmitButton>
        </motion.form>
      </Form>

      <motion.div
        variants={fadeUp(0.32, reduceMotion)}
        initial="hidden"
        animate="visible"
        className="mt-6 space-y-3 text-center text-[13px] text-text-muted"
      >
        <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
          <span>Didn&apos;t receive a code?</span>
          <button
            type="button"
            onClick={handleResend}
            disabled={isResendDisabled || !email}
            className={cn(
              "font-bold transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 hover:cursor-pointer",
              signupGradientTextClass
            )}
          >
            {resendState === "sending" ? "Sending..." : "Resend"}
          </button>
        </p>
        <p>
          Wrong email?{" "}
          <Link
            href="/signup"
            className={cn(
              "inline-flex items-center gap-0.5 font-bold no-underline transition-opacity hover:opacity-80",
              signupGradientTextClass
            )}
          >
            Sign up again
            <motion.span
              aria-hidden
              className="inline-block"
              whileHover={reduceMotion ? undefined : { x: 3 }}
            >
              →
            </motion.span>
          </Link>
        </p>
      </motion.div>
    </AuthCard>
  );
}

function VerifyPageFallback() {
  return (
    <AuthCard aria-labelledby="verify-title">
      <div className="mt-7 h-[420px] animate-pulse rounded-xl bg-surface-2/40" />
    </AuthCard>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyPageFallback />}>
      <VerifyPageContent />
    </Suspense>
  );
}

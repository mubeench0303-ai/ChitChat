"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "framer-motion";
import { Mail } from "lucide-react";

import { AuthCard, fieldHintClassName } from "@/components/auth/auth-card";
import { ResetScene } from "@/components/auth/reset-scene";
import { ResetStepper } from "@/components/auth/reset-stepper";
import {
  PasswordMatchHint,
  PasswordStrengthMeter,
} from "@/components/auth/signup-feedback";
import {
  SignupPasswordInput,
  type ValidationState,
} from "@/components/auth/signup-field";
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
import {
  VerifyStatusBanner,
  type VerifyStatusMessage,
} from "@/components/auth/verify-status-message";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { resetPassword, verifyResetCode } from "@/lib/api/auth";
import {
  resetPasswordSchema,
  type ResetPasswordFormData,
} from "@/lib/validations/auth";
import { cn } from "@/lib/utils";

const AUTO_VERIFY_DELAY_MS = 400;
const MIN_VERIFY_MS = 1600;
const ERROR_RESET_MS = 1400;
const SUCCESS_CASCADE_STEP_MS = 90;
const MIN_SUBMIT_MS = 1800;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const fadeUp = (delay = 0, reduceMotion: boolean | null = false) => ({
  hidden: { opacity: 0, y: reduceMotion ? 0 : 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] as const },
  },
});

function FieldShake({
  children,
  shake,
}: {
  children: React.ReactNode;
  shake: boolean;
}) {
  return (
    <motion.div
      animate={shake ? { x: [0, -7, 6, -4, 3, 0] } : { x: 0 }}
      transition={{ duration: 0.45 }}
    >
      {children}
    </motion.div>
  );
}

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const emailFromQuery = searchParams.get("email")?.trim() ?? "";
  const otpRef = useRef<VerifyOtpInputHandle>(null);
  const verifyBusyRef = useRef(false);
  const autoVerifyTimerRef = useRef<number | null>(null);

  const [submitAttempt, setSubmitAttempt] = useState(0);
  const [code, setCode] = useState("");
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);
  const [otpPhase, setOtpPhase] = useState<VerifyOtpPhase>("idle");
  const [successCount, setSuccessCount] = useState(0);
  const [status, setStatus] = useState<VerifyStatusMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const codeVerified = verifiedCode !== null && verifiedCode === code;

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: emailFromQuery,
      code: "",
      new_password: "",
      confirm_new_password: "",
    },
  });

  const { errors } = form.formState;
  const values = form.watch();

  useEffect(() => {
    if (emailFromQuery) {
      form.setValue("email", emailFromQuery);
    }
  }, [emailFromQuery, form]);

  useEffect(() => {
    form.setValue("code", code, { shouldValidate: submitAttempt > 0 });
  }, [code, form, submitAttempt]);

  const fieldStatus = (
    name: "new_password" | "confirm_new_password"
  ): ValidationState => {
    if (errors[name]) {
      return "invalid";
    }

    const value = values[name];
    if (!value) {
      return "idle";
    }

    if (name === "new_password") {
      return PASSWORD_PATTERN.test(value) ? "valid" : "idle";
    }

    return value === values.new_password ? "valid" : "invalid";
  };

  const shouldShake = (name: keyof ResetPasswordFormData) => {
    if (submitAttempt === 0) {
      return false;
    }

    return Boolean(errors[name]);
  };

  const onInvalid = () => setSubmitAttempt((attempt) => attempt + 1);

  const codeDigits = Array.from({ length: 6 }, (_, index) => code[index] ?? "");
  const email = values.email.trim() || emailFromQuery;

  const runVerifyCode = useCallback(
    async (nextCode: string) => {
      if (verifyBusyRef.current || nextCode.length !== 6 || !email) {
        return;
      }

      verifyBusyRef.current = true;
      setIsVerifyingCode(true);
      setOtpPhase("verifying");
      setStatus(null);
      setSuccessCount(0);
      setVerifiedCode(null);

      const startedAt = Date.now();

      try {
        await verifyResetCode({ email, code: nextCode });

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
        setVerifiedCode(nextCode);
        form.setValue("code", nextCode, { shouldValidate: true });
        form.clearErrors("code");
        setStatus({
          type: "success",
          text: "Code verified! Now set your new password.",
        });
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
        setIsVerifyingCode(false);
        otpRef.current?.focus();
        return;
      }

      verifyBusyRef.current = false;
      setIsVerifyingCode(false);
    },
    [email, form]
  );

  const scheduleAutoVerify = useCallback(
    (nextCode: string) => {
      if (
        verifyBusyRef.current ||
        nextCode.length !== 6 ||
        codeVerified ||
        otpPhase === "success"
      ) {
        return;
      }

      if (autoVerifyTimerRef.current) {
        window.clearTimeout(autoVerifyTimerRef.current);
      }

      autoVerifyTimerRef.current = window.setTimeout(() => {
        void runVerifyCode(nextCode);
      }, AUTO_VERIFY_DELAY_MS);
    },
    [codeVerified, otpPhase, runVerifyCode]
  );

  useVerifyOtpPaste(
    useCallback(
      (pasted) => {
        setCode(pasted);
        if (verifiedCode && pasted !== verifiedCode) {
          setVerifiedCode(null);
          setOtpPhase("idle");
          setSuccessCount(0);
        }
        if (pasted.length === 6 && otpPhase !== "success") {
          scheduleAutoVerify(pasted);
        }
      },
      [otpPhase, scheduleAutoVerify, verifiedCode]
    ),
    otpPhase === "idle" && !verifyBusyRef.current
  );

  useEffect(() => {
    return () => {
      if (autoVerifyTimerRef.current) {
        window.clearTimeout(autoVerifyTimerRef.current);
      }
    };
  }, []);

  function handleCodeChange(nextCode: string) {
    if (verifiedCode && nextCode !== verifiedCode) {
      setVerifiedCode(null);
      setOtpPhase("idle");
      setSuccessCount(0);
      setStatus(null);
    }

    setCode(nextCode);

    if (nextCode.length === 6 && otpPhase === "idle") {
      scheduleAutoVerify(nextCode);
    }
  }

  async function onSubmit(data: ResetPasswordFormData) {
    if (!codeVerified) {
      setStatus({
        type: "error",
        text: "Enter and verify the 6-digit code first.",
      });
      return;
    }

    setStatus(null);
    setIsSubmitting(true);

    const startedAt = Date.now();

    const waitForMinimumLoading = async () => {
      const remaining = MIN_SUBMIT_MS - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
    };

    try {
      await resetPassword({
        email: data.email,
        code: data.code,
        new_password: data.new_password,
      });
      await waitForMinimumLoading();
      router.push("/login?reset=true");
    } catch (error) {
      await waitForMinimumLoading();
      setStatus({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not reset password. Try again.",
      });
      onInvalid();
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!emailFromQuery) {
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
              Start from forgot password so we know where to send your reset
              code.
            </p>
            <Link
              href="/forgot-password"
              className={cn(
                "mt-6 inline-flex font-bold no-underline",
                signupGradientTextClass
              )}
            >
              Back to forgot password →
            </Link>
          </AuthCard>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="grid w-full max-w-[1320px] overflow-hidden rounded-[30px] border border-border/70 bg-surface-1/35 lg:grid-cols-[1.15fr_1fr]"
    >
      <ResetScene codeDigits={codeDigits} />

      <div className="flex items-center justify-center p-3 sm:p-6 lg:p-10">
        <AuthCard
          aria-labelledby="reset-password-title"
          className="max-w-[500px] border-0 bg-transparent shadow-none"
        >
          <ResetStepper activeStep={2} />

          <motion.div
            variants={fadeUp(0.12, reduceMotion)}
            initial="hidden"
            animate="visible"
            className="mb-6"
          >
            <h1
              id="reset-password-title"
              className="text-[clamp(1.35rem,4vw,1.65rem)] font-bold tracking-[-0.02em] text-text-primary"
            >
              Set a new password{" "}
              <span
                aria-hidden
                className="inline-block origin-[70%_70%] animate-[wave_2.4s_ease-in-out_infinite] text-[1.15em] leading-none"
              >
                🔐
              </span>
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary sm:text-[15px]">
              Enter the 6-digit code we sent to your email, then choose a strong
              new password.
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
              href="/forgot-password"
              className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent no-underline transition-colors hover:bg-accent-subtle"
            >
              Edit
            </Link>
          </motion.div>

          <Form {...form}>
            <motion.form
              variants={fadeUp(0.24, reduceMotion)}
              initial="hidden"
              animate="visible"
              onSubmit={(event) => {
                form.setValue("code", code, { shouldValidate: true });
                void form.handleSubmit(onSubmit, onInvalid)(event);
              }}
              className="space-y-0"
            >
              <input type="hidden" {...form.register("email")} />

              <motion.div variants={fadeUp(0.24, reduceMotion)} className="mb-4">
                <VerifyOtpInput
                  ref={otpRef}
                  value={code}
                  onChange={handleCodeChange}
                  disabled={isSubmitting || isVerifyingCode}
                  phase={otpPhase}
                  successCount={successCount}
                />
                {!status && !codeVerified ? (
                  <p className={cn(fieldHintClassName, "mt-2 text-center")}>
                    Enter the 6-digit code from your email
                  </p>
                ) : null}
              </motion.div>

              <VerifyStatusBanner status={status} />

              <div
                className={cn(
                  "space-y-0 transition-opacity duration-300",
                  !codeVerified && "pointer-events-none opacity-45"
                )}
              >
              <FormField
                control={form.control}
                name="new_password"
                render={({ field }) => (
                  <FieldShake shake={shouldShake("new_password")}>
                    <FormItem className="mb-3.5">
                      <FormControl>
                        <SignupPasswordInput
                          {...field}
                          floatingLabel="New password"
                          validationState={fieldStatus("new_password")}
                          autoComplete="new-password"
                          disabled={!codeVerified || isSubmitting}
                        />
                      </FormControl>
                      <PasswordStrengthMeter password={values.new_password} />
                      <p className={cn(fieldHintClassName, "mt-1.5")}>
                        At least 8 characters with uppercase, lowercase, and a
                        number
                      </p>
                      <FormMessage className="mt-1.5 text-xs text-danger" />
                    </FormItem>
                  </FieldShake>
                )}
              />

              <FormField
                control={form.control}
                name="confirm_new_password"
                render={({ field }) => (
                  <FieldShake shake={shouldShake("confirm_new_password")}>
                    <FormItem className="mb-5">
                      <FormControl>
                        <SignupPasswordInput
                          {...field}
                          floatingLabel="Confirm new password"
                          validationState={fieldStatus("confirm_new_password")}
                          autoComplete="new-password"
                          disabled={!codeVerified || isSubmitting}
                        />
                      </FormControl>
                      <PasswordMatchHint
                        password={values.new_password}
                        confirmPassword={values.confirm_new_password}
                      />
                      <FormMessage className="mt-1.5 text-xs text-danger" />
                    </FormItem>
                  </FieldShake>
                )}
              />

              <SignupSubmitButton
                disabled={!codeVerified || isSubmitting || isVerifyingCode}
                loading={isSubmitting}
              >
                Reset password
              </SignupSubmitButton>
              </div>
            </motion.form>
          </Form>

          <motion.p
            variants={fadeUp(0.36, reduceMotion)}
            initial="hidden"
            animate="visible"
            className="mt-6 text-center text-[13px] text-text-muted sm:text-sm"
          >
            <Link
              href="/login"
              className={cn(
                "inline-flex items-center gap-1 font-bold no-underline transition-opacity hover:opacity-80",
                signupGradientTextClass
              )}
            >
              <span aria-hidden>←</span> Back to sign in
            </Link>
          </motion.p>
        </AuthCard>
      </div>
    </motion.div>
  );
}

function ResetPasswordPageFallback() {
  return (
    <div className="grid w-full max-w-[1320px] overflow-hidden rounded-[30px] border border-border/70 bg-surface-1/35 lg:grid-cols-[1.15fr_1fr]">
      <div className="hidden min-h-[420px] bg-surface-2/30 lg:block" />
      <div className="flex items-center justify-center p-8">
        <div className="h-[420px] w-full max-w-[500px] animate-pulse rounded-[30px] bg-surface-2/40" />
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordPageFallback />}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}

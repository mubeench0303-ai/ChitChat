"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "framer-motion";
import { AtSign } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import {
  AuthFormHeading,
  authSplitCardClassName,
  authSplitFormWrapClassName,
  authSplitLayoutClassName,
} from "@/components/auth/auth-form-heading";
import { LoginScene } from "@/components/auth/login-scene";
import { LoginSuccessOverlay } from "@/components/auth/login-success-overlay";
import {
  SignupPasswordInput,
  SignupTextInput,
  type ValidationState,
} from "@/components/auth/signup-field";
import {
  SignupSubmitButton,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
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
import { login } from "@/lib/api/auth";
import { loginSchema, type LoginFormData } from "@/lib/validations/auth";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

const MIN_SUBMIT_MS = 1800;
const SUCCESS_OVERLAY_DELAY_MS = 700;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function isEmailNotVerifiedError(message: string): boolean {
  return message.toLowerCase().includes("email is not verified");
}

function isValidLoginEmail(email: string) {
  return EMAIL_PATTERN.test(email.trim());
}

function displayNameFromEmail(email: string) {
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) {
    return "friend";
  }

  return local.replace(/^./, (char) => char.toUpperCase());
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const fetchCurrentUser = useAuthStore((state) => state.fetchCurrentUser);

  const isVerified = searchParams.get("verified") === "true";
  const [submitAttempt, setSubmitAttempt] = useState(0);
  const [emailBlurred, setEmailBlurred] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [status, setStatus] = useState<VerifyStatusMessage | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successEmail, setSuccessEmail] = useState("");

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const { isSubmitting, errors } = form.formState;
  const values = form.watch();

  useEffect(() => {
    if (isVerified) {
      setStatus({
        type: "success",
        text: "Email verified! You can now sign in.",
      });
    }
  }, [isVerified]);

  const fieldStatus = (name: keyof LoginFormData): ValidationState => {
    if (errors[name]) {
      return "invalid";
    }

    const value = values[name];
    if (!value) {
      return "idle";
    }

    if (name === "email") {
      if (isValidLoginEmail(value)) {
        return "valid";
      }
      if ((emailBlurred || submitAttempt > 0) && value.trim()) {
        return "invalid";
      }
      return "idle";
    }

    return value.trim() ? "valid" : "idle";
  };

  const shouldShake = (name: keyof LoginFormData) => {
    if (submitAttempt === 0) {
      return false;
    }

    return Boolean(errors[name]);
  };

  const onInvalid = () => setSubmitAttempt((attempt) => attempt + 1);

  const handleSuccessContinue = useCallback(async () => {
    await fetchCurrentUser();
    router.push("/chat");
  }, [fetchCurrentUser, router]);

  async function onSubmit(data: LoginFormData) {
    setStatus(null);
    setEmailNotVerified(false);

    const startedAt = Date.now();

    const waitForMinimumLoading = async () => {
      const remaining = MIN_SUBMIT_MS - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
    };

    try {
      await login(data);
      await waitForMinimumLoading();

      setStatus({
        type: "success",
        text: "Signed in successfully! Redirecting…",
      });

      await new Promise((resolve) =>
        setTimeout(resolve, SUCCESS_OVERLAY_DELAY_MS)
      );

      setSuccessEmail(data.email);
      setSuccessOpen(true);
    } catch (error) {
      await waitForMinimumLoading();

      const message =
        error instanceof Error ? error.message : "Something went wrong";

      if (isEmailNotVerifiedError(message)) {
        setEmailNotVerified(true);
        setStatus({
          type: "info",
          text: "Your email isn't verified yet. Check your inbox or verify below.",
        });
        form.setError("email", { message: "Email not verified" });
        onInvalid();
        return;
      }

      form.setError("password", { message: "Incorrect email or password" });
      setStatus({
        type: "error",
        text: "Incorrect email or password. Try again.",
      });
      onInvalid();
    }
  }

  return (
    <>
      <LoginSuccessOverlay
        open={successOpen}
        displayName={displayNameFromEmail(successEmail)}
        onContinue={handleSuccessContinue}
      />

      <motion.div
        initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className={authSplitLayoutClassName}
      >
        <LoginScene email={values.email} />

        <div className={authSplitFormWrapClassName}>
          <div
            aria-hidden
            className="pointer-events-none absolute -left-22.5 -top-35 size-90 rounded-full blur-xs"
            style={{ background: "radial-gradient(circle at 40% 40%, color-mix(in srgb, var(--accent) 22%, white), color-mix(in srgb, var(--accent) 8%, white) 42%, transparent 70%)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-26.25 -right-20 size-82.5 rounded-full blur-xs"
            style={{ background: "radial-gradient(circle at 45% 45%, color-mix(in srgb, var(--accent) 16%, var(--surface-2)), color-mix(in srgb, var(--accent) 6%, var(--surface-1)) 48%, transparent 71%)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute right-[15%] top-[24%] size-45 rounded-full opacity-55 blur-[35px]"
            style={{ background: "color-mix(in srgb, var(--accent) 12%, var(--surface-2))" }}
          />
          <AuthCard
            aria-labelledby="login-title"
            className={authSplitCardClassName}
          >
            <motion.div
              variants={fadeUp(0.12, reduceMotion)}
              initial="hidden"
              animate="visible"
            >
              <AuthFormHeading
                id="login-title"
                title="Sign in"
                emoji="👋"
                subtitle="Enter your details to jump back in."
              />
            </motion.div>

            <Form {...form}>
              <motion.form
                variants={fadeUp(0.2, reduceMotion)}
                initial="hidden"
                animate="visible"
                onSubmit={form.handleSubmit(onSubmit, onInvalid)}
                className="space-y-0"
              >
                <VerifyStatusBanner status={status} />

                {emailNotVerified ? (
                  <p className="mb-4 text-xs text-text-secondary">
                    <Link
                      href={`/verify?email=${encodeURIComponent(values.email)}`}
                      className={cn(
                        "font-bold underline underline-offset-2 transition-opacity hover:opacity-80",
                        signupGradientTextClass
                      )}
                    >
                      Verify your email
                    </Link>{" "}
                    to continue.
                  </p>
                ) : null}

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FieldShake shake={shouldShake("email")}>
                      <FormItem className="mb-3.5">
                        <FormControl>
                          <SignupTextInput
                            {...field}
                            floatingLabel="Email address"
                            validationState={fieldStatus("email")}
                            type="email"
                            leadingIcon={
                              <AtSign className="size-4" strokeWidth={2} />
                            }
                            autoComplete="email"
                            onBlur={(event) => {
                              field.onBlur();
                              setEmailBlurred(true);
                            }}
                          />
                        </FormControl>
                        <FormMessage className="mt-1.5 text-xs text-danger" />
                      </FormItem>
                    </FieldShake>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FieldShake shake={shouldShake("password")}>
                      <FormItem className="mb-4">
                        <div className="mb-1.5 flex items-center justify-end">
                          <Link
                            href="/forgot-password"
                            className={cn(
                              "text-xs font-semibold transition-opacity hover:opacity-80 sm:text-[13px]",
                              signupGradientTextClass
                            )}
                          >
                            Forgot password?
                          </Link>
                        </div>
                        <FormControl>
                          <SignupPasswordInput
                            {...field}
                            floatingLabel="Password"
                            validationState={fieldStatus("password")}
                            autoComplete="current-password"
                            onBlur={field.onBlur}
                          />
                        </FormControl>
                        <FormMessage className="mt-1.5 text-xs text-danger" />
                      </FormItem>
                    </FieldShake>
                  )}
                />

                <label className="mb-5 flex cursor-pointer select-none items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-border bg-surface-1 transition-all duration-200",
                      rememberMe &&
                        "border-accent bg-accent shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
                    )}
                  >
                    <svg
                      className={cn(
                        "size-2.5 text-white transition-opacity duration-200",
                        rememberMe ? "opacity-100" : "opacity-0"
                      )}
                      viewBox="0 0 12 10"
                      fill="none"
                    >
                      <path
                        d="M1 5.5 4.5 9 11 1.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="text-[13px] font-medium text-text-secondary sm:text-[14px]">
                    Keep me signed in for 30 days
                  </span>
                </label>

                <SignupSubmitButton disabled={isSubmitting} loading={isSubmitting}>
                  Sign in
                </SignupSubmitButton>
              </motion.form>
            </Form>

            <motion.p
              variants={fadeUp(0.32, reduceMotion)}
              initial="hidden"
              animate="visible"
              className="mt-6 text-center text-sm text-text-muted sm:text-[14px]"
            >
              New here?{" "}
              <Link
                href="/signup"
                className={cn(
                  "ml-0.5 inline-flex items-center gap-0.5 font-bold no-underline transition-opacity hover:opacity-80",
                  signupGradientTextClass
                )}
              >
                Create an account
                <motion.span
                  aria-hidden
                  className="inline-block"
                  whileHover={reduceMotion ? undefined : { x: 3 }}
                >
                  →
                </motion.span>
              </Link>
            </motion.p>
          </AuthCard>
        </div>
      </motion.div>
    </>
  );
}

function LoginPageFallback() {
  return (
    <div className={authSplitLayoutClassName}>
      <div className="h-48 animate-pulse bg-surface-2/20 lg:min-h-dvh" />
      <div className={authSplitFormWrapClassName}>
        <div className="h-[420px] w-full max-w-[480px] animate-pulse rounded-[24px] bg-surface-2/40" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}

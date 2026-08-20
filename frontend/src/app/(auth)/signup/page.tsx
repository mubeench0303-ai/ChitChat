"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "framer-motion";
import { AtSign, User, UserRound } from "lucide-react";
import { toast } from "sonner";

import { AuthCard, fieldHintClassName } from "@/components/auth/auth-card";
import {
  AuthFormHeading,
  authSplitCardClassName,
  authSplitFormWrapClassName,
  authSplitLayoutClassName,
} from "@/components/auth/auth-form-heading";
import {
  GmailBadge,
  GmailErrorHint,
  isSignupEmailValid,
  PasswordMatchHint,
  PasswordStrengthMeter,
  SuccessHint,
  UsernameAvailabilityChip,
  type UsernameAvailabilityStatus,
} from "@/components/auth/signup-feedback";
import {
  SignupPasswordInput,
  SignupTextInput,
  type ValidationState,
} from "@/components/auth/signup-field";
import { SignupScene } from "@/components/auth/signup-scene";
import { SignupSuccessOverlay } from "@/components/auth/signup-success-overlay";
import {
  SignupSubmitButton,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { checkUsernameAvailability, signup } from "@/lib/api/auth";
import {
  GMAIL_ONLY_MESSAGE,
  isGmailAddress,
  signupSchema,
  type SignupFormData,
} from "@/lib/validations/auth";
import { cn } from "@/lib/utils";

const MIN_SUBMIT_MS = 2000;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;
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

export default function SignupPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [usernameStatus, setUsernameStatus] =
    useState<UsernameAvailabilityStatus>("idle");
  const [submitAttempt, setSubmitAttempt] = useState(0);
  const [emailBlurred, setEmailBlurred] = useState(false);
  const [successState, setSuccessState] = useState<{
    email: string;
    firstName: string;
  } | null>(null);

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const { isSubmitting, errors } = form.formState;
  const values = form.watch();

  useEffect(() => {
    const username = values.username.trim();

    if (!username || !USERNAME_PATTERN.test(username)) {
      setUsernameStatus("idle");
      return;
    }

    let active = true;
    setUsernameStatus("checking");

    const timer = window.setTimeout(async () => {
      try {
        const { available } = await checkUsernameAvailability(username);
        if (!active) {
          return;
        }

        setUsernameStatus(available ? "valid" : "invalid");
        if (available) {
          form.clearErrors("username");
        }
      } catch {
        if (active) {
          setUsernameStatus("idle");
        }
      }
    }, 450);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [values.username, form]);

  const fieldStatus = (name: keyof SignupFormData): ValidationState => {
    if (errors[name]) {
      return "invalid";
    }

    const value = values[name];
    if (!value) {
      return "idle";
    }

    switch (name) {
      case "username":
        return usernameStatus;
      case "fullName":
        return value.trim().length >= 2 ? "valid" : "idle";
      case "email":
        if (isSignupEmailValid(value)) {
          return "valid";
        }
        if ((emailBlurred || submitAttempt > 0) && value.trim()) {
          return "invalid";
        }
        return "idle";
      case "password":
        return PASSWORD_PATTERN.test(value) ? "valid" : "idle";
      case "confirmPassword":
        if (!value) {
          return "idle";
        }
        return value === values.password ? "valid" : "invalid";
      default:
        return "idle";
    }
  };

  const shouldShake = (name: keyof SignupFormData) => {
    if (submitAttempt === 0) {
      return false;
    }

    if (name === "username") {
      return usernameStatus !== "valid" && Boolean(values.username.trim());
    }

    return Boolean(errors[name]);
  };

  const onInvalid = () => setSubmitAttempt((attempt) => attempt + 1);

  const showEmailError =
    fieldStatus("email") === "invalid" &&
    Boolean(values.email.trim()) &&
    !isSignupEmailValid(values.email);

  const handleSuccessComplete = useCallback(() => {
    if (!successState) {
      return;
    }

    router.push(
      `/verify?email=${encodeURIComponent(successState.email)}`
    );
  }, [router, successState]);

  async function onSubmit(data: SignupFormData) {
    if (usernameStatus !== "valid") {
      if (usernameStatus === "idle") {
        form.setError("username", {
          message: "Choose an available username",
        });
      } else {
        form.clearErrors("username");
      }
      onInvalid();
      return;
    }

    if (!isGmailAddress(data.email)) {
      form.setError("email", { message: GMAIL_ONLY_MESSAGE });
      onInvalid();
      return;
    }

    const startedAt = Date.now();

    const waitForMinimumLoading = async () => {
      const remaining = MIN_SUBMIT_MS - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
    };

    try {
      await signup(data);
      await waitForMinimumLoading();

      const firstName =
        data.fullName.trim().split(/\s+/)[0] || "friend";

      setSuccessState({
        email: data.email,
        firstName,
      });
    } catch (error) {
      await waitForMinimumLoading();
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    }
  }

  return (
    <>
      <SignupSuccessOverlay
        open={Boolean(successState)}
        firstName={successState?.firstName ?? "friend"}
        onComplete={handleSuccessComplete}
      />

      <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className={authSplitLayoutClassName}
    >
      <SignupScene />

      <div className={authSplitFormWrapClassName}>
        <AuthCard
          aria-labelledby="signup-title"
          className={authSplitCardClassName}
        >
          <motion.div
            variants={fadeUp(0.12, reduceMotion)}
            initial="hidden"
            animate="visible"
          >
            <AuthFormHeading
              id="signup-title"
              title="Welcome aboard"
              emoji="✨"
              subtitle="Just a few fields — we'll take it from there."
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
              <div className="mb-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FieldShake shake={shouldShake("fullName")}>
                      <FormItem>
                        <FormControl>
                          <SignupTextInput
                            {...field}
                            floatingLabel="Full name"
                            validationState={fieldStatus("fullName")}
                            leadingIcon={
                              <User className="size-4" strokeWidth={2} />
                            }
                            autoComplete="name"
                          />
                        </FormControl>
                        <FormMessage className="mt-1.5 text-xs text-danger" />
                        {fieldStatus("fullName") === "valid" ? (
                          <SuccessHint>Looks great!</SuccessHint>
                        ) : null}
                      </FormItem>
                    </FieldShake>
                  )}
                />

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FieldShake shake={shouldShake("username")}>
                      <FormItem>
                        <FormControl>
                          <SignupTextInput
                            {...field}
                            floatingLabel="Username"
                            validationState={fieldStatus("username")}
                            leadingIcon={
                              <UserRound className="size-4" strokeWidth={2} />
                            }
                            autoComplete="username"
                            onChange={(event) => {
                              field.onChange(event.target.value.toLowerCase());
                            }}
                          />
                        </FormControl>
                        {usernameStatus === "idle" ? (
                          <FormMessage className="mt-1.5 text-xs text-danger" />
                        ) : null}
                        <UsernameAvailabilityChip
                          status={usernameStatus}
                          username={values.username}
                        />
                        <p className={cn(fieldHintClassName, "mt-1")}>
                          Letters, numbers, and underscores only · 3–30
                          characters
                        </p>
                      </FormItem>
                    </FieldShake>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FieldShake shake={shouldShake("email")}>
                    <FormItem className="mb-3.5">
                      <div className="mb-1.5 flex items-center justify-end">
                        <GmailBadge email={values.email} />
                      </div>
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
                      <GmailErrorHint show={showEmailError} />
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
                    <FormItem className="mb-3.5">
                      <FormControl>
                        <SignupPasswordInput
                          {...field}
                          floatingLabel="Create password"
                          validationState={fieldStatus("password")}
                          autoComplete="new-password"
                        />
                      </FormControl>
                      <PasswordStrengthMeter password={values.password} />
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
                name="confirmPassword"
                render={({ field }) => (
                  <FieldShake shake={shouldShake("confirmPassword")}>
                    <FormItem className="mb-5">
                      <FormControl>
                        <SignupPasswordInput
                          {...field}
                          floatingLabel="Confirm password"
                          validationState={fieldStatus("confirmPassword")}
                          autoComplete="new-password"
                        />
                      </FormControl>
                      <PasswordMatchHint
                        password={values.password}
                        confirmPassword={values.confirmPassword}
                      />
                      <FormMessage className="mt-1.5 text-xs text-danger" />
                    </FormItem>
                  </FieldShake>
                )}
              />

              <SignupSubmitButton disabled={isSubmitting} loading={isSubmitting}>
                Create my account
              </SignupSubmitButton>
            </motion.form>
          </Form>

          <motion.p
            variants={fadeUp(0.32, reduceMotion)}
            initial="hidden"
            animate="visible"
            className="mt-6 text-center text-sm text-text-muted sm:text-[14px]"
          >
            Already have an account?{" "}
            <Link
              href="/login"
              className={cn(
                "ml-0.5 inline-flex items-center gap-0.5 font-bold no-underline transition-opacity hover:opacity-80",
                signupGradientTextClass
              )}
            >
              Sign in
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

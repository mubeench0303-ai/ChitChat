"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, AtSign } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import {
  SignupPasswordInput,
  SignupTextInput,
} from "@/components/auth/signup-field";
import {
  SignupSubmitButton,
  signupGradientBgClass,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { login } from "@/lib/api/auth";
import {
  loginSchema,
  type LoginFormData,
} from "@/lib/validations/auth";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

const fadeUp = (delay = 0, reduceMotion: boolean | null = false) => ({
  hidden: { opacity: 0, y: reduceMotion ? 0 : 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] as const },
  },
});

function isEmailNotVerifiedError(message: string): boolean {
  return message.toLowerCase().includes("email is not verified");
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const fetchCurrentUser = useAuthStore((state) => state.fetchCurrentUser);

  const isVerified = searchParams.get("verified") === "true";
  const [apiError, setApiError] = useState<string | null>(null);
  const [emailNotVerified, setEmailNotVerified] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const { isSubmitting } = form.formState;
  const email = form.watch("email");

  async function onSubmit(data: LoginFormData) {
    setApiError(null);
    setEmailNotVerified(false);

    try {
      await login(data);
      await fetchCurrentUser();
      router.push("/chat");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      setApiError(message);
      setEmailNotVerified(isEmailNotVerifiedError(message));
    }
  }

  return (
    <AuthCard aria-labelledby="login-title">
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
        <h1
          id="login-title"
          className="text-2xl font-semibold text-text-primary"
        >
          Welcome back
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
          Log in to continue to ChitChat
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
          {isVerified ? (
            <p className="mb-4 text-sm text-success">
              Email verified! You can now log in.
            </p>
          ) : null}

          {apiError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle />
              <AlertDescription>
                {emailNotVerified ? (
                  <>
                    Your email isn&apos;t verified yet.{" "}
                    <Link
                      href={`/verify?email=${encodeURIComponent(email)}`}
                      className={cn(
                        "font-bold underline underline-offset-2 transition-opacity hover:opacity-80",
                        signupGradientTextClass
                      )}
                    >
                      Verify your email
                    </Link>{" "}
                    to continue.
                  </>
                ) : (
                  apiError
                )}
              </AlertDescription>
            </Alert>
          ) : null}

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="mb-3.5">
                <FormLabel className="mb-[7px] ml-0.5 block text-[13px] font-bold text-text-secondary">
                  Email address
                </FormLabel>
                <FormControl>
                  <SignupTextInput
                    {...field}
                    type="email"
                    leadingIcon={<AtSign className="size-4" strokeWidth={2} />}
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                </FormControl>
                <FormMessage className="mt-1.5 text-xs text-danger" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="mb-5">
                <div className="mb-[7px] ml-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <FormLabel className="text-[13px] font-bold text-text-secondary">
                    Password
                  </FormLabel>
                  <Link
                    href="/forgot-password"
                    className={cn(
                      "text-sm font-medium transition-opacity hover:opacity-80",
                      signupGradientTextClass
                    )}
                  >
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <SignupPasswordInput
                    {...field}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                  />
                </FormControl>
                <FormMessage className="mt-1.5 text-xs text-danger" />
              </FormItem>
            )}
          />

          <SignupSubmitButton disabled={isSubmitting} loading={isSubmitting}>
            {isSubmitting ? "Logging in..." : "Log In"}
          </SignupSubmitButton>
        </motion.form>
      </Form>

      <motion.p
        variants={fadeUp(0.32, reduceMotion)}
        initial="hidden"
        animate="visible"
        className="mt-6 text-center text-[13px] text-text-muted"
      >
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className={cn(
            "ml-0.5 inline-flex items-center gap-0.5 font-bold no-underline transition-opacity hover:opacity-80",
            signupGradientTextClass
          )}
        >
          Sign up
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
  );
}

function LoginPageFallback() {
  return (
    <AuthCard aria-labelledby="login-title">
      <div className="mt-7 h-[380px] animate-pulse rounded-xl bg-surface-2/40" />
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}

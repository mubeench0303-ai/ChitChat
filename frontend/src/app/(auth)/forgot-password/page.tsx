"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, AtSign } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { SignupTextInput } from "@/components/auth/signup-field";
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
import { forgotPassword } from "@/lib/api/auth";
import {
  forgotPasswordSchema,
  type ForgotPasswordFormData,
} from "@/lib/validations/auth";
import { cn } from "@/lib/utils";

const fadeUp = (delay = 0, reduceMotion: boolean | null = false) => ({
  hidden: { opacity: 0, y: reduceMotion ? 0 : 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] as const },
  },
});

export default function ForgotPasswordPage() {
  const reduceMotion = useReducedMotion();
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(data: ForgotPasswordFormData) {
    setApiError(null);

    try {
      await forgotPassword(data.email);
      setSubmittedEmail(data.email);
      setSubmitted(true);
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Something went wrong"
      );
    }
  }

  return (
    <AuthCard aria-labelledby="forgot-password-title">
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
          id="forgot-password-title"
          className="text-2xl font-semibold text-text-primary"
        >
          Reset your password
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
          Enter your email and we&apos;ll send you a reset code
        </p>
      </motion.div>

      {submitted ? (
        <motion.div
          variants={fadeUp(0.2, reduceMotion)}
          initial="hidden"
          animate="visible"
          className="space-y-5"
        >
          <p className="text-sm leading-relaxed text-text-secondary">
            If that email exists, we&apos;ve sent a reset code.
          </p>
          <Link
            href={`/reset-password?email=${encodeURIComponent(submittedEmail)}`}
            className={cn(
              "inline-flex w-full items-center justify-center rounded-[13px] px-4 py-3 text-sm font-bold text-white no-underline transition-opacity hover:opacity-90",
              signupGradientBgClass
            )}
          >
            Enter reset code
          </Link>
        </motion.div>
      ) : (
        <Form {...form}>
          <motion.form
            variants={fadeUp(0.2, reduceMotion)}
            initial="hidden"
            animate="visible"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-0"
          >
            {apiError ? (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle />
                <AlertDescription>{apiError}</AlertDescription>
              </Alert>
            ) : null}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="mb-5">
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

            <SignupSubmitButton disabled={isSubmitting} loading={isSubmitting}>
              {isSubmitting ? "Sending..." : "Send Reset Code"}
            </SignupSubmitButton>
          </motion.form>
        </Form>
      )}

      <motion.p
        variants={fadeUp(0.32, reduceMotion)}
        initial="hidden"
        animate="visible"
        className="mt-6 text-center text-[13px] text-text-muted"
      >
        Remember your password?{" "}
        <Link
          href="/login"
          className={cn(
            "ml-0.5 inline-flex items-center gap-0.5 font-bold no-underline transition-opacity hover:opacity-80",
            signupGradientTextClass
          )}
        >
          Log in
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

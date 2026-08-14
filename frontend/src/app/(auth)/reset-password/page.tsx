"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Hash } from "lucide-react";

import { AuthCard, fieldHintClassName } from "@/components/auth/auth-card";
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
import { resetPassword } from "@/lib/api/auth";
import {
  resetPasswordSchema,
  type ResetPasswordFormData,
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

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const emailFromQuery = searchParams.get("email")?.trim() ?? "";

  const [apiError, setApiError] = useState<string | null>(null);

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: emailFromQuery,
      code: "",
      new_password: "",
      confirm_new_password: "",
    },
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(data: ResetPasswordFormData) {
    setApiError(null);

    try {
      await resetPassword({
        email: data.email,
        code: data.code,
        new_password: data.new_password,
      });
      router.push("/login?reset=true");
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Something went wrong"
      );
    }
  }

  return (
    <AuthCard aria-labelledby="reset-password-title">
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
          id="reset-password-title"
          className="text-2xl font-semibold text-text-primary"
        >
          Set a new password
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
          {emailFromQuery ? (
            <>
              Enter the code sent to{" "}
              <span className="break-all font-medium text-text-primary">
                {emailFromQuery}
              </span>
            </>
          ) : (
            "Enter the code sent to your email."
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
          {apiError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle />
              <AlertDescription>{apiError}</AlertDescription>
            </Alert>
          ) : null}

          <input type="hidden" {...form.register("email")} />

          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem className="mb-3.5">
                <FormLabel className="mb-[7px] ml-0.5 block text-[13px] font-bold text-text-secondary">
                  Reset code
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

          <FormField
            control={form.control}
            name="new_password"
            render={({ field }) => (
              <FormItem className="mb-3.5">
                <FormLabel className="mb-[7px] ml-0.5 block text-[13px] font-bold text-text-secondary">
                  New password
                </FormLabel>
                <FormControl>
                  <SignupPasswordInput
                    {...field}
                    autoComplete="new-password"
                    placeholder="Enter a new password"
                  />
                </FormControl>
                <FormMessage className="mt-1.5 text-xs text-danger" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirm_new_password"
            render={({ field }) => (
              <FormItem className="mb-5">
                <FormLabel className="mb-[7px] ml-0.5 block text-[13px] font-bold text-text-secondary">
                  Confirm new password
                </FormLabel>
                <FormControl>
                  <SignupPasswordInput
                    {...field}
                    autoComplete="new-password"
                    placeholder="Repeat new password"
                  />
                </FormControl>
                <FormMessage className="mt-1.5 text-xs text-danger" />
              </FormItem>
            )}
          />

          <SignupSubmitButton disabled={isSubmitting} loading={isSubmitting}>
            {isSubmitting ? "Resetting..." : "Reset Password"}
          </SignupSubmitButton>
        </motion.form>
      </Form>

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

function ResetPasswordPageFallback() {
  return (
    <AuthCard aria-labelledby="reset-password-title">
      <div className="mt-7 h-[420px] animate-pulse rounded-xl bg-surface-2/40" />
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordPageFallback />}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "framer-motion";
import { AtSign, User, UserRound } from "lucide-react";
import { toast } from "sonner";

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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { signup } from "@/lib/api/auth";
import {
  GMAIL_ONLY_MESSAGE,
  isGmailAddress,
  signupSchema,
  type SignupFormData,
} from "@/lib/validations/auth";
import { cn } from "@/lib/utils";

const SUCCESS_REDIRECT_DELAY_MS = 600;
const MIN_SUBMIT_MS = 2000;

const fadeUp = (delay = 0, reduceMotion: boolean | null = false) => ({
  hidden: { opacity: 0, y: reduceMotion ? 0 : 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] as const },
  },
});

export default function SignupPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

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

  const { isSubmitting } = form.formState;

  async function onSubmit(data: SignupFormData) {
    if (!isGmailAddress(data.email)) {
      form.setError("email", { message: GMAIL_ONLY_MESSAGE });
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
      const result = await signup(data);
      await waitForMinimumLoading();
      toast.success(
        result.verification_resent
          ? "Verification code sent. Please check your email."
          : "Account created successfully."
      );
      await new Promise((resolve) =>
        setTimeout(resolve, SUCCESS_REDIRECT_DELAY_MS)
      );
      router.push(
        `/verify?email=${encodeURIComponent(data.email)}`
      );
    } catch (error) {
      await waitForMinimumLoading();
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    }
  }

  return (
    <AuthCard aria-labelledby="signup-title">
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
          <span className={signupGradientTextClass}>
            Let&apos;s get started
          </span>
        </span>
        <h1
          id="signup-title"
          className="mt-2.5 text-[clamp(2rem,6vw,2.625rem)] font-semibold leading-[0.99] tracking-[-0.05em] text-text-primary"
        >
          Create your
          <br />
          <em className={cn("not-italic", signupGradientTextClass)}>
            happy place.
          </em>
        </h1>
        <p className="mt-2 max-w-[335px] text-[13px] leading-relaxed text-text-secondary">
          Join thousands of people making every conversation count.
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
          <div className="mb-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="mb-[7px] ml-0.5 block text-[13px] font-bold text-text-secondary">
                      Full name
                    </FormLabel>
                    <FormControl>
                      <SignupTextInput
                        {...field}
                        leadingIcon={<User className="size-4" strokeWidth={2} />}
                        autoComplete="name"
                        placeholder="John Doe"
                      />
                    </FormControl>
                    <FormMessage className="mt-1.5 text-xs text-danger" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="mb-[7px] ml-0.5 block text-[13px] font-bold text-text-secondary">
                      Username
                    </FormLabel>
                    <FormControl>
                      <SignupTextInput
                        {...field}
                        leadingIcon={
                          <UserRound className="size-4" strokeWidth={2} />
                        }
                        autoComplete="username"
                        placeholder="johndoe"
                      />
                    </FormControl>
                    <FormMessage className="mt-1.5 text-xs text-danger" />
                  </FormItem>
                )}
              />
            </div>
            <p className={fieldHintClassName}>
              Username: letters, numbers, and underscores only · 3–30 characters
            </p>
          </div>

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
                    placeholder="you@gmail.com"
                  />
                </FormControl>
                <FormDescription className={fieldHintClassName}>
                Only @gmail.com supported
                </FormDescription>
                <FormMessage className="mt-1.5 text-xs text-danger" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="mb-3.5">
                <FormLabel className="mb-[7px] ml-0.5 block text-[13px] font-bold text-text-secondary">
                  Create password
                </FormLabel>
                <FormControl>
                  <SignupPasswordInput
                    {...field}
                    autoComplete="new-password"
                    placeholder="Enter a strong password"
                  />
                </FormControl>
                <FormDescription className={fieldHintClassName}>
                  At least 8 characters with uppercase, lowercase, and a number
                </FormDescription>
                <FormMessage className="mt-1.5 text-xs text-danger" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem className="mb-5">
                <FormLabel className="mb-[7px] ml-0.5 block text-[13px] font-bold text-text-secondary">
                  Confirm password
                </FormLabel>
                <FormControl>
                  <SignupPasswordInput
                    {...field}
                    autoComplete="new-password"
                    placeholder="Repeat password"
                  />
                </FormControl>
                <FormMessage className="mt-1.5 text-xs text-danger" />
              </FormItem>
            )}
          />

          <SignupSubmitButton disabled={isSubmitting} loading={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Create my account"}
          </SignupSubmitButton>
        </motion.form>
      </Form>

      <motion.p
        variants={fadeUp(0.32, reduceMotion)}
        initial="hidden"
        animate="visible"
        className="mt-6 text-center text-[13px] text-text-muted"
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
  );
}

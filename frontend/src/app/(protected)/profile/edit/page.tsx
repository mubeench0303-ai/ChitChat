"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowLeft, User, UserRound } from "lucide-react";
import { toast } from "sonner";

import { AuthCard, fieldHintClassName } from "@/components/auth/auth-card";
import { ProtectedPageFrame } from "@/components/layout/protected-page-frame";
import {
  SignupTextInput,
  SignupTextarea,
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
import { Skeleton } from "@/components/ui/skeleton";
import { checkUsernameAvailability, updateProfile } from "@/lib/api/auth";
import {
  editProfileSchema,
  type EditProfileFormData,
} from "@/lib/validations/profile";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

const USERNAME_CHECK_DELAY_MS = 1500;

const fadeUp = (delay = 0, reduceMotion: boolean | null = false) => ({
  hidden: { opacity: 0, y: reduceMotion ? 0 : 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] as const },
  },
});

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "current";

function isUsernameTakenError(message: string): boolean {
  return message.toLowerCase().includes("username is already taken");
}

function isUsernameFormatValid(username: string) {
  const normalized = username.trim().toLowerCase();
  return /^[a-z0-9_]{3,20}$/.test(normalized);
}

function EditProfileSkeleton() {
  return (
    <ProtectedPageFrame>
      <AuthCard>
        <div className="mt-7 space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-12 w-full rounded-[13px]" />
          <Skeleton className="h-12 w-full rounded-[13px]" />
          <Skeleton className="h-28 w-full rounded-[13px]" />
          <Skeleton className="h-[51px] w-full rounded-[14px]" />
        </div>
      </AuthCard>
    </ProtectedPageFrame>
  );
}

export default function EditProfilePage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const [apiError, setApiError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] =
    useState<UsernameStatus>("current");
  const usernameCheckRequestRef = useRef(0);

  const form = useForm<EditProfileFormData>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: {
      fullName: "",
      username: "",
      bio: "",
    },
  });

  const { isSubmitting } = form.formState;
  const watchedUsername = form.watch("username");

  useEffect(() => {
    if (!user) {
      return;
    }

    form.reset({
      fullName: user.fullName,
      username: user.username,
      bio: user.bio ?? "",
    });
    setUsernameStatus("current");
  }, [user, form]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const normalized = watchedUsername.trim().toLowerCase();
    const currentUsername = user.username.toLowerCase();

    if (!normalized || normalized === currentUsername) {
      setUsernameStatus("current");
      return;
    }

    if (!isUsernameFormatValid(normalized)) {
      setUsernameStatus("idle");
      return;
    }

    setUsernameStatus("checking");
    const requestId = ++usernameCheckRequestRef.current;

    const timer = setTimeout(async () => {
      try {
        const { available } = await checkUsernameAvailability(normalized);

        if (requestId !== usernameCheckRequestRef.current) {
          return;
        }

        setUsernameStatus(available ? "available" : "taken");
      } catch {
        if (requestId === usernameCheckRequestRef.current) {
          setUsernameStatus("idle");
        }
      }
    }, USERNAME_CHECK_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [watchedUsername, user]);

  async function onSubmit(data: EditProfileFormData) {
    if (usernameStatus === "taken" || usernameStatus === "checking") {
      return;
    }

    setApiError(null);
    form.clearErrors();

    try {
      const updatedUser = await updateProfile(data);
      setUser(updatedUser);
      toast.success("Profile updated successfully.");
      router.push("/profile");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";

      if (isUsernameTakenError(message)) {
        setUsernameStatus("taken");
        form.setError("username", { message });
        toast.error(message);
        return;
      }

      setApiError(message);
      toast.error(message);
    }
  }

  const isSaveDisabled =
    isSubmitting || usernameStatus === "taken" || usernameStatus === "checking";

  if (!user) {
    return <EditProfileSkeleton />;
  }

  return (
    <ProtectedPageFrame>
      <AuthCard aria-labelledby="edit-profile-title">
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-text-muted transition-opacity hover:opacity-80"
        >
          <ArrowLeft className="size-4" strokeWidth={2} />
          Back to profile
        </Link>

        <motion.div
          variants={fadeUp(0.12, reduceMotion)}
          initial="hidden"
          animate="visible"
          className="mb-6 mt-6"
        >
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[1.2px]">
            <i
              className={cn(
                "block h-0.5 w-[18px] rounded-full",
                signupGradientBgClass
              )}
            />
            <span className={signupGradientTextClass}>Your profile</span>
          </span>
          <h1
            id="edit-profile-title"
            className="mt-2.5 text-[clamp(1.75rem,5vw,2.25rem)] font-semibold leading-tight tracking-[-0.04em] text-text-primary"
          >
            Edit your
            <br />
            <em className={cn("not-italic", signupGradientTextClass)}>
              public info.
            </em>
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            Update how others see you on ChitChat.
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

            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem className="mb-3.5">
                  <FormLabel className="mb-[7px] ml-0.5 block text-[13px] font-bold text-text-secondary">
                    Full name
                  </FormLabel>
                  <FormControl>
                    <SignupTextInput
                      {...field}
                      leadingIcon={<User className="size-4" strokeWidth={2} />}
                      autoComplete="name"
                      placeholder="Your full name"
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
                <FormItem className="mb-3.5">
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
                      placeholder="username"
                      onChange={(event) => {
                        field.onChange(event.target.value.toLowerCase());
                      }}
                    />
                  </FormControl>
                  {usernameStatus === "checking" ? (
                    <p className={fieldHintClassName}>
                      Checking availability...
                    </p>
                  ) : null}
                  {usernameStatus === "available" ? (
                    <p className="mt-1 text-xs font-medium text-success">
                      Username available
                    </p>
                  ) : null}
                  {usernameStatus === "taken" ? (
                    <p className="mt-1 text-xs font-medium text-danger">
                      Username is already taken
                    </p>
                  ) : null}
                  {usernameStatus === "idle" || usernameStatus === "current" ? (
                    <p className={fieldHintClassName}>
                      Letters, numbers, and underscores · 3–20 characters
                    </p>
                  ) : null}
                  <FormMessage className="mt-1.5 text-xs text-danger" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem className="mb-5">
                  <FormLabel className="mb-[7px] ml-0.5 block text-[13px] font-bold text-text-secondary">
                    Bio
                  </FormLabel>
                  <FormControl>
                    <SignupTextarea
                      {...field}
                      placeholder="Tell people a little about yourself"
                    />
                  </FormControl>
                  <FormMessage className="mt-1.5 text-xs text-danger" />
                </FormItem>
              )}
            />

            <div className="flex gap-3">
              <SignupSubmitButton
                disabled={isSaveDisabled}
                loading={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Save changes"}
              </SignupSubmitButton>
            </div>

            <Link
              href="/profile"
              className={cn(
                "mt-4 flex h-11 w-full items-center justify-center rounded-[13px] border border-border bg-surface-1/60 text-[13px] font-bold text-text-secondary no-underline transition-opacity hover:opacity-80"
              )}
            >
              Cancel
            </Link>
          </motion.form>
        </Form>
      </AuthCard>
    </ProtectedPageFrame>
  );
}

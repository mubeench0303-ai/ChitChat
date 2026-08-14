"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, UserX } from "lucide-react";
import { toast } from "sonner";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  SignupSubmitButton,
  signupGradientBgClass,
  signupGradientTextClass,
} from "@/components/auth/signup-submit-button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { sendMessageRequest } from "@/lib/api/conversations";
import { getPublicProfile } from "@/lib/api/users";
import { getApiErrorStatus } from "@/lib/api/errors";
import {
  messageRequestSchema,
  type MessageRequestFormData,
} from "@/lib/validations/conversation";
import type { PublicProfile } from "@/types";
import { cn } from "@/lib/utils";

const fadeUp = (delay = 0, reduceMotion: boolean | null = false) => ({
  hidden: { opacity: 0, y: reduceMotion ? 0 : 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] as const },
  },
});

function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const profileBackLinkClassName =
  "inline-flex items-center gap-2 text-[13px] font-medium text-text-muted transition-opacity hover:opacity-80";

function ProfileBackLink() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const groupId = searchParams.get("groupId");

  const isFromGroup = from === "group" && groupId;
  const href = isFromGroup
    ? `/groups/${encodeURIComponent(groupId)}`
    : "/search";
  const label = isFromGroup ? "Back to Group Info" : "Back to Search";

  return (
    <Link href={href} className={profileBackLinkClassName}>
      <ArrowLeft className="size-4" strokeWidth={2} />
      {label}
    </Link>
  );
}

function isNotFoundError(message: string) {
  return message.toLowerCase().includes("not found");
}

function mapMessageRequestError(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("not found")) {
    return "User not found";
  }

  if (lower.includes("limit reached")) {
    return "You've already sent your 3 messages — waiting for them to accept";
  }

  if (lower.includes("blocked") || lower.includes("yourself")) {
    return "You can't message this user";
  }

  return message;
}

function PublicProfileSkeleton() {
  return (
    <div className="h-full overflow-y-auto">
      <AuthShell className="min-h-full">
      <AuthCard>
        <Skeleton className="h-4 w-24" />
        <div className="mt-6 space-y-4 text-center">
          <Skeleton className="mx-auto size-32 rounded-full" />
          <Skeleton className="mx-auto h-7 w-40" />
          <Skeleton className="mx-auto h-4 w-28" />
          <Skeleton className="mx-auto h-16 w-full max-w-sm rounded-[13px]" />
          <Skeleton className="mx-auto h-10 w-full max-w-sm rounded-lg" />
        </div>
      </AuthCard>
      </AuthShell>
    </div>
  );
}

function PublicProfileUserGone() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="h-full overflow-y-auto">
      <AuthShell className="min-h-full">
        <AuthCard aria-labelledby="public-profile-gone-title">
          <ProfileBackLink />
          <motion.div
            variants={fadeUp(0.12, reduceMotion)}
            initial="hidden"
            animate="visible"
            className="mt-8 text-center"
          >
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-surface-1/80 text-text-muted">
              <UserX className="size-7" strokeWidth={1.75} />
            </div>
            <h1
              id="public-profile-gone-title"
              className="text-[clamp(1.5rem,4vw,2rem)] font-semibold tracking-[-0.03em] text-text-primary"
            >
              This user no longer exists
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-text-secondary">
              This account has been deleted and is no longer available.
            </p>
          </motion.div>
        </AuthCard>
      </AuthShell>
    </div>
  );
}

function PublicProfileNotFound({ username }: { username: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="h-full overflow-y-auto">
      <AuthShell className="min-h-full">
      <AuthCard aria-labelledby="public-profile-not-found-title">
        <ProfileBackLink />
        <motion.div
          variants={fadeUp(0.12, reduceMotion)}
          initial="hidden"
          animate="visible"
          className="mt-8 text-center"
        >
          <h1
            id="public-profile-not-found-title"
            className="text-[clamp(1.5rem,4vw,2rem)] font-semibold tracking-[-0.03em] text-text-primary"
          >
            User not found
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-[13px] leading-relaxed text-text-secondary">
            We couldn&apos;t find a profile for{" "}
            <span className={cn("font-semibold", signupGradientTextClass)}>
              @{username}
            </span>
            .
          </p>
        </motion.div>
      </AuthCard>
      </AuthShell>
    </div>
  );
}

function PublicProfileContent({ profile }: { profile: PublicProfile }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isConnected =
    profile.relationshipStatus === "accepted" && Boolean(profile.conversationId);

  const form = useForm<MessageRequestFormData>({
    resolver: zodResolver(messageRequestSchema),
    defaultValues: { content: "" },
    mode: "onChange",
  });

  const { isSubmitting, isValid } = form.formState;

  function handleDialogOpenChange(open: boolean) {
    if (isSubmitting) {
      return;
    }

    setDialogOpen(open);

    if (!open) {
      setSubmitError(null);
      form.reset();
    }
  }

  async function onSubmit(data: MessageRequestFormData) {
    setSubmitError(null);

    try {
      await sendMessageRequest(profile.username, data.content);
      setRequestSent(true);
      setDialogOpen(false);
      form.reset();
      toast.success("Message request sent.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      setSubmitError(mapMessageRequestError(message));
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <AuthShell className="min-h-full">
      <AuthCard aria-labelledby="public-profile-title">
        <ProfileBackLink />
        <motion.div
          variants={fadeUp(0.12, reduceMotion)}
          initial="hidden"
          animate="visible"
          className="mb-6 mt-6 text-center"
        >
          <div className="mx-auto mb-4 inline-flex rounded-full p-[3px] shadow-[0_8px_24px_color-mix(in_srgb,var(--accent)_22%,transparent)]">
            <div className="rounded-full bg-background">
              <Avatar className="size-32 [&::after]:hidden">
                {profile.avatarUrl ? (
                  <AvatarImage src={profile.avatarUrl} alt={profile.fullName} />
                ) : null}
                <AvatarFallback
                  className={cn(
                    "text-3xl font-semibold text-white",
                    signupGradientBgClass
                  )}
                >
                  {getInitials(profile.fullName)}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>

          <h1
            id="public-profile-title"
            className="text-[clamp(1.75rem,5vw,2.25rem)] font-semibold leading-tight tracking-[-0.04em] text-text-primary"
          >
            {profile.fullName}
          </h1>
          <p className={cn("mt-1 text-sm font-medium", signupGradientTextClass)}>
            @{profile.username}
          </p>

          <p
            className={cn(
              "mx-auto mt-4 max-w-sm text-[13px] leading-relaxed",
              profile.bio ? "text-text-secondary" : "italic text-text-muted"
            )}
          >
            {profile.bio ?? "No bio yet."}
          </p>
        </motion.div>

        <motion.div
          variants={fadeUp(0.24, reduceMotion)}
          initial="hidden"
          animate="visible"
        >
          {isConnected ? (
            <Button
              type="button"
              onClick={() =>
                router.push(
                  `/chat/${encodeURIComponent(profile.conversationId!)}`
                )
              }
              className="h-11 w-full cursor-pointer"
            >
              Send Message
            </Button>
          ) : (
            <Button
              type="button"
              disabled={requestSent}
              onClick={() => setDialogOpen(true)}
              className={cn(
                "h-11 w-full cursor-pointer",
                requestSent && "cursor-not-allowed"
              )}
            >
              {requestSent ? "Request Sent" : "Send Message Request"}
            </Button>
          )}
        </motion.div>

        {!isConnected ? (
        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="rounded-[16px] border-border/70 sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Send message request</DialogTitle>
              <DialogDescription>
                Send your first message to @{profile.username}. They can accept
                your request to start chatting.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                {submitError ? (
                  <p className="rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3 text-[13px] leading-relaxed text-accent">
                    {submitError}
                  </p>
                ) : null}

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[13px] font-bold text-text-secondary">
                        Message
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Write your first message..."
                          rows={5}
                          disabled={isSubmitting}
                          className="min-h-28 rounded-[13px] border-border/70 bg-surface-1/50"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <SignupSubmitButton
                  type="submit"
                  loading={isSubmitting}
                  disabled={!isValid || isSubmitting}
                >
                  {isSubmitting ? "Sending..." : "Send"}
                </SignupSubmitButton>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        ) : null}
      </AuthCard>
    </AuthShell>
    </div>
  );
}

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = typeof params.username === "string" ? params.username : "";

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [userGone, setUserGone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) {
      setProfile(null);
      setNotFound(true);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      setIsLoading(true);
      setNotFound(false);
      setUserGone(false);
      setError(null);
      setProfile(null);

      try {
        const data = await getPublicProfile(username);
        if (!cancelled) {
          setProfile(data);
        }
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        const message =
          loadError instanceof Error ? loadError.message : "Something went wrong";

        if (getApiErrorStatus(loadError) === 410) {
          setUserGone(true);
          return;
        }

        if (isNotFoundError(message)) {
          setNotFound(true);
          return;
        }

        setError(message);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [username]);

  if (isLoading) {
    return <PublicProfileSkeleton />;
  }

  if (userGone) {
    return <PublicProfileUserGone />;
  }

  if (notFound) {
    return <PublicProfileNotFound username={username} />;
  }

  if (error) {
    return (
      <div className="h-full overflow-y-auto">
        <AuthShell className="min-h-full">
        <AuthCard>
          <ProfileBackLink />          <p className="mt-6 text-[13px] leading-relaxed text-accent">{error}</p>
        </AuthCard>
        </AuthShell>
      </div>
    );
  }

  if (!profile) {
    return <PublicProfileNotFound username={username} />;
  }

  return <PublicProfileContent profile={profile} />;
}

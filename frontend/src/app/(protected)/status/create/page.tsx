"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Loader2, Video } from "lucide-react";
import { toast } from "sonner";

import { SignupSubmitButton } from "@/components/auth/signup-submit-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusImageDisplay } from "@/components/status/status-image-display";
import { StatusVideoDisplay } from "@/components/status/status-video-display";
import {
  STATUS_BG_SWATCHES,
  type StatusBackgroundColor,
} from "@/components/status/status-utils";
import { createStatus } from "@/lib/api/auth";
import {
  formatVideoDuration,
  MESSAGE_VIDEO_ACCEPT,
  readVideoFileMetadata,
  validateVideoMessageFile,
} from "@/lib/validations/video";
import { cn } from "@/lib/utils";

type StatusMode = "text" | "photo" | "video";

const MODE_OPTIONS: { value: StatusMode; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "photo", label: "Photo" },
  { value: "video", label: "Video" },
];

export default function CreateStatusPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<StatusMode>("text");
  const [textContent, setTextContent] = useState("");
  const [backgroundColor, setBackgroundColor] = useState<StatusBackgroundColor>(
    STATUS_BG_SWATCHES[0].value
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number | null>(
    null
  );
  const [caption, setCaption] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [isValidatingVideo, setIsValidatingVideo] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const canPost = useMemo(() => {
    if (mode === "text") {
      return textContent.trim().length > 0;
    }

    if (mode === "video") {
      return selectedFile !== null && videoDurationSeconds !== null && !isValidatingVideo;
    }

    return selectedFile !== null;
  }, [isValidatingVideo, mode, selectedFile, textContent, videoDurationSeconds]);

  function resetMediaSelection() {
    setSelectedFile(null);
    setVideoDurationSeconds(null);
    setUploadProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleModeChange(nextMode: StatusMode) {
    setMode(nextMode);
    setCaption("");
    setSubmitError(null);
    resetMediaSelection();
  }

  function handleSelectPhoto(file: File | null) {
    if (!file) {
      return;
    }

    setSelectedFile(file);
    setSubmitError(null);
  }

  async function handleSelectVideo(file: File | null) {
    if (!file) {
      return;
    }

    setIsValidatingVideo(true);
    setSubmitError(null);
    resetMediaSelection();

    try {
      const { durationSeconds } = await readVideoFileMetadata(file);
      const validationError = validateVideoMessageFile(file, durationSeconds);

      if (validationError) {
        setSubmitError(validationError);
        toast.error(validationError);
        return;
      }

      setSelectedFile(file);
      setVideoDurationSeconds(durationSeconds);
    } catch {
      const message = "Could not read video file";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsValidatingVideo(false);
    }
  }

  async function handlePost() {
    if (!canPost || isPosting) {
      return;
    }

    setIsPosting(true);
    setSubmitError(null);
    setUploadProgress(mode === "video" ? 0 : null);

    try {
      const formData = new FormData();

      if (mode === "text") {
        formData.append("type", "text");
        formData.append("content", textContent.trim());
        formData.append("backgroundColor", backgroundColor);
      } else if (mode === "photo" && selectedFile) {
        formData.append("type", "image");
        formData.append("image", selectedFile);
        if (caption.trim()) {
          formData.append("content", caption.trim());
        }
      } else if (mode === "video" && selectedFile && videoDurationSeconds) {
        formData.append("type", "video");
        formData.append("video", selectedFile);
        formData.append("durationSeconds", String(Math.ceil(videoDurationSeconds)));
        if (caption.trim()) {
          formData.append("content", caption.trim());
        }
      }

      await createStatus(formData, {
        onUploadProgress:
          mode === "video"
            ? (percent) => {
                setUploadProgress(percent);
              }
            : undefined,
      });
      toast.success("Status posted");
      router.push("/status");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to post status";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsPosting(false);
      setUploadProgress(null);
    }
  }

  const fileAccept =
    mode === "video"
      ? MESSAGE_VIDEO_ACCEPT
      : "image/jpeg,image/png,image/webp";

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-5 flex items-center gap-3">
          <Link
            href="/status"
            className="inline-flex items-center justify-center rounded-lg p-1.5 text-text-muted transition-opacity hover:opacity-80"
            aria-label="Back to status"
          >
            <ArrowLeft className="size-5" strokeWidth={2} />
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-text-primary">
              Create Status
            </h1>
            <p className="mt-1 text-[13px] text-text-secondary">
              Share a text, photo, or video update
            </p>
          </div>
        </div>

        <div className="mb-4 inline-flex rounded-xl border border-border/70 bg-surface-1/50 p-1">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleModeChange(option.value)}
              className={cn(
                "rounded-lg px-4 py-2 text-[13px] font-medium transition-ui",
                mode === option.value
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {submitError ? (
          <p className="mb-4 rounded-[13px] border border-border/70 bg-surface-1/50 px-3.5 py-3 text-[13px] text-accent">
            {submitError}
          </p>
        ) : null}

        {mode === "text" ? (
          <div className="space-y-4">
            <div
              className="flex min-h-[280px] items-center justify-center rounded-[13px] px-6 py-10 text-center shadow-sm"
              style={{ backgroundColor }}
            >
              <p className="px-1 text-xl font-semibold leading-relaxed break-words whitespace-pre-wrap text-white [overflow-wrap:anywhere]">
                {textContent.trim() || "Your status preview"}
              </p>
            </div>

            <Textarea
              value={textContent}
              onChange={(event) => setTextContent(event.target.value)}
              placeholder="Type your status..."
              className="min-h-28 resize-none"
            />

            <div className="space-y-2">
              <p className="text-[12px] font-medium uppercase tracking-wide text-text-muted">
                Background
              </p>
              <div className="flex flex-wrap gap-2">
                {STATUS_BG_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.id}
                    type="button"
                    aria-label={`Background ${swatch.id}`}
                    onClick={() => setBackgroundColor(swatch.value)}
                    className={cn(
                      "size-9 rounded-full border-2 transition-ui",
                      backgroundColor === swatch.value
                        ? "border-text-primary scale-105"
                        : "border-transparent"
                    )}
                    style={{ backgroundColor: swatch.value }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : mode === "photo" ? (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept={fileAccept}
              className="hidden"
              onChange={(event) =>
                handleSelectPhoto(event.target.files?.[0] ?? null)
              }
            />

            {previewUrl ? (
              <StatusImageDisplay
                src={previewUrl}
                alt="Selected status preview"
                className="aspect-[9/16] max-h-[min(70dvh,720px)] w-full rounded-[13px] border border-border/70"
              />
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-[280px] w-full flex-col items-center justify-center gap-3 rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-4 py-8 text-center transition-ui hover:bg-surface-1/50"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-text-secondary">
                  <ImagePlus className="size-5" strokeWidth={2} />
                </span>
                <span className="text-sm font-medium text-text-secondary">
                  Tap to choose a photo
                </span>
                <span className="text-[12px] text-text-muted">
                  JPEG, PNG, or WebP up to 5MB
                </span>
              </button>
            )}

            {previewUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Change photo
              </Button>
            ) : null}

            <Textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Add a caption (optional)"
              className="min-h-20 resize-none"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept={fileAccept}
              className="hidden"
              onChange={(event) =>
                void handleSelectVideo(event.target.files?.[0] ?? null)
              }
            />

            {isValidatingVideo ? (
              <div className="flex min-h-[280px] w-full flex-col items-center justify-center gap-3 rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-4 py-8 text-center">
                <Loader2 className="size-6 animate-spin text-text-secondary" />
                <span className="text-sm font-medium text-text-secondary">
                  Validating video...
                </span>
              </div>
            ) : previewUrl ? (
              <StatusVideoDisplay
                videoUrl={previewUrl}
                caption={caption.trim() || null}
                className="aspect-[9/16] max-h-[min(70dvh,720px)] w-full rounded-[13px] border border-border/70"
                autoPlay
                muted
              />
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-[280px] w-full flex-col items-center justify-center gap-3 rounded-[13px] border border-dashed border-border/70 bg-surface-1/30 px-4 py-8 text-center transition-ui hover:bg-surface-1/50"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-text-secondary">
                  <Video className="size-5" strokeWidth={2} />
                </span>
                <span className="text-sm font-medium text-text-secondary">
                  Tap to choose a video
                </span>
                <span className="text-[12px] text-text-muted">
                  MP4, WebM, or MOV up to 100MB and 60 seconds
                </span>
              </button>
            )}

            {previewUrl && videoDurationSeconds ? (
              <p className="text-center text-[12px] text-text-muted">
                Duration: {formatVideoDuration(videoDurationSeconds)}
              </p>
            ) : null}

            {previewUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Change video
              </Button>
            ) : null}

            <Textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Add a caption (optional)"
              className="min-h-20 resize-none"
            />
          </div>
        )}

        {isPosting && uploadProgress !== null ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-[12px] text-text-muted">
              <span>Uploading video</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-[width] duration-150 ease-out"
                style={{ width: `${Math.min(100, uploadProgress)}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <SignupSubmitButton
            type="button"
            loading={isPosting}
            disabled={!canPost}
            onClick={() => void handlePost()}
          >
            {isPosting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {uploadProgress !== null
                  ? `Uploading ${uploadProgress}%...`
                  : "Posting..."}
              </>
            ) : (
              "Post"
            )}
          </SignupSubmitButton>
        </div>
      </div>
    </div>
  );
}

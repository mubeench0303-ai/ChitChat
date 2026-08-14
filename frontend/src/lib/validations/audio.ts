const ALLOWED_VOICE_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "video/webm",
  "application/ogg",
] as const;

export const MAX_VOICE_MESSAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_VOICE_MESSAGE_DURATION_SECONDS = 300;

export function validateVoiceMessageBlob(
  blob: Blob,
  durationSeconds: number
): string | null {
  if (
    blob.type &&
    !ALLOWED_VOICE_TYPES.includes(
      blob.type as (typeof ALLOWED_VOICE_TYPES)[number]
    ) &&
    !blob.type.startsWith("audio/")
  ) {
    return "Voice message must be an audio file";
  }

  if (blob.size > MAX_VOICE_MESSAGE_SIZE_BYTES) {
    return "Voice message must be at most 10MB";
  }

  if (durationSeconds <= 0) {
    return "Voice message duration is invalid";
  }

  if (durationSeconds > MAX_VOICE_MESSAGE_DURATION_SECONDS) {
    return "Voice message must be at most 5 minutes";
  }

  return null;
}

export function formatVoiceDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

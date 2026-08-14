const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
] as const;

export const MAX_VIDEO_MESSAGE_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_MESSAGE_DURATION_SECONDS = 60;

export const MESSAGE_VIDEO_ACCEPT =
  "video/mp4,video/webm,video/quicktime,video/x-m4v";

export function validateVideoMessageFile(
  file: File,
  durationSeconds: number
): string | null {
  if (
    file.type &&
    !ALLOWED_VIDEO_TYPES.includes(
      file.type as (typeof ALLOWED_VIDEO_TYPES)[number]
    ) &&
    !file.type.startsWith("video/")
  ) {
    return "Video must be an MP4, WebM, or MOV file";
  }

  if (file.size > MAX_VIDEO_MESSAGE_SIZE_BYTES) {
    return "Video must be at most 100MB";
  }

  if (durationSeconds <= 0) {
    return "Video duration is invalid";
  }

  if (durationSeconds > MAX_VIDEO_MESSAGE_DURATION_SECONDS) {
    return "Video must be at most 60 seconds";
  }

  return null;
}

export function formatVideoDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function readVideoFileMetadata(
  file: File
): Promise<{ durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const objectUrl = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ durationSeconds: Math.ceil(video.duration) });
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read video file"));
    };

    video.src = objectUrl;
  });
}

export function captureVideoThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, video.duration / 2);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const context = canvas.getContext("2d");
        if (!context) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Could not create thumbnail"));
          return;
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read video file"));
    };

    video.src = objectUrl;
  });
}

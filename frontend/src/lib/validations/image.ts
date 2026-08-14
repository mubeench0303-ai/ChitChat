const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const MAX_AVATAR_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
export const MAX_MESSAGE_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export const MESSAGE_IMAGE_ACCEPT =
  "image/jpeg,image/png,image/webp";

export function validateAvatarImageFile(file: File): string | null {
  return validateImageFile(file, MAX_AVATAR_IMAGE_SIZE_BYTES, "2MB");
}

export function validateMessageImageFile(file: File): string | null {
  return validateImageFile(file, MAX_MESSAGE_IMAGE_SIZE_BYTES, "5MB");
}

function validateImageFile(
  file: File,
  maxSizeBytes: number,
  maxSizeLabel: string
): string | null {
  if (
    !ALLOWED_IMAGE_TYPES.includes(
      file.type as (typeof ALLOWED_IMAGE_TYPES)[number]
    )
  ) {
    return "Image must be a JPEG, PNG, or WebP file";
  }

  if (file.size > maxSizeBytes) {
    return `Image must be at most ${maxSizeLabel}`;
  }

  return null;
}

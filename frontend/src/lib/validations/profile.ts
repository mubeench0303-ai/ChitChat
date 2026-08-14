import { z } from "zod";

export const editProfileSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  username: z
    .string()
    .min(1, "Username is required")
    .transform((value) => value.toLowerCase())
    .pipe(
      z
        .string()
        .min(3, "Username must be at least 3 characters")
        .max(20, "Username must be at most 20 characters")
        .regex(
          /^[a-z0-9_]+$/,
          "Username can only contain lowercase letters, numbers, and underscores"
        )
    ),
  bio: z
    .string()
    .max(160, "Bio must be at most 160 characters")
    .optional()
    .default(""),
});

export type EditProfileFormData = z.infer<typeof editProfileSchema>;

import { z } from "zod";

export const messageRequestSchema = z.object({
  content: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "Message is required")
        .max(2000, "Message must be at most 2000 characters")
    ),
});

export type MessageRequestFormData = z.infer<typeof messageRequestSchema>;

export const chatMessageSchema = messageRequestSchema;

export type ChatMessageFormData = z.infer<typeof chatMessageSchema>;

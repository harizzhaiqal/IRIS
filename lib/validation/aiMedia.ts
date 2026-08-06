import { z } from "zod";

import {
  AI_MEDIA_CATEGORIES,
  AI_MEDIA_MAX_FILE_SIZE_BYTES,
  AI_MEDIA_MAX_FILE_SIZE_LABEL,
  AI_MEDIA_SUPPORTED_FORMATS_LABEL,
  AI_MEDIA_SUPPORTED_MIME_TYPES,
  type AiMediaMimeType,
} from "@/lib/ai-media/constants";

export const createAiMediaAssetSchema = z.object({
  title: z.string().trim().min(1, "Enter a video title.").max(160),
  category: z.enum(AI_MEDIA_CATEGORIES),
  description: z.string().trim().max(2_000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20),
  storagePath: z
    .string()
    .trim()
    .min(3)
    .max(500)
    .refine((value) => !value.includes(".."), "Invalid storage path."),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z
    .string()
    .trim()
    .refine(
      (value) => AI_MEDIA_SUPPORTED_MIME_TYPES.includes(value as AiMediaMimeType),
      `Choose an ${AI_MEDIA_SUPPORTED_FORMATS_LABEL} video.`,
    ),
  fileSizeBytes: z
    .number()
    .int()
    .positive()
    .max(
      AI_MEDIA_MAX_FILE_SIZE_BYTES,
      `Video must be ${AI_MEDIA_MAX_FILE_SIZE_LABEL} or smaller.`,
    ),
});

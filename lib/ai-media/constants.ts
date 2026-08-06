export const AI_MEDIA_BUCKET = "AI videos";

export const AI_MEDIA_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const AI_MEDIA_MAX_FILE_SIZE_LABEL = "50 MB";

export const AI_MEDIA_SUPPORTED_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export const AI_MEDIA_SUPPORTED_FORMATS_LABEL = "MP4, WebM, or MOV";
export const AI_MEDIA_FILE_ACCEPT = AI_MEDIA_SUPPORTED_MIME_TYPES.join(",");
export const AI_MEDIA_TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

const AI_MEDIA_MIME_BY_EXTENSION: Record<string, AiMediaMimeType> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

export const AI_MEDIA_CATEGORIES = [
  "Marketing",
  "Internal",
  "Sales",
  "Training",
  "Product",
  "Other",
] as const;

export type AiMediaCategory = (typeof AI_MEDIA_CATEGORIES)[number];
export type AiMediaMimeType = (typeof AI_MEDIA_SUPPORTED_MIME_TYPES)[number];

export function resolveAiMediaMimeType(file: {
  name: string;
  type: string;
}): AiMediaMimeType | null {
  if (
    AI_MEDIA_SUPPORTED_MIME_TYPES.includes(file.type as AiMediaMimeType)
  ) {
    return file.type as AiMediaMimeType;
  }

  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  return extension ? AI_MEDIA_MIME_BY_EXTENSION[extension] ?? null : null;
}

export function validateAiMediaFile(file: {
  name: string;
  size: number;
  type: string;
}): { ok: true; mimeType: AiMediaMimeType } | { ok: false; error: string } {
  const mimeType = resolveAiMediaMimeType(file);

  if (!mimeType) {
    return {
      ok: false,
      error: `Choose an ${AI_MEDIA_SUPPORTED_FORMATS_LABEL} video.`,
    };
  }

  if (file.size <= 0) {
    return { ok: false, error: "Choose a video file that is not empty." };
  }

  if (file.size > AI_MEDIA_MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: `Video must be ${AI_MEDIA_MAX_FILE_SIZE_LABEL} or smaller.`,
    };
  }

  return { ok: true, mimeType };
}

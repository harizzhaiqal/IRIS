import * as tus from "tus-js-client";

import {
  AI_MEDIA_BUCKET,
  AI_MEDIA_TUS_CHUNK_SIZE_BYTES,
  type AiMediaMimeType,
} from "@/lib/ai-media/constants";

type ResumableUploadOptions = {
  accessToken: string;
  file: File;
  mimeType: AiMediaMimeType;
  storagePath: string;
  supabaseUrl: string;
  onProgress: (bytesUploaded: number, bytesTotal: number) => void;
  onResumeFound?: () => void;
};

export type ResumableUploadHandle = {
  upload: tus.Upload;
  start: () => Promise<void>;
  completed: Promise<string>;
};

export function getResumableUploadEndpoint(supabaseUrl: string): string {
  const url = new URL(supabaseUrl);
  const hostedProject = /^([a-z0-9-]+)\.supabase\.co$/i.exec(url.hostname);

  if (hostedProject) {
    return `https://${hostedProject[1]}.storage.supabase.co/storage/v1/upload/resumable`;
  }

  return new URL("/storage/v1/upload/resumable", url).toString();
}

export function createResumableAiMediaUpload(
  options: ResumableUploadOptions,
): ResumableUploadHandle {
  let activeStoragePath = options.storagePath;
  let resolveCompleted!: (storagePath: string) => void;
  let rejectCompleted!: (error: Error) => void;

  const completed = new Promise<string>((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });

  const upload = new tus.Upload(options.file, {
    endpoint: getResumableUploadEndpoint(options.supabaseUrl),
    retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
    headers: {
      authorization: `Bearer ${options.accessToken}`,
      "x-upsert": "false",
    },
    uploadDataDuringCreation: true,
    storeFingerprintForResuming: true,
    removeFingerprintOnSuccess: true,
    chunkSize: AI_MEDIA_TUS_CHUNK_SIZE_BYTES,
    metadata: {
      bucketName: AI_MEDIA_BUCKET,
      objectName: options.storagePath,
      contentType: options.mimeType,
      cacheControl: "3600",
    },
    onProgress: options.onProgress,
    onError: (error) => {
      rejectCompleted(
        error instanceof Error ? error : new Error("The resumable upload failed."),
      );
    },
    onSuccess: () => resolveCompleted(activeStoragePath),
  });

  async function start() {
    const previousUploads = await upload.findPreviousUploads();
    const previousUpload = previousUploads.find((candidate) => {
      const objectName = candidate.metadata.objectName;
      return (
        candidate.uploadUrl &&
        candidate.metadata.bucketName === AI_MEDIA_BUCKET &&
        typeof objectName === "string" &&
        objectName.startsWith(`${options.storagePath.split("/", 1)[0]}/`)
      );
    });

    if (previousUpload) {
      activeStoragePath = previousUpload.metadata.objectName;
      upload.resumeFromPreviousUpload(previousUpload);
      options.onResumeFound?.();
    }

    upload.start();
  }

  return { upload, start, completed };
}

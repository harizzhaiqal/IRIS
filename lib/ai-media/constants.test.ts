import { describe, expect, it } from "vitest";

import {
  AI_MEDIA_MAX_FILE_SIZE_BYTES,
  resolveAiMediaMimeType,
  validateAiMediaFile,
} from "./constants";
import { getResumableUploadEndpoint } from "./resumable-upload";

describe("AI media file validation", () => {
  it("accepts each supported video format", () => {
    expect(
      validateAiMediaFile({ name: "promo.mp4", size: 1024, type: "video/mp4" }),
    ).toEqual({ ok: true, mimeType: "video/mp4" });
    expect(
      validateAiMediaFile({ name: "demo.webm", size: 1024, type: "video/webm" }),
    ).toEqual({ ok: true, mimeType: "video/webm" });
    expect(
      validateAiMediaFile({ name: "pitch.mov", size: 1024, type: "video/quicktime" }),
    ).toEqual({ ok: true, mimeType: "video/quicktime" });
  });

  it("uses the extension when a browser omits the MIME type", () => {
    expect(resolveAiMediaMimeType({ name: "promo.MOV", type: "" })).toBe(
      "video/quicktime",
    );
  });

  it("rejects unsupported and oversized files", () => {
    expect(
      validateAiMediaFile({ name: "clip.avi", size: 1024, type: "video/avi" }),
    ).toMatchObject({ ok: false });
    expect(
      validateAiMediaFile({
        name: "large.mp4",
        size: AI_MEDIA_MAX_FILE_SIZE_BYTES + 1,
        type: "video/mp4",
      }),
    ).toEqual({ ok: false, error: "Video must be 50 MB or smaller." });
  });
});

describe("Supabase resumable endpoint", () => {
  it("uses the direct storage hostname for hosted projects", () => {
    expect(getResumableUploadEndpoint("https://abc123.supabase.co")).toBe(
      "https://abc123.storage.supabase.co/storage/v1/upload/resumable",
    );
  });

  it("keeps the local Supabase origin during development", () => {
    expect(getResumableUploadEndpoint("http://127.0.0.1:54321")).toBe(
      "http://127.0.0.1:54321/storage/v1/upload/resumable",
    );
  });
});

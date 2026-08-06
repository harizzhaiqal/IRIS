"use server";

import { revalidatePath } from "next/cache";

import { failed, type ActionResult } from "@/lib/actionResult";
import { requireProfile } from "@/lib/auth";
import { logAction } from "@/lib/automationLog";
import type { AiMediaListItem } from "@/lib/queries/aiMedia";
import { createClient } from "@/lib/supabase/server";
import { createAiMediaAssetSchema } from "@/lib/validation/aiMedia";

export async function createAiMediaAsset(
  input: unknown,
): Promise<ActionResult<AiMediaListItem>> {
  const profile = await requireProfile();
  const parsed = createAiMediaAssetSchema.safeParse(input);

  if (!parsed.success) {
    return failed(parsed.error.issues[0]?.message ?? "Check the video details.");
  }

  const entry = parsed.data;
  if (!entry.storagePath.startsWith(`${profile.id}/`)) {
    return failed("The uploaded video is not in your staff folder.");
  }

  const supabase = createClient();
  const { data: created, error } = await supabase
    .from("ai_media_assets")
    .insert({
      uploader_id: profile.id,
      title: entry.title,
      category: entry.category,
      description: entry.description || null,
      ai_tags: Array.from(new Set(entry.tags)),
      file_name: entry.fileName,
      storage_path: entry.storagePath,
      mime_type: entry.mimeType,
      file_size_bytes: entry.fileSizeBytes,
    })
    .select(
      "id, title, category, description, ai_tags, file_name, file_size_bytes, created_time",
    )
    .single();

  if (error || !created) {
    return failed(`Could not save the video record: ${error?.message ?? "unknown error"}`);
  }

  await logAction({
    actionType: "ai_media.uploaded",
    description: `${profile.full_name} uploaded "${created.title}" to the Media Library`,
    relatedTable: "ai_media_assets",
    relatedId: created.id,
    performedBy: profile.id,
  });

  revalidatePath("/ai-media");

  return {
    ok: true,
    data: {
      id: created.id,
      title: created.title,
      category: created.category,
      createdBy: profile.full_name,
      tags: created.ai_tags,
      description: created.description ?? "No description provided.",
      fileName: created.file_name,
      fileSizeBytes: created.file_size_bytes,
      createdAt: created.created_time,
    },
  };
}

import { NextResponse } from "next/server";

import { AI_MEDIA_BUCKET } from "@/lib/ai-media/constants";
import { createClient } from "@/lib/supabase/server";
import { idParamSchema } from "@/lib/validation/training";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const id = idParamSchema.safeParse(params.id);
  if (!id.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = createClient();
  const { data: asset } = await supabase
    .from("ai_media_assets")
    .select("storage_path, file_name")
    .eq("id", id.data)
    .maybeSingle();

  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isDownload = new URL(request.url).searchParams.get("download") === "1";
  const { data: signed } = await supabase.storage
    .from(AI_MEDIA_BUCKET)
    .createSignedUrl(
      asset.storage_path,
      300,
      isDownload ? { download: asset.file_name } : undefined,
    );

  if (!signed) {
    return NextResponse.json({ error: "Video unavailable" }, { status: 404 });
  }

  return NextResponse.redirect(signed.signedUrl);
}

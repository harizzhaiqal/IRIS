import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { idParamSchema } from "@/lib/validation/training";

/**
 * Redirects to a short-lived signed URL for an attachment. RLS on
 * training_attachments decides whether the caller may see the row at all, so
 * an unauthorized id is indistinguishable from a missing one.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  // The column is an integer, so a hand-edited path reads as not found rather
  // than reaching the query as a string.
  const id = idParamSchema.safeParse(params.id);
  if (!id.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = createClient();

  const { data: attachment } = await supabase
    .from("training_attachments")
    .select("file_path")
    .eq("id", id.data)
    .maybeSingle();

  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: signed } = await supabase.storage
    .from("training-attachments")
    .createSignedUrl(attachment.file_path, 60);

  if (!signed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.redirect(signed.signedUrl);
}

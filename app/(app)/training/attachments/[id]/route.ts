import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Redirects to a short-lived signed URL for an attachment. RLS on
 * training_attachments decides whether the caller may see the row at all, so
 * an unauthorized id is indistinguishable from a missing one.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();

  const { data: attachment } = await supabase
    .from("training_attachments")
    .select("file_path")
    .eq("id", params.id)
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

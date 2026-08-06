import { createClient } from "@/lib/supabase/server";

export type AiMediaListItem = {
  id: number;
  title: string;
  category: string;
  createdBy: string;
  tags: string[];
  description: string;
  fileName: string;
  fileSizeBytes: number;
  createdAt: string;
};

type AiMediaQueryRow = {
  id: number;
  title: string;
  category: string;
  description: string | null;
  ai_tags: string[];
  file_name: string;
  file_size_bytes: number;
  created_time: string;
  uploader: { full_name: string } | null;
};

const LIST_SELECT = `
  id, title, category, description, ai_tags, file_name, file_size_bytes, created_time,
  uploader:profiles!ai_media_assets_uploader_id_fkey ( full_name )
`;

export function mapAiMediaRow(row: AiMediaQueryRow): AiMediaListItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    createdBy: row.uploader?.full_name ?? "Unknown staff member",
    tags: row.ai_tags,
    description: row.description ?? "No description provided.",
    fileName: row.file_name,
    fileSizeBytes: row.file_size_bytes,
    createdAt: row.created_time,
  };
}

export async function listAiMediaAssets(): Promise<AiMediaListItem[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("ai_media_assets")
    .select(LIST_SELECT)
    .order("created_time", { ascending: false });

  return ((data as unknown as AiMediaQueryRow[] | null) ?? []).map(mapAiMediaRow);
}

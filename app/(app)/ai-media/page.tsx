import { AiMediaLibraryClient } from "@/components/ai-media/ai-media-library-client";
import { requireProfile } from "@/lib/auth";
import { listAiMediaAssets } from "@/lib/queries/aiMedia";

export const metadata = { title: "Media Library — IRIS" };

export default async function AiMediaLibraryPage() {
  const profile = await requireProfile();
  const items = await listAiMediaAssets();

  return (
    <AiMediaLibraryClient
      currentUserId={profile.id}
      initialItems={items}
    />
  );
}

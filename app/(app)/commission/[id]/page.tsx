import { CommissionDetailClient } from "@/components/commission/commission-detail-client";
import { requireProfile } from "@/lib/auth";

export const metadata = { title: "Commission record — IRIS" };

export default async function CommissionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();

  return (
    <CommissionDetailClient
      recordId={Number(params.id)}
      profileId={profile.id}
      profileName={profile.full_name}
      role={profile.role}
    />
  );
}

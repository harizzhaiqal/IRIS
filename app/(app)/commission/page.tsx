import { CommissionPageClient } from "@/components/commission/commission-page-client";
import { requireProfile } from "@/lib/auth";

export const metadata = { title: "Commission records — IRIS" };

export default async function CommissionPage() {
  const profile = await requireProfile();

  return (
    <CommissionPageClient
      profileId={profile.id}
      profileName={profile.full_name}
      role={profile.role}
    />
  );
}

import { HodDashboard } from "@/components/dashboard/hod-dashboard";
import { RequestSummary } from "@/components/dashboard/request-summary";
import { HrDashboard } from "@/components/dashboard/hr-dashboard";
import { StaffDashboard } from "@/components/dashboard/staff-dashboard";
import { requireProfile } from "@/lib/auth";

export const metadata = { title: "Dashboard — IRIS" };

export default async function DashboardPage() {
  const profile = await requireProfile();

  const isReviewer = profile.role !== "staff";

  // The training view stays whatever the role's own component renders; the
  // Requests block is the same for everyone because its queries are already
  // scoped by RLS.
  return (
    <div className="space-y-10">
      {/* The CEO wants exactly what HR sees — company-wide compliance — and
          that view is figures and links, with nothing to act on. */}
      {profile.role === "hr_admin" || profile.role === "ceo" ? (
        <HrDashboard profile={profile} />
      ) : null}
      {profile.role === "hod" ? <HodDashboard profile={profile} /> : null}
      {profile.role === "staff" ? <StaffDashboard profile={profile} /> : null}

      <RequestSummary isReviewer={isReviewer} />
    </div>
  );
}

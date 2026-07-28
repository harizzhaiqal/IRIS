import { HodDashboard } from "@/components/dashboard/hod-dashboard";
import { HrDashboard } from "@/components/dashboard/hr-dashboard";
import { StaffDashboard } from "@/components/dashboard/staff-dashboard";
import { requireProfile } from "@/lib/auth";

export const metadata = { title: "Dashboard — IRIS" };

export default async function DashboardPage() {
  const profile = await requireProfile();

  if (profile.role === "hr_admin") return <HrDashboard profile={profile} />;
  if (profile.role === "hod") return <HodDashboard profile={profile} />;

  return <StaffDashboard profile={profile} />;
}

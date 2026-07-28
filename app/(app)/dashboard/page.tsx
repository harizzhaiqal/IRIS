import { requireProfile } from "@/lib/auth";

export const metadata = { title: "Dashboard — IRIS" };

export default async function DashboardPage() {
  const profile = await requireProfile();

  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome back, {profile.full_name.split(" ")[0]}
      </h1>
      <p className="text-sm text-muted-foreground">
        Your dashboard is assembled in a later step.
      </p>
    </div>
  );
}

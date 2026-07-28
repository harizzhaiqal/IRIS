import Link from "next/link";
import { AlertTriangle, ClipboardCheck, TrendingDown, Users } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/training/empty-state";
import { StatusBadge } from "@/components/training/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listTeamMembers } from "@/lib/queries/profiles";
import { getTargets } from "@/lib/queries/settings";
import {
  listTeamSubmissionsForMonth,
  listYearSubmissionsForEmployees,
} from "@/lib/queries/submissions";
import type { Profile } from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import {
  hoursToMinutes,
  monthName,
  percentOfTarget,
  splitApprovedAndPending,
} from "@/lib/utils/targets";

export async function HodDashboard({ profile }: { profile: Profile }) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [targets, team] = await Promise.all([getTargets(), listTeamMembers(profile.id)]);
  const teamIds = team.map((member) => member.id);

  const [monthSubmissions, yearSubmissions] = await Promise.all([
    listTeamSubmissionsForMonth(teamIds, month, year),
    listYearSubmissionsForEmployees(teamIds, year),
  ]);

  const byEmployeeThisMonth = new Map(
    monthSubmissions.map((row) => [row.employee_id, row]),
  );

  const submitted = team.filter((member) => {
    const submission = byEmployeeThisMonth.get(member.id);
    return submission && submission.status !== "draft";
  });

  const notSubmitted = team.filter((member) => !submitted.includes(member));

  const awaitingMe = monthSubmissions.filter(
    (row) => row.status === "submitted_pending_hod",
  ).length;

  const thresholdMinutes = hoursToMinutes(targets.yearlyThresholdHours);

  const yearByEmployee = team.map((member) => {
    const rows = yearSubmissions.filter((row) => row.employee_id === member.id);
    const { approvedMinutes, pendingMinutes } = splitApprovedAndPending(rows);

    return { member, approvedMinutes, pendingMinutes };
  });

  const belowThreshold = yearByEmployee
    .filter((entry) => entry.approvedMinutes < thresholdMinutes)
    .sort((a, b) => a.approvedMinutes - b.approvedMinutes);

  const submissionRate =
    team.length === 0 ? 0 : Math.round((submitted.length / team.length) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            Training across your team for {monthName(month)} {year}.
          </p>
        </div>

        <Button asChild>
          <Link href="/training/team">
            <ClipboardCheck className="h-4 w-4" />
            Review team submissions
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Submission rate"
          value={`${submissionRate}%`}
          hint={`${submitted.length} of ${team.length} for ${monthName(month)}`}
          icon={Users}
          tone={submissionRate === 100 ? "success" : "default"}
        />
        <StatCard
          label="Awaiting my verification"
          value={awaitingMe}
          hint={awaitingMe === 0 ? "Nothing in your queue" : "Ready to review now"}
          icon={ClipboardCheck}
          tone={awaitingMe > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Not yet submitted"
          value={notSubmitted.length}
          hint={`For ${monthName(month)} ${year}`}
          icon={AlertTriangle}
          tone={notSubmitted.length > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Below yearly threshold"
          value={belowThreshold.length}
          hint={`Approved hours under ${targets.yearlyThresholdHours}h`}
          icon={TrendingDown}
          tone={belowThreshold.length > 0 ? "destructive" : "success"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Not yet submitted</CardTitle>
          </CardHeader>
          <CardContent>
            {notSubmitted.length === 0 ? (
              <EmptyState
                icon={Users}
                title={`Everyone has filed ${monthName(month)}`}
                description="Their submissions are in your review queue or already with HR."
              />
            ) : (
              <ul className="divide-y">
                {notSubmitted.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{member.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {member.designation ?? "—"}
                      </p>
                    </div>
                    <StatusBadge
                      status={byEmployeeThisMonth.get(member.id)?.status ?? null}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tracking below the yearly threshold</CardTitle>
          </CardHeader>
          <CardContent>
            {belowThreshold.length === 0 ? (
              <EmptyState
                icon={Users}
                title="The whole team is above the threshold"
                description={`Everyone has at least ${targets.yearlyThresholdHours} approved hours for ${year}.`}
              />
            ) : (
              <ul className="divide-y">
                {belowThreshold.map(({ member, approvedMinutes, pendingMinutes }) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{member.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {percentOfTarget(
                          approvedMinutes,
                          targets.yearlyThresholdHours,
                        )}
                        % of threshold
                        {pendingMinutes > 0
                          ? ` · ${minutesToHHMM(pendingMinutes)} pending`
                          : ""}
                      </p>
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      {minutesToHHMM(approvedMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

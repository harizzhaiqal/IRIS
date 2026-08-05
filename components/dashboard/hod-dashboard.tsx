import Link from "next/link";
import {
  ClipboardCheck,
  Inbox,
  TrendingDown,
  Users,
} from "lucide-react";

import { InsightCard } from "@/components/dashboard/insight-card";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  RequestPriorityBadge,
  RequestStatusBadge,
} from "@/components/requests/request-badges";
import { EmptyState } from "@/components/training/empty-state";
import { StatusBadge } from "@/components/training/status-badge";
import { TargetProgress } from "@/components/training/target-progress";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listTeamMembers } from "@/lib/queries/profiles";
import { listRequests } from "@/lib/queries/requests";
import { getTargets } from "@/lib/queries/settings";
import {
  listTeamSubmissionsForMonth,
  listYearSubmissionsForEmployees,
} from "@/lib/queries/submissions";
import type { Profile } from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import { formatCost } from "@/lib/utils/money";
import { getRequestDashboardAnalytics } from "@/lib/utils/request-dashboard";
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

  const [targets, team, requests] = await Promise.all([
    getTargets(),
    listTeamMembers(profile.id),
    listRequests(),
  ]);
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
  const notSubmittedIds = new Set(
    team.filter((member) => !submitted.includes(member)).map((member) => member.id),
  );
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
    .sort((left, right) => left.approvedMinutes - right.approvedMinutes);
  const belowThresholdIds = new Set(
    belowThreshold.map((entry) => entry.member.id),
  );
  const teamAttention = yearByEmployee
    .filter(
      (entry) =>
        notSubmittedIds.has(entry.member.id) ||
        belowThresholdIds.has(entry.member.id),
    )
    .sort((left, right) => {
      const leftMissing = notSubmittedIds.has(left.member.id) ? 1 : 0;
      const rightMissing = notSubmittedIds.has(right.member.id) ? 1 : 0;
      return rightMissing - leftMissing || left.approvedMinutes - right.approvedMinutes;
    });

  const submissionRate =
    team.length === 0 ? 0 : Math.round((submitted.length / team.length) * 100);
  const totalApproved = yearByEmployee.reduce(
    (sum, entry) => sum + entry.approvedMinutes,
    0,
  );
  const totalPending = yearByEmployee.reduce(
    (sum, entry) => sum + entry.pendingMinutes,
    0,
  );
  const teamHeadcount = Math.max(1, team.length);

  const requestAnalytics = getRequestDashboardAnalytics(requests, now);
  const pendingRequestApprovals = requestAnalytics.pendingApproval.filter(
    (request) => request.requester_id !== profile.id,
  );
  const requestActionIds = new Set<number>();
  const requestsNeedingAction = [
    ...pendingRequestApprovals,
    ...requestAnalytics.highPriorityActive,
  ]
    .filter((request) => {
      if (requestActionIds.has(request.id)) return false;
      requestActionIds.add(request.id);
      return true;
    })
    .slice(0, 5);

  const lowestTeamMember = belowThreshold[0] ?? null;
  const insightPoints = [
    notSubmittedIds.size > 0
      ? `${notSubmittedIds.size} ${notSubmittedIds.size === 1 ? "team member has" : "team members have"} not filed ${monthName(month)} yet.`
      : `Everyone in the team has filed ${monthName(month)}.`,
    lowestTeamMember
      ? `${lowestTeamMember.member.full_name} has the lowest approved progress at ${percentOfTarget(lowestTeamMember.approvedMinutes, targets.yearlyThresholdHours)}% of the minimum threshold.`
      : "Everyone in the team has reached the yearly minimum threshold.",
    pendingRequestApprovals.length > 0
      ? `${pendingRequestApprovals.length} ${pendingRequestApprovals.length === 1 ? "request is" : "requests are"} waiting for your decision.`
      : "No team request approvals are waiting for you.",
    requestAnalytics.oldestActive
      ? `The oldest active request has been open for ${requestAnalytics.oldestActive.ageDays} days.`
      : "There are no active team requests.",
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            Training and request activity across your team for {monthName(month)} {year}.
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
          label="Team submission rate"
          value={`${submissionRate}%`}
          hint={`${submitted.length} of ${team.length} for ${monthName(month)}`}
          icon={Users}
          tone={submissionRate === 100 ? "success" : "default"}
        />
        <StatCard
          label="Awaiting my review"
          value={awaitingMe}
          hint="Training submissions ready to verify"
          icon={ClipboardCheck}
          tone={awaitingMe > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Request approvals"
          value={pendingRequestApprovals.length}
          hint="Waiting for your decision"
          icon={Inbox}
          tone={pendingRequestApprovals.length > 0 ? "warning" : "default"}
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
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle>Team members needing attention</CardTitle>
              <p className="text-xs text-muted-foreground">
                Missing submissions or progress below the yearly threshold.
              </p>
            </div>
            <Link
              href="/training/team"
              className="text-xs font-medium text-primary hover:underline"
            >
              View team
            </Link>
          </CardHeader>
          <CardContent>
            {teamAttention.length === 0 ? (
              <EmptyState
                icon={Users}
                title="The team is on track"
                description={`Everyone has filed ${monthName(month)} and reached the yearly threshold.`}
              />
            ) : (
              <ul className="divide-y">
                {teamAttention.slice(0, 5).map((entry) => (
                  <li
                    key={entry.member.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{entry.member.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {notSubmittedIds.has(entry.member.id)
                          ? `${monthName(month)} not submitted · `
                          : ""}
                        {percentOfTarget(
                          entry.approvedMinutes,
                          targets.yearlyThresholdHours,
                        )}
                        % of threshold
                        {entry.pendingMinutes > 0
                          ? ` · ${minutesToHHMM(entry.pendingMinutes)} pending`
                          : ""}
                      </p>
                    </div>
                    <StatusBadge
                      status={
                        byEmployeeThisMonth.get(entry.member.id)?.status ?? null
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle>Requests awaiting action</CardTitle>
              <p className="text-xs text-muted-foreground">
                Pending decisions and high-priority team requests.
              </p>
            </div>
            <Link
              href="/requests"
              className="text-xs font-medium text-primary hover:underline"
            >
              View requests
            </Link>
          </CardHeader>
          <CardContent>
            {requestsNeedingAction.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No request actions waiting"
                description="There are no pending approvals or high-priority requests in your visible queue."
              />
            ) : (
              <ul className="divide-y">
                {requestsNeedingAction.map((request) => (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/requests/${request.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {request.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {request.requester?.full_name ?? "Unknown requester"}
                        {request.estimated_cost_cents > 0
                          ? ` · ${formatCost(request.estimated_cost_cents)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <RequestPriorityBadge priority={request.priority} />
                      <RequestStatusBadge status={request.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Team progress for {year}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <TargetProgress
              label="Approved against the team yearly standard"
              approvedMinutes={totalApproved}
              pendingMinutes={totalPending}
              targetHours={targets.yearlyStandardHours * teamHeadcount}
            />
            <TargetProgress
              label="Approved against the team minimum threshold"
              approvedMinutes={totalApproved}
              targetHours={targets.yearlyThresholdHours * teamHeadcount}
            />
            <div className="grid gap-4 border-t pt-4 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Approved
                </p>
                <p className="text-xl font-semibold tabular-nums">
                  {minutesToHHMM(totalApproved)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pending
                </p>
                <p className="text-xl font-semibold tabular-nums">
                  {minutesToHHMM(totalPending)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Active request cost
                </p>
                <p className="text-xl font-semibold tabular-nums">
                  {formatCost(requestAnalytics.estimatedOpenCostCents)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <InsightCard
          summary={`${teamAttention.length} team members and ${requestsNeedingAction.length} requests currently need closer attention.`}
          insights={insightPoints}
          scope={`Based on ${team.length} team members and ${requests.length} visible requests`}
          badge={teamAttention.length + requestsNeedingAction.length > 0 ? "Next step" : "On track"}
          badgeTone={
            teamAttention.length + requestsNeedingAction.length > 0
              ? "warning"
              : "success"
          }
          evidenceHref="/training/team"
        />
      </div>
    </div>
  );
}

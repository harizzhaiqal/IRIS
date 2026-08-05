import Link from "next/link";
import { CalendarClock, Clock, Inbox, Plus } from "lucide-react";

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
import { listRequests } from "@/lib/queries/requests";
import { getTargets } from "@/lib/queries/settings";
import {
  getSubmissionForMonth,
  listYearSubmissions,
} from "@/lib/queries/submissions";
import {
  REQUEST_STATUS_LABELS,
  STATUS_LABELS,
  type Profile,
} from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import { formatCost } from "@/lib/utils/money";
import { getRequestDashboardAnalytics } from "@/lib/utils/request-dashboard";
import {
  daysUntilDeadline,
  hoursToMinutes,
  monthName,
  splitApprovedAndPending,
} from "@/lib/utils/targets";

export async function StaffDashboard({ profile }: { profile: Profile }) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [targets, current, yearSubmissions, requests] = await Promise.all([
    getTargets(),
    getSubmissionForMonth(profile.id, month, year),
    listYearSubmissions(profile.id, year),
    listRequests(),
  ]);

  const { approvedMinutes, pendingMinutes } =
    splitApprovedAndPending(yearSubmissions);
  const daysLeft = daysUntilDeadline(
    month,
    year,
    targets.submissionDeadlineDay,
    now,
  );
  const requestAnalytics = getRequestDashboardAnalytics(requests, now);
  const monthRemainingMinutes = Math.max(
    0,
    hoursToMinutes(targets.monthlyStandardHours) -
      (current?.total_minutes ?? 0),
  );
  const thresholdRemainingMinutes = Math.max(
    0,
    hoursToMinutes(targets.yearlyThresholdHours) - approvedMinutes,
  );
  const latestActiveRequest = requestAnalytics.active[0] ?? null;

  const recentTrainingActivity = yearSubmissions
    .filter((submission) => submission.status !== "draft")
    .sort((left, right) => {
      const leftAt =
        left.hr_verified_at ?? left.hod_verified_at ?? left.submitted_at ?? "";
      const rightAt =
        right.hr_verified_at ?? right.hod_verified_at ?? right.submitted_at ?? "";
      return rightAt.localeCompare(leftAt);
    })
    .slice(0, 5);

  const insightPoints = [
    monthRemainingMinutes > 0
      ? `Add ${minutesToHHMM(monthRemainingMinutes)} more training to reach the ${monthName(month)} target.`
      : `You have reached the ${monthName(month)} training target.`,
    thresholdRemainingMinutes > 0
      ? `${minutesToHHMM(thresholdRemainingMinutes)} more approved training is needed to reach the yearly minimum threshold.`
      : "You have reached the yearly minimum training threshold.",
    pendingMinutes > 0
      ? `${minutesToHHMM(pendingMinutes)} is awaiting verification and is not counted in approved progress yet.`
      : "No recorded training is currently waiting for verification.",
    latestActiveRequest
      ? `Your latest active request, “${latestActiveRequest.title}”, is ${REQUEST_STATUS_LABELS[latestActiveRequest.status].toLowerCase()}.`
      : "You have no active requests requiring follow-up.",
  ];

  const needsTrainingAction =
    monthRemainingMinutes > 0 || thresholdRemainingMinutes > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            Your training progress and request updates for {monthName(month)} {year}.
          </p>
        </div>

        <Button asChild>
          <Link href={`/training/new?month=${month}&year=${year}`}>
            <Plus className="h-4 w-4" />
            Add training
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Recorded this month"
          value={minutesToHHMM(current?.total_minutes ?? 0)}
          hint={`Target ${targets.monthlyStandardHours}h`}
          icon={Clock}
          tone={monthRemainingMinutes === 0 ? "success" : "default"}
        />
        <StatCard
          label="Approved this year"
          value={minutesToHHMM(approvedMinutes)}
          hint={`Of ${targets.yearlyStandardHours}h yearly standard`}
          icon={Clock}
          tone="success"
        />
        <StatCard
          label="My open requests"
          value={requestAnalytics.active.length}
          hint={`${requestAnalytics.inProgress.length} currently in progress`}
          icon={Inbox}
          tone={requestAnalytics.highPriorityActive.length > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Days to deadline"
          value={daysLeft >= 0 ? daysLeft : "Passed"}
          hint={`${monthName(month)} is due by the ${targets.submissionDeadlineDay}th of ${monthName(month === 12 ? 1 : month + 1)}`}
          icon={CalendarClock}
          tone={
            daysLeft < 0
              ? "destructive"
              : daysLeft <= 3
                ? "warning"
                : "default"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle>My progress for {year}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Only approved hours count toward the yearly targets.
              </p>
            </div>
            <Link
              href={`/training?month=${month}&year=${year}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              Open training
            </Link>
          </CardHeader>
          <CardContent className="space-y-5">
            <TargetProgress
              label="Approved against the yearly standard"
              approvedMinutes={approvedMinutes}
              pendingMinutes={pendingMinutes}
              targetHours={targets.yearlyStandardHours}
            />
            <TargetProgress
              label="Approved against the minimum threshold"
              approvedMinutes={approvedMinutes}
              targetHours={targets.yearlyThresholdHours}
            />
            <TargetProgress
              label={`${monthName(month)} against the monthly target`}
              approvedMinutes={current?.total_minutes ?? 0}
              targetHours={targets.monthlyStandardHours}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle>My requests</CardTitle>
              <p className="text-xs text-muted-foreground">
                Latest request updates
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/requests/new">
                <Plus className="h-4 w-4" />
                New
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No requests yet"
                description="Raise a request for equipment, an office item, or support."
              />
            ) : (
              <ul className="divide-y">
                {requests.slice(0, 4).map((request) => (
                  <li
                    key={request.id}
                    className="space-y-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/requests/${request.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {request.title}
                      </Link>
                      <RequestStatusBadge status={request.status} />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <RequestPriorityBadge priority={request.priority} />
                      <span>
                        {request.estimated_cost_cents > 0
                          ? formatCost(request.estimated_cost_cents)
                          : new Date(request.created_time).toLocaleDateString(
                              "en-MY",
                              { day: "numeric", month: "short" },
                            )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InsightCard
          summary={
            needsTrainingAction
              ? "Your next priority is to complete this month’s record and keep moving toward the yearly minimum."
              : "Your training record is on track, with no immediate gap against the current targets."
          }
          insights={insightPoints}
          scope={`Based only on your training record and ${requests.length} visible requests`}
          badge={needsTrainingAction ? "Next step" : "On track"}
          badgeTone={needsTrainingAction ? "warning" : "success"}
          evidenceHref={`/training?month=${month}&year=${year}`}
        />

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle>Recent training activity</CardTitle>
              <p className="text-xs text-muted-foreground">
                Your latest submission and verification updates.
              </p>
            </div>
            <StatusBadge
              status={current?.status ?? null}
              isLate={current?.is_late ?? false}
            />
          </CardHeader>
          <CardContent>
            {recentTrainingActivity.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="Nothing submitted yet this year"
                description="Record your first training entry and submit the month to start building your record."
                action={
                  <Button size="sm" asChild>
                    <Link href={`/training/new?month=${month}&year=${year}`}>
                      <Plus className="h-4 w-4" />
                      Add training
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {recentTrainingActivity.map((submission) => {
                  const at =
                    submission.hr_verified_at ??
                    submission.hod_verified_at ??
                    submission.submitted_at;

                  return (
                    <li
                      key={submission.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {monthName(submission.month)} {submission.year}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {STATUS_LABELS[submission.status]}
                          {at
                            ? ` · ${new Date(at).toLocaleDateString(undefined, {
                                dateStyle: "medium",
                              })}`
                            : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {minutesToHHMM(submission.total_minutes)}
                        </span>
                        <StatusBadge status={submission.status} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

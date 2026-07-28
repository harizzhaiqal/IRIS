import Link from "next/link";
import { CalendarClock, Clock, Hourglass, Plus } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
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
import { getTargets } from "@/lib/queries/settings";
import {
  getSubmissionForMonth,
  listYearSubmissions,
} from "@/lib/queries/submissions";
import { STATUS_LABELS, type Profile } from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import {
  daysUntilDeadline,
  monthName,
  splitApprovedAndPending,
} from "@/lib/utils/targets";

export async function StaffDashboard({ profile }: { profile: Profile }) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [targets, current, yearSubmissions] = await Promise.all([
    getTargets(),
    getSubmissionForMonth(profile.id, month, year),
    listYearSubmissions(profile.id, year),
  ]);

  const { approvedMinutes, pendingMinutes } =
    splitApprovedAndPending(yearSubmissions);

  const daysLeft = daysUntilDeadline(
    month,
    year,
    targets.submissionDeadlineDay,
    now,
  );

  // Months that have reached a reviewer, most recently first.
  const recentActivity = yearSubmissions
    .filter((submission) => submission.status !== "draft")
    .sort((a, b) => {
      const left = a.hr_verified_at ?? a.hod_verified_at ?? a.submitted_at ?? "";
      const right = b.hr_verified_at ?? b.hod_verified_at ?? b.submitted_at ?? "";
      return right.localeCompare(left);
    })
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            Your training record for {monthName(month)} {year}.
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
        />
        <StatCard
          label="Approved this year"
          value={minutesToHHMM(approvedMinutes)}
          hint={`Of ${targets.yearlyStandardHours}h standard`}
          icon={Clock}
          tone="success"
        />
        <StatCard
          label="Awaiting verification"
          value={minutesToHHMM(pendingMinutes)}
          hint="Not counted until HR approves"
          icon={Hourglass}
          tone={pendingMinutes > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Days to deadline"
          value={daysLeft >= 0 ? daysLeft : "Passed"}
          hint={`${monthName(month)} is due by the ${targets.submissionDeadlineDay}th of ${monthName(month === 12 ? 1 : month + 1)}`}
          icon={CalendarClock}
          tone={daysLeft < 0 ? "destructive" : daysLeft <= 3 ? "warning" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Progress for {year}</CardTitle>
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
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>This month</CardTitle>
            <StatusBadge
              status={current?.status ?? null}
              isLate={current?.is_late ?? false}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {current?.is_nil_return
                ? "You reported no training this month."
                : current
                  ? `${current.records.length} ${current.records.length === 1 ? "entry" : "entries"} recorded.`
                  : "You have not opened this month yet."}
            </p>

            <Button variant="outline" size="sm" asChild className="w-full">
              <Link href={`/training?month=${month}&year=${year}`}>
                Open {monthName(month)}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent verification activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
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
              {recentActivity.map((submission) => {
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
  );
}

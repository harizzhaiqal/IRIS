import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Users,
} from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/training/empty-state";
import { TargetProgress } from "@/components/training/target-progress";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { activityLabel, listRecentActivity } from "@/lib/queries/activity";
import { listDepartments } from "@/lib/queries/departments";
import { listActiveEmployees } from "@/lib/queries/profiles";
import { getTargets } from "@/lib/queries/settings";
import {
  listSubmissions,
  listYearSubmissionsForEmployees,
} from "@/lib/queries/submissions";
import type { Profile } from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import {
  hoursToMinutes,
  isOverdue,
  monthName,
  percentOfTarget,
  splitApprovedAndPending,
} from "@/lib/utils/targets";

export async function HrDashboard({ profile }: { profile: Profile }) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [targets, employees, departments, activity] = await Promise.all([
    getTargets(),
    listActiveEmployees(),
    listDepartments(),
    listRecentActivity(8),
  ]);

  const employeeIds = employees.map((employee) => employee.id);

  const [monthSubmissions, yearSubmissions] = await Promise.all([
    listSubmissions({ month, year }),
    listYearSubmissionsForEmployees(employeeIds, year),
  ]);

  const byEmployeeThisMonth = new Map(
    monthSubmissions.map((row) => [row.employee_id, row]),
  );

  const submittedThisMonth = employees.filter((employee) => {
    const submission = byEmployeeThisMonth.get(employee.id);
    return submission && submission.status !== "draft";
  }).length;

  const pendingHod = monthSubmissions.filter(
    (row) => row.status === "submitted_pending_hod",
  ).length;

  const pendingHr = monthSubmissions.filter(
    (row) => row.status === "hod_verified",
  ).length;

  // Overdue is measured against the previous month, whose deadline has either
  // passed or not; the current month is rarely overdue yet.
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  const previousSubmissions = await listSubmissions({
    month: previousMonth,
    year: previousYear,
  });
  const previousByEmployee = new Map(
    previousSubmissions.map((row) => [row.employee_id, row]),
  );

  const overdue = employees.filter((employee) =>
    isOverdue(
      previousByEmployee.get(employee.id)?.status ?? null,
      previousMonth,
      previousYear,
      targets.submissionDeadlineDay,
      now,
    ),
  ).length;

  const perEmployee = employees.map((employee) => {
    const rows = yearSubmissions.filter((row) => row.employee_id === employee.id);
    const { approvedMinutes, pendingMinutes } = splitApprovedAndPending(rows);

    return { employee, approvedMinutes, pendingMinutes };
  });

  const totalApproved = perEmployee.reduce(
    (sum, entry) => sum + entry.approvedMinutes,
    0,
  );
  const totalPending = perEmployee.reduce(
    (sum, entry) => sum + entry.pendingMinutes,
    0,
  );

  const headcount = Math.max(1, employees.length);
  const companyStandardTarget = hoursToMinutes(targets.yearlyStandardHours) * headcount;
  const companyThresholdTarget = hoursToMinutes(targets.yearlyThresholdHours) * headcount;

  const standardPercent = percentOfTarget(
    totalApproved,
    targets.yearlyStandardHours * headcount,
  );
  const thresholdPercent = percentOfTarget(
    totalApproved,
    targets.yearlyThresholdHours * headcount,
  );

  const departmentStats = departments
    .map((department) => {
      const members = perEmployee.filter(
        (entry) => entry.employee.department_id === department.id,
      );

      if (members.length === 0) return null;

      const approved = members.reduce(
        (sum, entry) => sum + entry.approvedMinutes,
        0,
      );

      return {
        department,
        headcount: members.length,
        averageMinutes: Math.round(approved / members.length),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.averageMinutes - b.averageMinutes);

  const lowest = departmentStats[0] ?? null;

  const submissionRate = Math.round((submittedThisMonth / headcount) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            Company training compliance for {year}.
          </p>
        </div>

        <Button asChild>
          <Link href="/training/submissions">
            <ClipboardList className="h-4 w-4" />
            All submissions
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Submission rate"
          value={`${submissionRate}%`}
          hint={`${submittedThisMonth} of ${employees.length} for ${monthName(month)}`}
          icon={Users}
          tone={submissionRate === 100 ? "success" : "default"}
        />
        <StatCard
          label="Pending HOD"
          value={pendingHod}
          hint={`${monthName(month)} awaiting first verification`}
          icon={ClipboardCheck}
          tone={pendingHod > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Pending HR"
          value={pendingHr}
          hint="Verified and waiting on you"
          icon={ClipboardCheck}
          tone={pendingHr > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Overdue"
          value={overdue}
          hint={`${monthName(previousMonth)} past its deadline`}
          icon={AlertTriangle}
          tone={overdue > 0 ? "destructive" : "success"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Company compliance for {year}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <TargetProgress
              label={`Approved against ${targets.yearlyStandardHours}h per head`}
              approvedMinutes={totalApproved}
              pendingMinutes={totalPending}
              targetHours={targets.yearlyStandardHours * headcount}
            />
            <TargetProgress
              label={`Approved against the ${targets.yearlyThresholdHours}h threshold per head`}
              approvedMinutes={totalApproved}
              targetHours={targets.yearlyThresholdHours * headcount}
            />

            <div className="grid gap-4 border-t pt-4 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Against standard
                </p>
                <p className="text-xl font-semibold tabular-nums">
                  {standardPercent}%
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {minutesToHHMM(totalApproved)} of{" "}
                  {minutesToHHMM(companyStandardTarget)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Against threshold
                </p>
                <p className="text-xl font-semibold tabular-nums">
                  {thresholdPercent}%
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {minutesToHHMM(totalApproved)} of{" "}
                  {minutesToHHMM(companyThresholdTarget)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Awaiting verification
                </p>
                <p className="text-xl font-semibold tabular-nums">
                  {minutesToHHMM(totalPending)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Excluded from the figures above
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By department</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lowest ? (
              <div className="rounded-md border border-warning/50 bg-warning/5 p-3">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  Lowest performing
                </p>
                <p className="mt-1 font-medium">{lowest.department.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {minutesToHHMM(lowest.averageMinutes)} approved per head across{" "}
                  {lowest.headcount}{" "}
                  {lowest.headcount === 1 ? "person" : "people"}
                </p>
              </div>
            ) : null}

            <ul className="divide-y">
              {departmentStats.map((entry) => (
                <li
                  key={entry.department.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{entry.department.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.headcount}{" "}
                      {entry.headcount === 1 ? "person" : "people"}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums">
                    {minutesToHHMM(entry.averageMinutes)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No activity recorded yet"
              description="Submissions and verification decisions appear here as staff and reviewers work through the month."
            />
          ) : (
            <ul className="divide-y">
              {activity.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {activityLabel(entry.action_type)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.description ?? "—"}
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(entry.created_time).toLocaleDateString(undefined, {
                      dateStyle: "medium",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

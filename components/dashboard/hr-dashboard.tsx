import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  Inbox,
  Users,
} from "lucide-react";

import { InsightCard } from "@/components/dashboard/insight-card";
import { CommissionDashboardSummary } from "@/components/dashboard/commission-dashboard-summary";
import { StatCard } from "@/components/dashboard/stat-card";
import { TargetProgress } from "@/components/training/target-progress";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listDepartments } from "@/lib/queries/departments";
import { listActiveEmployees } from "@/lib/queries/profiles";
import { listRequests } from "@/lib/queries/requests";
import { getTargets } from "@/lib/queries/settings";
import {
  listSubmissions,
  listYearSubmissionsForEmployees,
} from "@/lib/queries/submissions";
import {
  REQUEST_CATEGORY_LABELS,
  type Profile,
} from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import { formatCost } from "@/lib/utils/money";
import { getRequestDashboardAnalytics } from "@/lib/utils/request-dashboard";
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
  const isCeo = profile.role === "ceo";

  const [targets, employees, departments, requests] = await Promise.all([
    getTargets(),
    listActiveEmployees(),
    listDepartments(),
    listRequests(),
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
  const missingThisMonth = Math.max(0, employees.length - submittedThisMonth);
  const pendingHod = monthSubmissions.filter(
    (row) => row.status === "submitted_pending_hod",
  ).length;
  const pendingHr = monthSubmissions.filter(
    (row) => row.status === "hod_verified",
  ).length;

  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  const previousSubmissions = await listSubmissions({
    month: previousMonth,
    year: previousYear,
  });
  const previousByEmployee = new Map(
    previousSubmissions.map((row) => [row.employee_id, row]),
  );
  const overdueTraining = employees.filter((employee) =>
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
  const companyStandardTarget =
    hoursToMinutes(targets.yearlyStandardHours) * headcount;
  const companyThresholdTarget =
    hoursToMinutes(targets.yearlyThresholdHours) * headcount;
  const standardPercent = percentOfTarget(
    totalApproved,
    targets.yearlyStandardHours * headcount,
  );
  const thresholdPercent = percentOfTarget(
    totalApproved,
    targets.yearlyThresholdHours * headcount,
  );
  const submissionRate = Math.round((submittedThisMonth / headcount) * 100);

  const departmentStats = departments
    .map((department) => {
      const members = perEmployee.filter(
        (entry) => entry.employee.department_id === department.id,
      );
      if (members.length === 0) return null;

      return {
        department,
        headcount: members.length,
        averageMinutes: Math.round(
          members.reduce((sum, entry) => sum + entry.approvedMinutes, 0) /
            members.length,
        ),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => left.averageMinutes - right.averageMinutes);
  const lowestDepartment = departmentStats[0] ?? null;

  const requestAnalytics = getRequestDashboardAnalytics(requests, now);
  const priorityActions =
    overdueTraining + requestAnalytics.highPriorityActive.length;
  const topCategory = requestAnalytics.topCategory
    ? REQUEST_CATEGORY_LABELS[requestAnalytics.topCategory.category]
    : null;

  const insightPoints = [
    topCategory && requestAnalytics.topCategory
      ? `${topCategory} is the highest-demand request category with ${requestAnalytics.topCategory.count} active requests worth ${formatCost(requestAnalytics.topCategory.costCents)}.`
      : "There are no active request categories requiring comparison.",
    requestAnalytics.highPriorityActive.length > 0
      ? `${requestAnalytics.highPriorityActive.length} high or urgent requests need closer attention.`
      : "There are no high or urgent active requests.",
    lowestDepartment
      ? `${lowestDepartment.department.name} currently has the lowest approved training average at ${minutesToHHMM(lowestDepartment.averageMinutes)} per employee.`
      : "Department training comparison will appear when employee records are available.",
    overdueTraining > 0
      ? `${overdueTraining} ${overdueTraining === 1 ? "employee is" : "employees are"} overdue for ${monthName(previousMonth)}.`
      : `No employees are overdue for ${monthName(previousMonth)}.`,
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            Company training compliance and request operations for {year}.
          </p>
        </div>

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
          label="Pending HR"
          value={pendingHr}
          hint="Verified and waiting for final approval"
          icon={ClipboardCheck}
          tone={pendingHr > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Open requests"
          value={requestAnalytics.active.length}
          hint={`${formatCost(requestAnalytics.estimatedOpenCostCents)} estimated unresolved cost`}
          icon={Inbox}
        />
        <StatCard
          label="Priority actions"
          value={priorityActions}
          hint={`${overdueTraining} overdue training · ${requestAnalytics.highPriorityActive.length} high/urgent requests`}
          icon={AlertTriangle}
          tone={priorityActions > 0 ? "destructive" : "success"}
        />
      </div>

      <CommissionDashboardSummary />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle>Company compliance for {year}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Approved hours count toward compliance; pending hours remain separate.
              </p>
            </div>
            <Link
              href="/training/submissions"
              className="text-xs font-medium text-primary hover:underline"
            >
              View report
            </Link>
          </CardHeader>
          <CardContent className="space-y-5">
            <TargetProgress
              label={`Approved against ${targets.yearlyStandardHours}h per employee`}
              approvedMinutes={totalApproved}
              pendingMinutes={totalPending}
              targetHours={targets.yearlyStandardHours * headcount}
            />
            <TargetProgress
              label={`Approved against the ${targets.yearlyThresholdHours}h minimum threshold`}
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
                  Excluded from approved progress
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle>Request operations</CardTitle>
              <p className="text-xs text-muted-foreground">
                Current company workload
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
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md bg-muted p-3">
                <p className="text-xl font-semibold tabular-nums">
                  {requestAnalytics.pendingApproval.length}
                </p>
                <p className="text-xs text-muted-foreground">Pending approval</p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-xl font-semibold tabular-nums">
                  {requestAnalytics.inProgress.length}
                </p>
                <p className="text-xs text-muted-foreground">In progress</p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-xl font-semibold tabular-nums">
                  {requestAnalytics.highPriorityActive.length}
                </p>
                <p className="text-xs text-muted-foreground">High or urgent</p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-xl font-semibold tabular-nums">
                  {requestAnalytics.recentlyCompleted.length}
                </p>
                <p className="text-xs text-muted-foreground">Completed in 30d</p>
              </div>
            </div>

            <ul className="mt-4 divide-y">
              <li className="flex items-start justify-between gap-3 py-3 first:pt-0">
                <div>
                  <p className="text-sm font-medium">Highest demand</p>
                  <p className="text-xs text-muted-foreground">
                    {topCategory && requestAnalytics.topCategory
                      ? `${topCategory} · ${requestAnalytics.topCategory.count} active`
                      : "No active requests"}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums">
                  {requestAnalytics.topCategory
                    ? formatCost(requestAnalytics.topCategory.costCents)
                    : "—"}
                </span>
              </li>
              <li className="flex items-start justify-between gap-3 py-3 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Oldest unresolved</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {requestAnalytics.oldestActive?.request.title ??
                      "No unresolved requests"}
                  </p>
                </div>
                {requestAnalytics.oldestActive ? (
                  <Badge
                    variant={
                      requestAnalytics.oldestActive.ageDays >= 7
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {requestAnalytics.oldestActive.ageDays === 0
                      ? "Today"
                      : `${requestAnalytics.oldestActive.ageDays}d`}
                  </Badge>
                ) : null}
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InsightCard
          summary={`${submissionRate}% of employees have submitted for ${monthName(month)}, while ${requestAnalytics.active.length} requests remain active.`}
          insights={insightPoints}
          scope={`Based on ${employees.length} active employees and ${requests.length} visible requests`}
          badge={priorityActions > 0 ? "Attention" : "On track"}
          badgeTone={priorityActions > 0 ? "warning" : "success"}
          evidenceHref="/requests"
        />

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle>{isCeo ? "Company watchlist" : "Needs attention"}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {isCeo
                  ? "Items to monitor across the company."
                  : "Items requiring HR follow-up."}
              </p>
            </div>
            <Badge variant={priorityActions > 0 ? "warning" : "success"}>
              {priorityActions}
            </Badge>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              <li className="flex items-center justify-between gap-3 py-3 first:pt-0">
                <div>
                  <p className="text-sm font-medium">Submissions pending HR</p>
                  <p className="text-xs text-muted-foreground">
                    {pendingHod} are still at the HOD stage
                  </p>
                </div>
                <Badge variant={pendingHr > 0 ? "warning" : "success"}>
                  {pendingHr}
                </Badge>
              </li>
              <li className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">High or urgent requests</p>
                  <p className="text-xs text-muted-foreground">
                    Prioritise these in the request queue
                  </p>
                </div>
                <Badge
                  variant={
                    requestAnalytics.highPriorityActive.length > 0
                      ? "destructive"
                      : "success"
                  }
                >
                  {requestAnalytics.highPriorityActive.length}
                </Badge>
              </li>
              <li className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">Overdue training returns</p>
                  <p className="text-xs text-muted-foreground">
                    {monthName(previousMonth)} past its deadline
                  </p>
                </div>
                <Badge variant={overdueTraining > 0 ? "destructive" : "success"}>
                  {overdueTraining}
                </Badge>
              </li>
              <li className="flex items-center justify-between gap-3 py-3 last:pb-0">
                <div>
                  <p className="text-sm font-medium">Missing current submissions</p>
                  <p className="text-xs text-muted-foreground">
                    No filed return yet for {monthName(month)}
                  </p>
                </div>
                <Badge variant={missingThisMonth > 0 ? "secondary" : "success"}>
                  {missingThisMonth}
                </Badge>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

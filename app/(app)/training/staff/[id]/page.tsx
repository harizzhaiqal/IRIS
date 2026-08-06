import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileDown, NotebookPen } from "lucide-react";

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
import { requireRole } from "@/lib/auth";
import { listDepartments } from "@/lib/queries/departments";
import { getProfileById, getProfileName } from "@/lib/queries/profiles";
import { getTargets } from "@/lib/queries/settings";
import { listYearSubmissionsWithRecords } from "@/lib/queries/submissions";
import { filesOwnRecords } from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import { monthName, splitApprovedAndPending } from "@/lib/utils/targets";
import { idParamSchema } from "@/lib/validation/training";
import { MonthPicker } from "../../month-picker";
import { MonthlyTrainingList } from "../../monthly-training-list";

export const metadata = { title: "Employee training — IRIS" };

function resolvePeriod(searchParams: { month?: string; year?: string }) {
  const now = new Date();
  const requestedMonth = Number(searchParams.month);
  const requestedYear = Number(searchParams.year);

  return {
    month:
      requestedMonth >= 1 && requestedMonth <= 12
        ? requestedMonth
        : now.getMonth() + 1,
    year:
      requestedYear >= 2000 && requestedYear <= 2100
        ? requestedYear
        : now.getFullYear(),
  };
}

export default async function EmployeeTrainingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { month?: string; year?: string };
}) {
  const viewer = await requireRole(["hod", "hr_admin", "ceo"]);

  const employeeId = idParamSchema.safeParse(params.id);
  if (!employeeId.success) notFound();

  const employee = await getProfileById(employeeId.data);
  if (!employee || !employee.is_active || !filesOwnRecords(employee.role)) {
    notFound();
  }
  if (viewer.role === "hod" && employee.hod_id !== viewer.id) notFound();

  const { month, year } = resolvePeriod(searchParams);
  const [submissions, targets, departments, hodName] = await Promise.all([
    listYearSubmissionsWithRecords(employee.id, year),
    getTargets(),
    listDepartments(),
    getProfileName(employee.hod_id),
  ]);
  const departmentName =
    departments.find((department) => department.id === employee.department_id)
      ?.name ?? null;
  const selectedSubmission =
    submissions.find((submission) => submission.month === month) ?? null;
  const selectedRecords = selectedSubmission?.records ?? [];
  const trainingCount = submissions.reduce(
    (total, submission) => total + submission.records.length,
    0,
  );
  const yearMinutes = submissions.reduce(
    (total, submission) => total + submission.total_minutes,
    0,
  );
  const { approvedMinutes, pendingMinutes } =
    splitApprovedAndPending(submissions);
  const monthlyGroups = [...submissions]
    .sort((left, right) => right.month - left.month)
    .map((submission) => ({
      id: submission.id,
      month: submission.month,
      year: submission.year,
      status: submission.status,
      isLate: submission.is_late,
      isNilReturn: submission.is_nil_return,
      totalMinutes: submission.total_minutes,
      submittedAt: submission.submitted_at,
      editable: false,
      records: submission.records,
      actionHref: `/training/review/${submission.id}`,
      actionLabel:
        viewer.role === "hod" &&
        submission.status === "submitted_pending_hod"
          ? "Verify"
          : viewer.role === "hr_admin" && submission.status === "hod_verified"
            ? "Review"
          : "View",
    }));
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  const detailPath = `/training/staff/${employee.id}`;
  const exportHref = `/training/export?employeeId=${employee.id}&year=${year}`;
  const backHref =
    viewer.role === "hod" ? "/training/team" : "/training/submissions";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-3">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            Back to staff training
          </Link>
        </Button>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {employee.full_name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {[employee.designation, departmentName, hodName ? `HOD: ${hodName}` : null]
                .filter(Boolean)
                .join(" · ") || "Employee training record"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MonthPicker
              month={month}
              year={year}
              years={years}
              basePath={detailPath}
            />
            <Button variant="outline" size="sm" asChild>
              <a href={exportHref}>
                <FileDown className="h-4 w-4" />
                Download report
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <CardTitle className="mr-auto">
              {monthName(month)} {year}
            </CardTitle>
            <StatusBadge
              status={selectedSubmission?.status ?? null}
              isLate={selectedSubmission?.is_late ?? false}
            />
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Training sessions
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {selectedRecords.length}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Recorded this month
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {minutesToHHMM(selectedSubmission?.total_minutes ?? 0)}
                </p>
              </div>
            </div>
            <TargetProgress
              label="Monthly target"
              approvedMinutes={selectedSubmission?.total_minutes ?? 0}
              targetHours={targets.monthlyStandardHours}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{year} summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total training
                </p>
                <p className="text-xl font-semibold tabular-nums">
                  {trainingCount}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total hours
                </p>
                <p className="text-xl font-semibold tabular-nums">
                  {minutesToHHMM(yearMinutes)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Approved
                </p>
                <p className="font-medium tabular-nums">
                  {minutesToHHMM(approvedMinutes)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Awaiting review
                </p>
                <p className="font-medium tabular-nums">
                  {minutesToHHMM(pendingMinutes)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-1">
            <CardTitle>Training list</CardTitle>
            <p className="text-xs text-muted-foreground">
              All training recorded in {year}, grouped by month.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {monthlyGroups.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title={`No training recorded in ${year}`}
              description={`${employee.full_name} has no training entries for this year.`}
            />
          ) : (
            <MonthlyTrainingList
              groups={monthlyGroups}
              selectedMonth={month}
              showEntryActions={false}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

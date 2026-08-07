import { requireRole } from "@/lib/auth";
import { listDepartments } from "@/lib/queries/departments";
import { listActiveEmployees } from "@/lib/queries/profiles";
import { listEmployeeYearTrainingSummaries } from "@/lib/queries/submissions";
import { filesOwnRecords } from "@/lib/types";
import {
  StaffTrainingDirectory,
  type StaffTrainingDirectoryRow,
} from "../submissions/staff-training-directory";

export const metadata = { title: "Training submissions — IRIS" };

function resolveYear(value?: string) {
  const requested = Number(value);
  return Number.isInteger(requested) && requested >= 2000 && requested <= 2100
    ? requested
    : new Date().getFullYear();
}

export default async function HrTrainingApprovalsPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  await requireRole(["hr_admin"]);

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = resolveYear(searchParams.year);
  const [allEmployees, departments] = await Promise.all([
    listActiveEmployees(),
    listDepartments(),
  ]);
  const employees = allEmployees.filter((employee) =>
    filesOwnRecords(employee.role),
  );
  const summaries = await listEmployeeYearTrainingSummaries(
    employees.map((employee) => employee.id),
    year,
  );
  const departmentNames = new Map(
    departments.map((department) => [department.id, department.name]),
  );
  const totals = new Map<number, { trainingCount: number; minutes: number }>();

  for (const summary of summaries) {
    const current = totals.get(summary.employee_id) ?? {
      trainingCount: 0,
      minutes: 0,
    };
    current.trainingCount += summary.records?.length ?? 0;
    current.minutes += summary.total_minutes;
    totals.set(summary.employee_id, current);
  }

  const rows: StaffTrainingDirectoryRow[] = employees.map((employee) => {
    const employeeTotals = totals.get(employee.id) ?? {
      trainingCount: 0,
      minutes: 0,
    };
    const nextApproval = summaries
      .filter(
        (summary) =>
          summary.employee_id === employee.id &&
          summary.status === "hod_verified",
      )
      .sort((left, right) => left.month - right.month)[0];

    return {
      id: employee.id,
      fullName: employee.full_name,
      email: employee.email,
      designation: employee.designation,
      departmentId: employee.department_id,
      departmentName: employee.department_id
        ? departmentNames.get(employee.department_id) ?? null
        : null,
      trainingCount: employeeTotals.trainingCount,
      totalMinutes: employeeTotals.minutes,
      reviewHref: nextApproval
        ? `/training/review/${nextApproval.id}`
        : null,
      detailHref: `/training/staff/${employee.id}?month=${month}&year=${year}`,
      exportHref: `/training/export?employeeId=${employee.id}&year=${year}`,
    };
  });
  const currentYear = now.getFullYear();
  const years = Array.from(
    new Set([year, currentYear - 2, currentYear - 1, currentYear, currentYear + 1]),
  ).sort((left, right) => right - left);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Training submissions
        </h1>
        <p className="text-sm text-muted-foreground">
          Review company training submissions and give final HR approval.
        </p>
      </div>

      <StaffTrainingDirectory
        rows={rows}
        departments={departments}
        year={year}
        years={years}
        reviewAction="approve"
      />
    </div>
  );
}

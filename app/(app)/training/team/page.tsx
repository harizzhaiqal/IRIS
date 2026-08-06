import { requireRole } from "@/lib/auth";
import { listDepartments } from "@/lib/queries/departments";
import { listTeamMembers } from "@/lib/queries/profiles";
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

export default async function TeamTrainingPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const profile = await requireRole(["hod"]);
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = resolveYear(searchParams.year);
  const [allTeamMembers, departments] = await Promise.all([
    listTeamMembers(profile.id),
    listDepartments(),
  ]);
  const team = allTeamMembers.filter((member) =>
    filesOwnRecords(member.role),
  );
  const summaries = await listEmployeeYearTrainingSummaries(
    team.map((member) => member.id),
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

  const rows: StaffTrainingDirectoryRow[] = team.map((member) => {
    const employeeTotals = totals.get(member.id) ?? {
      trainingCount: 0,
      minutes: 0,
    };
    const nextVerification = summaries
      .filter(
        (summary) =>
          summary.employee_id === member.id &&
          summary.status === "submitted_pending_hod",
      )
      .sort((left, right) => left.month - right.month)[0];

    return {
      id: member.id,
      fullName: member.full_name,
      email: member.email,
      designation: member.designation,
      departmentId: member.department_id,
      departmentName: member.department_id
        ? departmentNames.get(member.department_id) ?? null
        : null,
      trainingCount: employeeTotals.trainingCount,
      totalMinutes: employeeTotals.minutes,
      verifyHref: nextVerification
        ? `/training/review/${nextVerification.id}`
        : null,
      detailHref: `/training/staff/${member.id}?month=${month}&year=${year}`,
      exportHref: `/training/export?employeeId=${member.id}&year=${year}`,
    };
  });
  const teamDepartmentIds = new Set(
    team
      .map((member) => member.department_id)
      .filter((id): id is number => id !== null),
  );
  const teamDepartments = departments.filter((department) =>
    teamDepartmentIds.has(department.id),
  );
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
          Review team training, view yearly records, and download reports.
        </p>
      </div>

      <StaffTrainingDirectory
        rows={rows}
        departments={teamDepartments}
        year={year}
        years={years}
        showVerifyAction
      />
    </div>
  );
}

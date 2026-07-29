import { ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/training/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { listDepartments } from "@/lib/queries/departments";
import { listActiveEmployees } from "@/lib/queries/users";
import { listSubmissions } from "@/lib/queries/submissions";
import { STATUS_LABELS, type SubmissionStatus } from "@/lib/types";
import { SubmissionFilters } from "./filters";
import { SubmissionsTable, type SubmissionRow } from "./submissions-table";

export const metadata = { title: "All submissions — IRIS" };

const STATUS_ORDER: SubmissionStatus[] = [
  "draft",
  "submitted_pending_hod",
  "hod_verified",
  "approved",
  "returned_by_hod",
  "rejected",
];

function parseStatus(value?: string): SubmissionStatus | null {
  return value && STATUS_ORDER.includes(value as SubmissionStatus)
    ? (value as SubmissionStatus)
    : null;
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: {
    month?: string;
    year?: string;
    department?: string;
    status?: string;
    employee?: string;
  };
}) {
  await requireRole(["hr_admin"]);
  const now = new Date();

  const monthParam = Number(searchParams.month);
  const yearParam = Number(searchParams.year);

  const month = monthParam >= 1 && monthParam <= 12 ? monthParam : null;
  const year = yearParam >= 2000 && yearParam <= 2100 ? yearParam : null;
  const departmentId = searchParams.department ?? null;
  const status = parseStatus(searchParams.status);
  const employeeId = searchParams.employee ?? null;

  const [departments, employees, submissions] = await Promise.all([
    listDepartments(),
    listActiveEmployees(),
    listSubmissions({ month, year, departmentId, status, employeeId }),
  ]);

  const counts = STATUS_ORDER.map((key) => ({
    key,
    label: STATUS_LABELS[key],
    count: submissions.filter((row) => row.status === key).length,
  }));

  const rows: SubmissionRow[] = submissions.map((row) => ({
    id: row.id,
    month: row.month,
    year: row.year,
    status: row.status,
    is_late: row.is_late,
    is_nil_return: row.is_nil_return,
    total_minutes: row.total_minutes,
    employeeName: row.employee?.full_name ?? "Unknown employee",
    departmentName: row.employee?.department?.name ?? null,
  }));

  const currentYear = now.getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">All submissions</h1>
        <p className="text-sm text-muted-foreground">
          Company-wide training records and their verification stage.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <SubmissionFilters
            month={month}
            year={year}
            departmentId={departmentId}
            status={status}
            employeeId={employeeId}
            years={years}
            departments={departments}
            employees={employees.map((employee) => ({
              id: employee.id,
              full_name: employee.full_name,
            }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {counts.map((entry) => (
          <Card key={entry.key}>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {entry.label}
              </p>
              <p className="text-2xl font-semibold tabular-nums">{entry.count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {rows.length} {rows.length === 1 ? "submission" : "submissions"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Nothing matches these filters"
              description="Widen the month, department, or status filter to see more submissions."
            />
          ) : (
            <SubmissionsTable rows={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

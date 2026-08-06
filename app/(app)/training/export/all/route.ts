import { NextResponse } from "next/server";

import { requireProfile } from "@/lib/auth";
import { logAction } from "@/lib/automationLog";
import {
  type ExportInput,
  type ExportMonth,
} from "@/lib/excel/trainingWorkbook";
import {
  buildTrainingReportArchive,
  trainingReportArchiveFilename,
} from "@/lib/excel/trainingReportArchive";
import { listDepartments } from "@/lib/queries/departments";
import { listActiveEmployees } from "@/lib/queries/profiles";
import { getTargets } from "@/lib/queries/settings";
import { listYearSubmissionsWithRecordsForEmployees } from "@/lib/queries/submissions";
import { filesOwnRecords } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseYear(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("year"));
  return Number.isInteger(requested) && requested >= 2000 && requested <= 2100
    ? requested
    : new Date().getFullYear();
}

export async function GET(request: Request) {
  const viewer = await requireProfile();
  if (viewer.role !== "hr_admin" && viewer.role !== "ceo") {
    return NextResponse.json(
      { error: "Only HR administrators may download all staff reports." },
      { status: 403 },
    );
  }

  const year = parseYear(request);
  const [allEmployees, departments, targets] = await Promise.all([
    listActiveEmployees(),
    listDepartments(),
    getTargets(),
  ]);
  const employees = allEmployees.filter((employee) =>
    filesOwnRecords(employee.role),
  );
  const submissions = await listYearSubmissionsWithRecordsForEmployees(
    employees.map((employee) => employee.id),
    year,
  );
  const departmentNames = new Map(
    departments.map((department) => [department.id, department.name]),
  );
  const profileNames = new Map(
    allEmployees.map((profile) => [profile.id, profile.full_name]),
  );

  const inputs: ExportInput[] = employees.map((employee) => {
    const employeeSubmissions = submissions.filter(
      (submission) => submission.employee_id === employee.id,
    );
    const months: ExportMonth[] = employeeSubmissions.map((submission) => ({
      month: submission.month,
      status: submission.status,
      isNilReturn: submission.is_nil_return,
      isLate: submission.is_late,
      totalMinutes: submission.total_minutes,
      hodVerifiedBy: submission.hod_verifier?.full_name ?? null,
      hodVerifiedAt: submission.hod_verified_at,
      hrVerifiedBy: submission.hr_verifier?.full_name ?? null,
      hrVerifiedAt: submission.hr_verified_at,
      entries: submission.records.map((record) => ({
        seqNo: record.seq_no,
        title: record.title,
        startDatetime: record.start_datetime,
        endDatetime: record.end_datetime,
        calculatedMinutes: record.calculated_minutes,
        recordedMinutes: record.recorded_minutes,
        overrideReason: record.override_reason,
        location: record.location,
        trainerProvider: record.trainer_provider,
        effectiveness: record.effectiveness,
        remarks: record.remarks,
      })),
    }));

    return {
      employee: {
        fullName: employee.full_name,
        email: employee.email,
        designation: employee.designation,
        department: employee.department_id
          ? departmentNames.get(employee.department_id) ?? null
          : null,
        hodName: employee.hod_id
          ? profileNames.get(employee.hod_id) ?? null
          : null,
        dateJoined: employee.date_joined,
      },
      year,
      months,
      targets,
    };
  });

  const buffer = await buildTrainingReportArchive(inputs, year);

  await logAction({
    actionType: "training.bulk_exported",
    description: `${viewer.full_name} exported all ${year} staff training reports`,
    relatedTable: "training_submissions",
    performedBy: viewer.id,
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${trainingReportArchiveFilename(year)}"`,
      "Cache-Control": "no-store",
    },
  });
}

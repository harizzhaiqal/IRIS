import { NextResponse } from "next/server";

import { requireProfile } from "@/lib/auth";
import { logAction } from "@/lib/automationLog";
import { filesOwnRecords } from "@/lib/types";
import {
  buildTrainingWorkbook,
  workbookFilename,
  type ExportMonth,
} from "@/lib/excel/trainingWorkbook";
import { listDepartments } from "@/lib/queries/departments";
import { getProfileById, getProfileName } from "@/lib/queries/profiles";
import { getTargets } from "@/lib/queries/settings";
import { listYearSubmissionsWithRecords } from "@/lib/queries/submissions";

/**
 * Downloads a year of training as form IRS-HR-F14. Staff may download only
 * their own record; a HOD may download direct reports; HR and the CEO may
 * select any employee who keeps a training record.
 */
export async function GET(request: Request) {
  const profile = await requireProfile();
  const url = new URL(request.url);
  const requestedEmployee = url.searchParams.get("employeeId");
  let employee = profile;

  if (requestedEmployee !== null) {
    const employeeId = Number(requestedEmployee);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return NextResponse.json(
        { error: "Choose a valid employee." },
        { status: 400 },
      );
    }

    const selectedEmployee = await getProfileById(employeeId);
    if (!selectedEmployee || !filesOwnRecords(selectedEmployee.role)) {
      return NextResponse.json(
        { error: "Employee training record not found." },
        { status: 404 },
      );
    }
    const mayDownloadSelectedEmployee =
      employeeId === profile.id ||
      profile.role === "hr_admin" ||
      profile.role === "ceo" ||
      (profile.role === "hod" && selectedEmployee.hod_id === profile.id);
    if (!mayDownloadSelectedEmployee) {
      return NextResponse.json(
        { error: "You do not have access to this employee's training report." },
        { status: 403 },
      );
    }
    employee = selectedEmployee;
  } else if (!filesOwnRecords(profile.role)) {
    return NextResponse.json(
      { error: "Choose an employee before downloading a training report." },
      { status: 403 },
    );
  }

  const requested = Number(url.searchParams.get("year"));
  const year =
    Number.isInteger(requested) && requested >= 2000 && requested <= 2100
      ? requested
      : new Date().getFullYear();

  const [submissions, targets] = await Promise.all([
    listYearSubmissionsWithRecords(employee.id, year),
    getTargets(),
  ]);

  const [hodName, departments] = await Promise.all([
    getProfileName(employee.hod_id),
    // Only needed when the year is empty; the joined rows carry the name
    // otherwise. Cheap enough that branching on it is not worth the noise.
    listDepartments(),
  ]);

  const departmentName =
    submissions[0]?.employee?.department?.name ??
    departments.find((d) => d.id === employee.department_id)?.name ??
    null;

  const months: ExportMonth[] = submissions.map((submission) => ({
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

  const workbook = buildTrainingWorkbook({
    employee: {
      fullName: employee.full_name,
      email: employee.email,
      designation: employee.designation,
      department: departmentName,
      hodName,
      dateJoined: employee.date_joined,
    },
    year,
    months,
    targets,
  });

  const buffer = await workbook.xlsx.writeBuffer();

  await logAction({
    actionType: "training.exported",
    description:
      employee.id === profile.id
        ? `${profile.full_name} exported ${year} training records`
        : `${profile.full_name} exported ${employee.full_name}'s ${year} training records`,
    relatedTable: "training_submissions",
    performedBy: profile.id,
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${workbookFilename(employee.full_name, year)}"`,
      // A record that changes as the month is edited must not be cached.
      "Cache-Control": "no-store",
    },
  });
}

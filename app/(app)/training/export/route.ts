import { NextResponse } from "next/server";

import { requireProfile } from "@/lib/auth";
import { logAction } from "@/lib/automationLog";
import {
  buildTrainingWorkbook,
  workbookFilename,
  type ExportMonth,
} from "@/lib/excel/trainingWorkbook";
import { listDepartments } from "@/lib/queries/departments";
import { getProfileName } from "@/lib/queries/profiles";
import { getTargets } from "@/lib/queries/settings";
import { listYearSubmissionsWithRecords } from "@/lib/queries/submissions";

/**
 * Downloads a year of the signed-in employee's training as form IRS-HR-F14.
 *
 * The year is read from the query string, but the employee never is: the export
 * is always the caller's own record. RLS would filter someone else's rows away
 * regardless, and not accepting the parameter means there is no id to guess at.
 */
export async function GET(request: Request) {
  const profile = await requireProfile();

  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("year"));
  const year =
    Number.isInteger(requested) && requested >= 2000 && requested <= 2100
      ? requested
      : new Date().getFullYear();

  const [submissions, targets] = await Promise.all([
    listYearSubmissionsWithRecords(profile.id, year),
    getTargets(),
  ]);

  const [hodName, departments] = await Promise.all([
    getProfileName(profile.hod_id),
    // Only needed when the year is empty; the joined rows carry the name
    // otherwise. Cheap enough that branching on it is not worth the noise.
    listDepartments(),
  ]);

  const departmentName =
    submissions[0]?.employee?.department?.name ??
    departments.find((d) => d.id === profile.department_id)?.name ??
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
      fullName: profile.full_name,
      email: profile.email,
      designation: profile.designation,
      department: departmentName,
      hodName,
      dateJoined: profile.date_joined,
    },
    year,
    months,
    targets,
  });

  const buffer = await workbook.xlsx.writeBuffer();

  await logAction({
    actionType: "training.exported",
    description: `${profile.full_name} exported ${year} training records`,
    relatedTable: "training_submissions",
    performedBy: profile.id,
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${workbookFilename(profile.full_name, year)}"`,
      // A record that changes as the month is edited must not be cached.
      "Cache-Control": "no-store",
    },
  });
}

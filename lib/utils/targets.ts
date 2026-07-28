import type { SubmissionStatus } from "@/lib/types";

const MINUTES_PER_HOUR = 60;

export type Targets = {
  monthlyStandardHours: number;
  yearlyStandardHours: number;
  yearlyThresholdHours: number;
  submissionDeadlineDay: number;
};

export const DEFAULT_TARGETS: Targets = {
  monthlyStandardHours: 4,
  yearlyStandardHours: 48,
  yearlyThresholdHours: 36,
  submissionDeadlineDay: 10,
};

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * MINUTES_PER_HOUR);
}

/**
 * Attainment against a target, as a percentage rounded to one decimal place.
 * Not capped at 100: exceeding the minimum threshold is meaningful and is
 * shown as such.
 */
export function percentOfTarget(
  actualMinutes: number,
  targetHours: number,
): number {
  const targetMinutes = hoursToMinutes(targetHours);
  if (targetMinutes <= 0) return 0;

  return Math.round((actualMinutes / targetMinutes) * 1000) / 10;
}

/** Percentage clamped to 0-100, for driving a progress bar's width. */
export function progressPercent(
  actualMinutes: number,
  targetHours: number,
): number {
  return Math.min(100, Math.max(0, percentOfTarget(actualMinutes, targetHours)));
}

export type YearlyCompliance = {
  standardPercent: number;
  thresholdPercent: number;
  meetsStandard: boolean;
  meetsThreshold: boolean;
  remainingToStandardMinutes: number;
  remainingToThresholdMinutes: number;
};

export function yearlyCompliance(
  approvedMinutes: number,
  targets: Targets = DEFAULT_TARGETS,
): YearlyCompliance {
  const standardMinutes = hoursToMinutes(targets.yearlyStandardHours);
  const thresholdMinutes = hoursToMinutes(targets.yearlyThresholdHours);

  return {
    standardPercent: percentOfTarget(approvedMinutes, targets.yearlyStandardHours),
    thresholdPercent: percentOfTarget(approvedMinutes, targets.yearlyThresholdHours),
    meetsStandard: approvedMinutes >= standardMinutes,
    meetsThreshold: approvedMinutes >= thresholdMinutes,
    remainingToStandardMinutes: Math.max(0, standardMinutes - approvedMinutes),
    remainingToThresholdMinutes: Math.max(0, thresholdMinutes - approvedMinutes),
  };
}

export function meetsMonthlyTarget(
  approvedMinutes: number,
  targets: Targets = DEFAULT_TARGETS,
): boolean {
  return approvedMinutes >= hoursToMinutes(targets.monthlyStandardHours);
}

/**
 * The moment a month's record stops being on time: end of the deadline day in
 * the following month.
 */
export function submissionDeadline(
  month: number,
  year: number,
  deadlineDay: number = DEFAULT_TARGETS.submissionDeadlineDay,
): Date {
  const deadlineMonth = month === 12 ? 0 : month;
  const deadlineYear = month === 12 ? year + 1 : year;

  return new Date(deadlineYear, deadlineMonth, deadlineDay, 23, 59, 59, 999);
}

/**
 * Whole days left before the deadline. Zero means the deadline falls today;
 * a negative number means it has passed.
 */
export function daysUntilDeadline(
  month: number,
  year: number,
  deadlineDay: number = DEFAULT_TARGETS.submissionDeadlineDay,
  now: Date = new Date(),
): number {
  const deadline = submissionDeadline(month, year, deadlineDay);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadlineDate = new Date(
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate(),
  );

  return Math.round(
    (deadlineDate.getTime() - startOfToday.getTime()) / 86_400_000,
  );
}

/** Whether a submission made at the given moment missed its deadline. */
export function isLateSubmission(
  submittedAt: Date | string,
  month: number,
  year: number,
  deadlineDay: number = DEFAULT_TARGETS.submissionDeadlineDay,
): boolean {
  const submitted =
    submittedAt instanceof Date ? submittedAt : new Date(submittedAt);

  if (Number.isNaN(submitted.getTime())) return false;

  return submitted.getTime() > submissionDeadline(month, year, deadlineDay).getTime();
}

/**
 * A month is overdue when its deadline has passed and it has not reached a
 * reviewer yet. Draft counts as overdue: nothing has been submitted.
 */
export function isOverdue(
  status: SubmissionStatus | null,
  month: number,
  year: number,
  deadlineDay: number = DEFAULT_TARGETS.submissionDeadlineDay,
  now: Date = new Date(),
): boolean {
  const pastDeadline =
    now.getTime() > submissionDeadline(month, year, deadlineDay).getTime();

  if (!pastDeadline) return false;

  return (
    status === null ||
    status === "draft" ||
    status === "returned_by_hod" ||
    status === "rejected"
  );
}

/** Only fully approved hours count toward compliance. */
export function isApproved(status: SubmissionStatus): boolean {
  return status === "approved";
}

/** Submitted but not yet through both verification stages. */
export function isPendingVerification(status: SubmissionStatus): boolean {
  return status === "submitted_pending_hod" || status === "hod_verified";
}

/**
 * Splits a set of submissions into approved minutes, which count toward
 * targets, and pending minutes, which do not. Keeping these apart is the
 * point: an unverified total must never be presented as compliance.
 */
export function splitApprovedAndPending(
  submissions: { status: SubmissionStatus; total_minutes: number }[],
): { approvedMinutes: number; pendingMinutes: number } {
  let approvedMinutes = 0;
  let pendingMinutes = 0;

  for (const submission of submissions) {
    if (isApproved(submission.status)) {
      approvedMinutes += submission.total_minutes;
    } else if (isPendingVerification(submission.status)) {
      pendingMinutes += submission.total_minutes;
    }
  }

  return { approvedMinutes, pendingMinutes };
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

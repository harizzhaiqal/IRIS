import { describe, expect, it } from "vitest";

import {
  DEFAULT_TARGETS,
  daysUntilDeadline,
  isLateSubmission,
  isOverdue,
  meetsMonthlyTarget,
  percentOfTarget,
  progressPercent,
  splitApprovedAndPending,
  submissionDeadline,
  yearlyCompliance,
} from "./targets";

describe("percentOfTarget", () => {
  it("reports a year of 39h45m against both yearly targets", () => {
    const minutes = 39 * 60 + 45;

    expect(minutes).toBe(2385);
    expect(percentOfTarget(minutes, DEFAULT_TARGETS.yearlyStandardHours)).toBe(
      82.8,
    );
    expect(percentOfTarget(minutes, DEFAULT_TARGETS.yearlyThresholdHours)).toBe(
      110.4,
    );
  });

  it("rounds to one decimal place", () => {
    expect(percentOfTarget(240, 4)).toBe(100);
    expect(percentOfTarget(0, 48)).toBe(0);
    expect(percentOfTarget(2881, 48)).toBe(100);
  });

  it("returns zero for a non-positive target rather than dividing by zero", () => {
    expect(percentOfTarget(600, 0)).toBe(0);
  });
});

describe("progressPercent", () => {
  it("clamps to 100 for a bar width while the raw figure may exceed it", () => {
    const minutes = 39 * 60 + 45;

    expect(progressPercent(minutes, DEFAULT_TARGETS.yearlyThresholdHours)).toBe(
      100,
    );
    expect(percentOfTarget(minutes, DEFAULT_TARGETS.yearlyThresholdHours)).toBe(
      110.4,
    );
  });
});

describe("yearlyCompliance", () => {
  it("clears the threshold but not the standard at 39h45m", () => {
    const result = yearlyCompliance(2385);

    expect(result.standardPercent).toBe(82.8);
    expect(result.thresholdPercent).toBe(110.4);
    expect(result.meetsThreshold).toBe(true);
    expect(result.meetsStandard).toBe(false);
    expect(result.remainingToStandardMinutes).toBe(495);
    expect(result.remainingToThresholdMinutes).toBe(0);
  });

  it("treats hitting a target exactly as meeting it", () => {
    expect(yearlyCompliance(2880).meetsStandard).toBe(true);
    expect(yearlyCompliance(2160).meetsThreshold).toBe(true);
  });

  it("honours targets overridden from app_settings", () => {
    const result = yearlyCompliance(2385, {
      ...DEFAULT_TARGETS,
      yearlyStandardHours: 40,
    });

    expect(result.standardPercent).toBe(99.4);
    expect(result.meetsStandard).toBe(false);
  });
});

describe("meetsMonthlyTarget", () => {
  it("compares against the 4 hour monthly standard", () => {
    expect(meetsMonthlyTarget(239)).toBe(false);
    expect(meetsMonthlyTarget(240)).toBe(true);
  });
});

describe("submissionDeadline", () => {
  it("falls on the 10th of the following month", () => {
    const deadline = submissionDeadline(2, 2026);

    expect(deadline.getFullYear()).toBe(2026);
    expect(deadline.getMonth()).toBe(2);
    expect(deadline.getDate()).toBe(10);
  });

  it("rolls December into the next year", () => {
    const deadline = submissionDeadline(12, 2026);

    expect(deadline.getFullYear()).toBe(2027);
    expect(deadline.getMonth()).toBe(0);
    expect(deadline.getDate()).toBe(10);
  });
});

describe("daysUntilDeadline", () => {
  it("counts down to the deadline and goes negative past it", () => {
    expect(daysUntilDeadline(2, 2026, 10, new Date(2026, 2, 1))).toBe(9);
    expect(daysUntilDeadline(2, 2026, 10, new Date(2026, 2, 10))).toBe(0);
    expect(daysUntilDeadline(2, 2026, 10, new Date(2026, 2, 13))).toBe(-3);
  });
});

describe("isLateSubmission", () => {
  it("allows the whole of the deadline day", () => {
    expect(isLateSubmission(new Date(2026, 2, 10, 23, 59), 2, 2026)).toBe(false);
    expect(isLateSubmission(new Date(2026, 2, 11, 0, 1), 2, 2026)).toBe(true);
  });
});

describe("isOverdue", () => {
  const afterDeadline = new Date(2026, 2, 15);
  const beforeDeadline = new Date(2026, 2, 5);

  it("flags months never submitted or reopened once the deadline passes", () => {
    expect(isOverdue(null, 2, 2026, 10, afterDeadline)).toBe(true);
    expect(isOverdue("draft", 2, 2026, 10, afterDeadline)).toBe(true);
    expect(isOverdue("returned_by_hod", 2, 2026, 10, afterDeadline)).toBe(true);
    expect(isOverdue("rejected", 2, 2026, 10, afterDeadline)).toBe(true);
  });

  it("does not flag months already with a reviewer or approved", () => {
    expect(isOverdue("submitted_pending_hod", 2, 2026, 10, afterDeadline)).toBe(
      false,
    );
    expect(isOverdue("hod_verified", 2, 2026, 10, afterDeadline)).toBe(false);
    expect(isOverdue("approved", 2, 2026, 10, afterDeadline)).toBe(false);
  });

  it("does not flag anything before the deadline", () => {
    expect(isOverdue("draft", 2, 2026, 10, beforeDeadline)).toBe(false);
  });
});

describe("splitApprovedAndPending", () => {
  it("counts only approved hours toward compliance", () => {
    const result = splitApprovedAndPending([
      { status: "approved", total_minutes: 240 },
      { status: "approved", total_minutes: 300 },
      { status: "hod_verified", total_minutes: 180 },
      { status: "submitted_pending_hod", total_minutes: 120 },
      { status: "draft", total_minutes: 600 },
      { status: "returned_by_hod", total_minutes: 90 },
      { status: "rejected", total_minutes: 400 },
    ]);

    expect(result.approvedMinutes).toBe(540);
    expect(result.pendingMinutes).toBe(300);
  });

  it("returns zeroes for an empty year", () => {
    expect(splitApprovedAndPending([])).toEqual({
      approvedMinutes: 0,
      pendingMinutes: 0,
    });
  });
});

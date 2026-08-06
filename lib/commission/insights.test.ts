import { describe, expect, it } from "vitest";

import { getCommissionFollowUpSuggestion } from "@/lib/commission/insights";
import type { CommissionRecord } from "@/lib/types";

function record(
  id: number,
  overrides: Partial<CommissionRecord> = {},
): CommissionRecord {
  return {
    id,
    employeeId: id,
    employeeName: `Employee ${id}`,
    department: "Sales",
    commissionMonth: 7,
    commissionYear: 2026,
    pdfFileName: `Commission_${id}.pdf`,
    uploadedBy: "HR Admin",
    uploadedAt: "2026-07-28T01:00:00.000Z",
    status: "PDF Uploaded",
    reminderCount: 0,
    createdAt: "2026-07-28T01:00:00.000Z",
    updatedAt: "2026-07-28T01:00:00.000Z",
    ...overrides,
  };
}

describe("getCommissionFollowUpSuggestion", () => {
  it("prioritises staff who have not viewed an emailed PDF", () => {
    const suggestion = getCommissionFollowUpSuggestion([
      record(1, {
        emailSentAt: "2026-07-28T02:00:00.000Z",
        status: "Email Sent",
      }),
      record(2, {
        emailSentAt: "2026-07-28T02:00:00.000Z",
        status: "Not Viewed",
      }),
      record(3),
    ]);

    expect(suggestion.actionNeeded).toBe(true);
    expect(suggestion.summary).toContain("2 staff");
    expect(suggestion.details.join(" ")).toContain("send a reminder");
    expect(suggestion.details.join(" ")).toContain("not been marked as emailed");
  });

  it("suggests acknowledgement follow-up after viewing", () => {
    const suggestion = getCommissionFollowUpSuggestion([
      record(1, {
        emailSentAt: "2026-07-28T02:00:00.000Z",
        viewedAt: "2026-07-28T03:00:00.000Z",
        status: "Viewed",
      }),
    ]);

    expect(suggestion.summary).toContain("acknowledgement follow-up");
  });

  it("reports no action when every record is acknowledged", () => {
    const suggestion = getCommissionFollowUpSuggestion([
      record(1, {
        emailSentAt: "2026-07-28T02:00:00.000Z",
        viewedAt: "2026-07-28T03:00:00.000Z",
        acknowledgedAt: "2026-07-28T03:05:00.000Z",
        status: "Acknowledged",
      }),
    ]);

    expect(suggestion.actionNeeded).toBe(false);
    expect(suggestion.summary).toContain("No follow-up is needed");
  });
});

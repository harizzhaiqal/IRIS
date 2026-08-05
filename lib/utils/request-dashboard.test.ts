import { describe, expect, it } from "vitest";

import type { RequestListItem } from "@/lib/queries/requests";
import { getRequestDashboardAnalytics } from "@/lib/utils/request-dashboard";

function request(
  values: Partial<RequestListItem> & Pick<RequestListItem, "id" | "status">,
): RequestListItem {
  // id and status are not defaulted here: Pick makes them required on values,
  // and the spread below would overwrite anything set for them anyway.
  return {
    requester_id: 1,
    title: `Request ${values.id}`,
    description: "Test request",
    category: "other",
    estimated_cost_cents: 0,
    attachment_path: null,
    attachment_name: null,
    priority: "normal",
    assigned_department: null,
    approval_required: true,
    ai_suggestion: null,
    reviewed_by: null,
    reviewed_at: null,
    review_comment: null,
    created_time: "2026-08-01T00:00:00.000Z",
    modified_time: "2026-08-01T00:00:00.000Z",
    requester: null,
    ...values,
  } as RequestListItem;
}

describe("getRequestDashboardAnalytics", () => {
  it("separates active work and derives cost, age, category and recent completion", () => {
    const rows = [
      request({
        id: 1,
        status: "pending_approval",
        priority: "urgent",
        category: "it_equipment",
        estimated_cost_cents: 80_000,
        created_time: "2026-07-25T00:00:00.000Z",
      }),
      request({
        id: 2,
        status: "in_progress",
        priority: "normal",
        category: "it_equipment",
        estimated_cost_cents: 30_000,
        created_time: "2026-08-03T00:00:00.000Z",
      }),
      request({
        id: 3,
        status: "completed",
        modified_time: "2026-08-02T00:00:00.000Z",
      }),
      request({
        id: 4,
        status: "completed",
        modified_time: "2026-05-01T00:00:00.000Z",
      }),
    ];

    const result = getRequestDashboardAnalytics(
      rows,
      new Date("2026-08-05T00:00:00.000Z"),
    );

    expect(result.active.map((row) => row.id)).toEqual([1, 2]);
    expect(result.pendingApproval.map((row) => row.id)).toEqual([1]);
    expect(result.inProgress.map((row) => row.id)).toEqual([2]);
    expect(result.highPriorityActive.map((row) => row.id)).toEqual([1]);
    expect(result.recentlyCompleted.map((row) => row.id)).toEqual([3]);
    expect(result.estimatedOpenCostCents).toBe(110_000);
    expect(result.oldestActive).toMatchObject({
      request: { id: 1 },
      ageDays: 11,
    });
    expect(result.topCategory).toEqual({
      category: "it_equipment",
      count: 2,
      costCents: 110_000,
    });
  });

  it("returns empty summaries when there is no active work", () => {
    const result = getRequestDashboardAnalytics([], new Date("2026-08-05"));

    expect(result.active).toEqual([]);
    expect(result.estimatedOpenCostCents).toBe(0);
    expect(result.oldestActive).toBeNull();
    expect(result.topCategory).toBeNull();
  });
});

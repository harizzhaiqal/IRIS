import type { RequestListItem } from "@/lib/queries/requests";
import { ACTIVE_REQUEST_STATUSES } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RequestDashboardAnalytics = {
  active: RequestListItem[];
  pendingApproval: RequestListItem[];
  inProgress: RequestListItem[];
  recentlyCompleted: RequestListItem[];
  highPriorityActive: RequestListItem[];
  estimatedOpenCostCents: number;
  oldestActive: { request: RequestListItem; ageDays: number } | null;
  topCategory: {
    category: RequestListItem["category"];
    count: number;
    costCents: number;
  } | null;
};

function ageInDays(createdTime: string, now: Date): number {
  return Math.max(
    0,
    Math.floor((now.getTime() - new Date(createdTime).getTime()) / DAY_MS),
  );
}

export function getRequestDashboardAnalytics(
  requests: RequestListItem[],
  now = new Date(),
  completedSinceDays = 30,
): RequestDashboardAnalytics {
  const active = requests.filter((request) =>
    ACTIVE_REQUEST_STATUSES.includes(request.status),
  );
  const pendingApproval = active.filter(
    (request) => request.status === "pending_approval",
  );
  const inProgress = active.filter(
    (request) => request.status === "in_progress",
  );
  const highPriorityActive = active.filter(
    (request) => request.priority === "high" || request.priority === "urgent",
  );

  const completedCutoff = new Date(now);
  completedCutoff.setDate(completedCutoff.getDate() - completedSinceDays);

  const recentlyCompleted = requests.filter(
    (request) =>
      request.status === "completed" &&
      new Date(request.modified_time) >= completedCutoff,
  );

  const oldestRequest = [...active].sort((left, right) =>
    left.created_time.localeCompare(right.created_time),
  )[0];

  const byCategory = new Map<
    RequestListItem["category"],
    { count: number; costCents: number }
  >();

  for (const request of active) {
    const current = byCategory.get(request.category) ?? {
      count: 0,
      costCents: 0,
    };

    current.count += 1;
    current.costCents += request.estimated_cost_cents;
    byCategory.set(request.category, current);
  }

  const topCategoryEntry = Array.from(byCategory.entries()).sort(
    ([, left], [, right]) =>
      right.count - left.count || right.costCents - left.costCents,
  )[0];

  return {
    active,
    pendingApproval,
    inProgress,
    recentlyCompleted,
    highPriorityActive,
    estimatedOpenCostCents: active.reduce(
      (sum, request) => sum + request.estimated_cost_cents,
      0,
    ),
    oldestActive: oldestRequest
      ? { request: oldestRequest, ageDays: ageInDays(oldestRequest.created_time, now) }
      : null,
    topCategory: topCategoryEntry
      ? {
          category: topCategoryEntry[0],
          count: topCategoryEntry[1].count,
          costCents: topCategoryEntry[1].costCents,
        }
      : null,
  };
}

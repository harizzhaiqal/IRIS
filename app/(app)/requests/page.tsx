import Link from "next/link";
import { Inbox, Plus } from "lucide-react";

import { EmptyState } from "@/components/training/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { listRequestDepartments, listRequests } from "@/lib/queries/requests";
import {
  REQUEST_CATEGORY_ORDER,
  REQUEST_PRIORITY_ORDER,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_ORDER,
  type RequestCategory,
  type RequestPriority,
  type RequestStatus,
} from "@/lib/types";
import { RequestFilters } from "./filters";
import { RequestsTable, type RequestRowView } from "./requests-table";

export const metadata = { title: "Requests — IRIS" };

function parseStatus(value?: string): RequestStatus | null {
  return value && REQUEST_STATUS_ORDER.includes(value as RequestStatus)
    ? (value as RequestStatus)
    : null;
}

function parseCategory(value?: string): RequestCategory | null {
  return value && REQUEST_CATEGORY_ORDER.includes(value as RequestCategory)
    ? (value as RequestCategory)
    : null;
}

function parsePriority(value?: string): RequestPriority | null {
  return value && REQUEST_PRIORITY_ORDER.includes(value as RequestPriority)
    ? (value as RequestPriority)
    : null;
}

function parseId(value?: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: {
    status?: string;
    category?: string;
    priority?: string;
    requester?: string;
    department?: string;
  };
}) {
  const profile = await requireProfile();

  const status = parseStatus(searchParams.status);
  const category = parseCategory(searchParams.category);
  const priority = parsePriority(searchParams.priority);
  const requesterId = parseId(searchParams.requester);
  const department = searchParams.department?.trim() || null;

  const [requests, departments] = await Promise.all([
    listRequests({ status, category, priority, requesterId, department }),
    listRequestDepartments(),
  ]);

  // Reviewers see other people's names; staff only ever see their own, so the
  // requester column and filter would be a column of one repeated value.
  const isReviewer = profile.role !== "staff";

  const counts = REQUEST_STATUS_ORDER.map((key) => ({
    key,
    label: REQUEST_STATUS_LABELS[key],
    count: requests.filter((row) => row.status === key).length,
  }));

  const rows: RequestRowView[] = requests.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    priority: row.priority,
    status: row.status,
    estimatedCostCents: row.estimated_cost_cents,
    requesterName: row.requester?.full_name ?? "Unknown",
    departmentName: row.requester?.department?.name ?? null,
    assignedDepartment: row.assigned_department,
    hasAttachment: Boolean(row.attachment_name),
    createdTime: row.created_time,
  }));

  // Only names already on screen, so the filter cannot leak who else exists.
  const requesters = Array.from(
    new Map(
      requests
        .filter((row) => row.requester)
        .map((row) => [
          row.requester!.id,
          { id: row.requester!.id, full_name: row.requester!.full_name },
        ]),
    ).values(),
  ).sort((a, b) => a.full_name.localeCompare(b.full_name));

  const hasFilters = Boolean(
    status || category || priority || requesterId || department,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Requests</h1>
          <p className="text-sm text-muted-foreground">
            {isReviewer
              ? "Company requests for equipment, office items, and support."
              : "Your requests for equipment, office items, and support."}
          </p>
        </div>

        <Button asChild>
          <Link href="/requests/new">
            <Plus className="h-4 w-4" />
            New request
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <RequestFilters
            status={status}
            category={category}
            priority={priority}
            requesterId={requesterId}
            department={department}
            requesters={isReviewer ? requesters : []}
            departments={departments}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
            {rows.length} {rows.length === 1 ? "request" : "requests"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={hasFilters ? "Nothing matches these filters" : "No requests yet"}
              description={
                hasFilters
                  ? "Widen the status, category, or priority filter to see more."
                  : "Raise a request for equipment, office items, or support and it will appear here."
              }
              action={
                hasFilters ? null : (
                  <Button asChild size="sm">
                    <Link href="/requests/new">
                      <Plus className="h-4 w-4" />
                      New request
                    </Link>
                  </Button>
                )
              }
            />
          ) : (
            <RequestsTable rows={rows} showRequester={isReviewer} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

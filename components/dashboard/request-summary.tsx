import Link from "next/link";
import { CheckCircle2, ClipboardList, Inbox, Plus, Timer } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import { RequestStatusBadge } from "@/components/requests/request-badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRequestMetrics, listRequests } from "@/lib/queries/requests";

/**
 * The Requests block on the dashboard.
 *
 * One component for every role: the figures come from RLS-scoped queries, so a
 * staff member sees their own and HR sees the company's without this needing to
 * know which it is.
 */
export async function RequestSummary({ isReviewer }: { isReviewer: boolean }) {
  const [metrics, recent] = await Promise.all([
    getRequestMetrics(),
    listRequests(),
  ]);

  const latest = recent.slice(0, 5);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Requests</h2>
        <Button asChild size="sm" variant="outline">
          <Link href="/requests">View all</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Open requests"
          value={metrics.open}
          hint={isReviewer ? "Across the company" : "Yours, still in progress"}
          icon={Inbox}
        />
        <StatCard
          label="Pending approval"
          value={metrics.pendingApproval}
          hint={isReviewer ? "Waiting on a decision" : "Waiting on approval"}
          icon={Timer}
          tone={metrics.pendingApproval > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Completed"
          value={metrics.recentlyCompleted}
          hint="In the last 30 days"
          icon={CheckCircle2}
          tone={metrics.recentlyCompleted > 0 ? "success" : "default"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent request activity</CardTitle>
        </CardHeader>
        <CardContent>
          {latest.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                No requests yet. Raise one for equipment, an office item, or
                support.
              </p>
              <Button asChild size="sm">
                <Link href="/requests/new">
                  <Plus className="h-4 w-4" />
                  New request
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {latest.map((request) => (
                <li key={request.id} className="flex items-start gap-3">
                  <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/requests/${request.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {request.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {isReviewer && request.requester
                        ? `${request.requester.full_name} · `
                        : ""}
                      {new Date(request.created_time).toLocaleDateString("en-MY", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <RequestStatusBadge status={request.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

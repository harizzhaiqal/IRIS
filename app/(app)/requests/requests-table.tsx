import Link from "next/link";
import { ChevronRight, Paperclip } from "lucide-react";

import {
  RequestCategoryBadge,
  RequestPriorityBadge,
  RequestStatusBadge,
} from "@/components/requests/request-badges";
import type {
  RequestCategory,
  RequestPriority,
  RequestStatus,
} from "@/lib/types";
import { formatCost } from "@/lib/utils/money";

export type RequestRowView = {
  id: number;
  title: string;
  category: RequestCategory;
  priority: RequestPriority;
  status: RequestStatus;
  estimatedCostCents: number;
  requesterName: string;
  departmentName: string | null;
  assignedDepartment: string | null;
  hasAttachment: boolean;
  createdTime: string;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * A table on wide screens, stacked cards on narrow ones. The same markup twice
 * would drift, so the row content is one component rendered in both layouts.
 */
export function RequestsTable({
  rows,
  showRequester,
}: {
  rows: RequestRowView[];
  showRequester: boolean;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Request</th>
              {showRequester ? (
                <th className="pb-2 pr-4 font-medium">Requester</th>
              ) : null}
              <th className="pb-2 pr-4 font-medium">Category</th>
              <th className="pb-2 pr-4 font-medium">Priority</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 pr-4 text-right font-medium">Cost</th>
              <th className="pb-2 font-medium">Raised</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="py-3 pr-4">
                  <Link
                    href={`/requests/${row.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {row.title}
                  </Link>
                  {row.hasAttachment ? (
                    <Paperclip
                      className="ml-1.5 inline h-3.5 w-3.5 text-muted-foreground"
                      aria-label="Has an attachment"
                    />
                  ) : null}
                  {row.assignedDepartment ? (
                    <p className="text-xs text-muted-foreground">
                      Handled by {row.assignedDepartment}
                    </p>
                  ) : null}
                </td>
                {showRequester ? (
                  <td className="py-3 pr-4">
                    <p>{row.requesterName}</p>
                    {row.departmentName ? (
                      <p className="text-xs text-muted-foreground">
                        {row.departmentName}
                      </p>
                    ) : null}
                  </td>
                ) : null}
                <td className="py-3 pr-4">
                  <RequestCategoryBadge category={row.category} />
                </td>
                <td className="py-3 pr-4">
                  <RequestPriorityBadge priority={row.priority} />
                </td>
                <td className="py-3 pr-4">
                  <RequestStatusBadge status={row.status} />
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">
                  {row.estimatedCostCents > 0
                    ? formatCost(row.estimatedCostCents)
                    : "—"}
                </td>
                <td className="py-3 text-muted-foreground">
                  {formatDate(row.createdTime)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/requests/${row.id}`}
              className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-snug">{row.title}</p>
                  {row.hasAttachment ? (
                    <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : null}
                </div>

                {showRequester ? (
                  <p className="text-xs text-muted-foreground">
                    {row.requesterName}
                    {row.departmentName ? ` · ${row.departmentName}` : ""}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-1.5">
                  <RequestStatusBadge status={row.status} />
                  <RequestPriorityBadge priority={row.priority} />
                  <RequestCategoryBadge category={row.category} />
                </div>

                <p className="text-xs text-muted-foreground">
                  {formatDate(row.createdTime)}
                  {row.estimatedCostCents > 0
                    ? ` · ${formatCost(row.estimatedCostCents)}`
                    : ""}
                </p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

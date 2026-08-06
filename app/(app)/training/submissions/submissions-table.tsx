"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ThumbsUp } from "lucide-react";

import { useGlobalPending } from "@/components/app-shell/loading-overlay";
import { StatusBadge } from "@/components/training/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SubmissionStatus } from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import { monthName } from "@/lib/utils/targets";
import { bulkApprove } from "../review/actions";

export type SubmissionRow = {
  id: number;
  month: number;
  year: number;
  status: SubmissionStatus;
  is_late: boolean;
  is_nil_return: boolean;
  total_minutes: number;
  employeeName: string;
  departmentName: string | null;
};

export function SubmissionsTable({ rows }: { rows: SubmissionRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  useGlobalPending(pending, "Approving submissions…");

  // Only submissions already past the HOD stage can be approved in bulk.
  const selectableIds = useMemo(
    () => rows.filter((row) => row.status === "hod_verified").map((row) => row.id),
    [rows],
  );

  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggle(id: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(selectableIds) : new Set());
  }

  function runBulkApprove() {
    setMessage(null);

    startTransition(async () => {
      const result = await bulkApprove(Array.from(selected));

      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      setSelected(new Set());
      setMessage(
        result.failed > 0
          ? `Approved ${result.approved}. ${result.failed} could not be approved and may have moved on.`
          : `Approved ${result.approved} ${result.approved === 1 ? "submission" : "submissions"}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {selectableIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {selected.size === 0
              ? `${selectableIds.length} awaiting HR approval`
              : `${selected.size} selected`}
          </span>

          <Button
            size="sm"
            variant="success"
            onClick={runBulkApprove}
            disabled={selected.size === 0 || pending}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ThumbsUp className="h-4 w-4" />
            )}
            Approve selected
          </Button>

          {message ? (
            <span className="text-sm text-muted-foreground" role="status">
              {message}
            </span>
          ) : null}
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              {selectableIds.length > 0 ? (
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  aria-label="Select all submissions awaiting HR approval"
                />
              ) : null}
            </TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Hours</TableHead>
            <TableHead className="text-right">Review</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => {
            const selectable = row.status === "hod_verified";

            return (
              <TableRow key={row.id}>
                <TableCell>
                  {selectable ? (
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={(checked) => toggle(row.id, checked === true)}
                      aria-label={`Select ${row.employeeName}, ${monthName(row.month)} ${row.year}`}
                    />
                  ) : null}
                </TableCell>

                <TableCell>
                  <p className="font-medium">{row.employeeName}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.departmentName ?? "—"}
                  </p>
                </TableCell>

                <TableCell className="whitespace-nowrap text-sm">
                  {monthName(row.month)} {row.year}
                </TableCell>

                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={row.status} isLate={row.is_late} />
                    {row.is_nil_return ? (
                      <span className="text-xs text-muted-foreground">
                        Nil return
                      </span>
                    ) : null}
                  </div>
                </TableCell>

                <TableCell className="text-right tabular-nums">
                  {minutesToHHMM(row.total_minutes)}
                </TableCell>

                <TableCell className="text-right">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/training/review/${row.id}`}>
                      {row.status === "hod_verified" ? "Review" : "View"}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

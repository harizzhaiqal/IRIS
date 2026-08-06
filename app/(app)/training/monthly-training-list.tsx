"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";

import { EntriesTable } from "@/components/training/entries-table";
import { StatusBadge } from "@/components/training/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RecordWithAttachments } from "@/lib/queries/submissions";
import type { SubmissionStatus } from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import { monthName } from "@/lib/utils/targets";
import { EntryRowActions } from "./entry-row-actions";

export type MonthlyTrainingGroup = {
  id: number;
  month: number;
  year: number;
  status: SubmissionStatus;
  isLate: boolean;
  isNilReturn: boolean;
  totalMinutes: number;
  submittedAt: string | null;
  editable: boolean;
  records: RecordWithAttachments[];
  actionHref?: string;
  actionLabel?: string;
};

function formatSubmittedDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MonthlyTrainingList({
  groups,
  selectedMonth,
  showEntryActions = true,
}: {
  groups: MonthlyTrainingGroup[];
  selectedMonth: number;
  showEntryActions?: boolean;
}) {
  const defaultExpandedId =
    groups.find((group) => group.month === selectedMonth)?.id ??
    groups[0]?.id ??
    null;
  const [expandedIds, setExpandedIds] = useState<Set<number>>(
    () => new Set(defaultExpandedId === null ? [] : [defaultExpandedId]),
  );
  const showMonthActions = groups.some((group) => group.actionHref);

  useEffect(() => {
    setExpandedIds(
      new Set(defaultExpandedId === null ? [] : [defaultExpandedId]),
    );
  }, [defaultExpandedId]);

  function toggleGroup(id: number) {
    setExpandedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead>Training sessions</TableHead>
          <TableHead className="text-right">Total hours</TableHead>
          <TableHead>Submitted</TableHead>
          <TableHead>Status</TableHead>
          {showMonthActions ? (
            <TableHead className="text-right">Action</TableHead>
          ) : null}
        </TableRow>
      </TableHeader>

      <TableBody>
        {groups.map((group) => {
          const expanded = expandedIds.has(group.id);
          const count = group.records.length;
          const panelId = `training-month-${group.id}`;

          return (
            <Fragment key={group.id}>
              <TableRow
                className="cursor-pointer bg-background hover:bg-muted/50"
                data-state={expanded ? "selected" : undefined}
                onClick={() => toggleGroup(group.id)}
              >
                <TableCell>
                  <button
                    type="button"
                    className="flex min-w-40 items-center gap-2 text-left font-medium hover:text-primary"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleGroup(group.id);
                    }}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    )}
                    {monthName(group.month)} {group.year}
                  </button>
                </TableCell>
                <TableCell>
                  {group.isNilReturn
                    ? "Nil return"
                    : `${count} ${count === 1 ? "session" : "sessions"}`}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {minutesToHHMM(group.totalMinutes)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatSubmittedDate(group.submittedAt)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={group.status} isLate={group.isLate} />
                </TableCell>
                {showMonthActions ? (
                  <TableCell className="text-right">
                    {group.actionHref ? (
                      <span onClick={(event) => event.stopPropagation()}>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={group.actionHref}>
                            {group.actionLabel ?? "View"}
                          </Link>
                        </Button>
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                ) : null}
              </TableRow>

              {expanded ? (
                <TableRow id={panelId} className="hover:bg-transparent">
                  <TableCell
                    colSpan={showMonthActions ? 6 : 5}
                    className="bg-muted/20 p-4"
                  >
                    {group.isNilReturn ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No training was recorded for this month.
                      </p>
                    ) : count === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No training entries have been saved for this month yet.
                      </p>
                    ) : (
                      <div className="overflow-hidden rounded-md border bg-background">
                        <EntriesTable
                          records={group.records}
                          actionsPosition="start"
                          showDocuments={false}
                          renderActions={
                            showEntryActions
                              ? (record) =>
                                  group.editable ? (
                                    <EntryRowActions
                                      recordId={record.id}
                                      title={record.title}
                                      month={group.month}
                                      year={group.year}
                                    />
                                  ) : (
                                    <span className="text-sm text-muted-foreground">
                                      —
                                    </span>
                                  )
                              : undefined
                          }
                        />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

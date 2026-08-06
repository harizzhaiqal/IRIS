import Link from "next/link";
import { Paperclip, TriangleAlert } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RecordWithAttachments } from "@/lib/queries/submissions";
import { EFFECTIVENESS_LABELS } from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";

function formatDateRange(start: string, end: string): string {
  const from = new Date(start);
  const to = new Date(end);
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
  };

  if (from.toDateString() === to.toDateString()) {
    return from.toLocaleDateString(undefined, options);
  }

  return `${from.toLocaleDateString(undefined, options)}–${to.toLocaleDateString(
    undefined,
    options,
  )}`;
}

function formatTimeRange(start: string, end: string): string {
  const from = new Date(start);
  const to = new Date(end);
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
  };

  return `${from.toLocaleTimeString(undefined, options)}–${to.toLocaleTimeString(
    undefined,
    options,
  )}`;
}

/** A reusable record table with optional actions and supporting documents. */
export function EntriesTable({
  records,
  renderActions,
  actionsPosition = "end",
  renderStatus,
  showDocuments = true,
}: {
  records: RecordWithAttachments[];
  renderActions?: (record: RecordWithAttachments) => React.ReactNode;
  actionsPosition?: "start" | "end";
  renderStatus?: (record: RecordWithAttachments) => React.ReactNode;
  showDocuments?: boolean;
}) {
  const showFinalColumn = Boolean(renderStatus) || showDocuments;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {renderActions && actionsPosition === "start" ? (
            <TableHead className="w-20">Action</TableHead>
          ) : null}
          <TableHead className="w-10">#</TableHead>
          <TableHead>Training</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Time</TableHead>
          <TableHead className="text-right">Hours</TableHead>
          <TableHead>Effectiveness</TableHead>
          {showFinalColumn ? (
            <TableHead>{renderStatus ? "Status" : "Documents"}</TableHead>
          ) : null}
          {renderActions && actionsPosition === "end" ? (
            <TableHead className="text-right">Action</TableHead>
          ) : null}
        </TableRow>
      </TableHeader>

      <TableBody>
        {records.map((record) => {
          const isOverridden =
            record.recorded_minutes !== record.calculated_minutes;

          return (
            <TableRow key={record.id} className="align-top">
              {renderActions && actionsPosition === "start" ? (
                <TableCell>{renderActions(record)}</TableCell>
              ) : null}

              <TableCell className="text-muted-foreground tabular-nums">
                {record.seq_no}
              </TableCell>

              <TableCell>
                <p className="font-medium">{record.title}</p>
                <p className="text-xs text-muted-foreground">
                  {[record.trainer_provider, record.location]
                    .filter(Boolean)
                    .join(" · ") || "No provider recorded"}
                </p>
                {record.remarks ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {record.remarks}
                  </p>
                ) : null}
              </TableCell>

              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {formatDateRange(record.start_datetime, record.end_datetime)}
              </TableCell>

              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {formatTimeRange(record.start_datetime, record.end_datetime)}
              </TableCell>

              <TableCell className="text-right">
                <p className="font-medium tabular-nums">
                  {minutesToHHMM(record.recorded_minutes)}
                </p>
                {isOverridden ? (
                  <p className="text-xs text-muted-foreground tabular-nums line-through">
                    {minutesToHHMM(record.calculated_minutes)}
                  </p>
                ) : null}
              </TableCell>

              <TableCell className="text-sm">
                {record.effectiveness
                  ? EFFECTIVENESS_LABELS[record.effectiveness]
                  : "—"}
                {isOverridden && record.override_reason ? (
                  <p className="mt-1 flex max-w-[16rem] gap-1.5 text-xs text-muted-foreground">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                    <span>{record.override_reason}</span>
                  </p>
                ) : null}
              </TableCell>

              {showFinalColumn ? (
                <TableCell>
                  {renderStatus ? (
                    renderStatus(record)
                  ) : record.attachments.length === 0 ? (
                    <span className="text-xs text-muted-foreground">None</span>
                  ) : (
                    <ul className="space-y-1">
                      {record.attachments.map((attachment) => (
                        <li key={attachment.id}>
                          <Link
                            href={`/training/attachments/${attachment.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-primary underline-offset-4 hover:underline"
                          >
                            <Paperclip className="h-3 w-3 shrink-0" />
                            <span className="max-w-[10rem] truncate">
                              {attachment.file_name}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
              ) : null}

              {renderActions && actionsPosition === "end" ? (
                <TableCell>{renderActions(record)}</TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

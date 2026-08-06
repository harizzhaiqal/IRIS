"use client";

import { FileCheck2, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { commissionMonthLabel } from "@/lib/commission/demo-data";
import type { CommissionRecord } from "@/lib/types";

export function CommissionPdfPreview({
  record,
  trigger,
  onView,
}: {
  record: CommissionRecord;
  trigger: React.ReactNode;
  onView?: () => void;
}) {
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) onView?.();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-8">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="truncate">{record.pdfFileName}</DialogTitle>
              <DialogDescription>
                {record.employeeName} · {commissionMonthLabel(record.commissionMonth)}{" "}
                {record.commissionYear}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-4 sm:p-6">
          <div className="mx-auto max-w-md rounded-md border bg-background p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b pb-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
                  IRIS Commission Statement
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {commissionMonthLabel(record.commissionMonth)} {record.commissionYear}
                </p>
              </div>
              <Badge variant="outline">PDF preview</Badge>
            </div>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Employee</dt>
                <dd className="mt-1 font-medium">{record.employeeName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Department</dt>
                <dd className="mt-1 font-medium">{record.department}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Attachment</dt>
                <dd className="mt-1 break-all font-medium">{record.pdfFileName}</dd>
              </div>
            </dl>
            <div className="mt-8 space-y-2">
              <div className="h-2.5 rounded bg-muted" />
              <div className="h-2.5 w-11/12 rounded bg-muted" />
              <div className="h-2.5 w-4/5 rounded bg-muted" />
              <div className="mt-5 h-16 rounded border border-dashed bg-muted/30" />
            </div>
            <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
              <FileCheck2 className="h-4 w-4 text-success" />
              Prototype document preview · no real payroll data is shown
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

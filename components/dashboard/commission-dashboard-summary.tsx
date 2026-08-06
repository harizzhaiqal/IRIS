"use client";

import Link from "next/link";
import { BadgeCheck, EyeOff, FileUp, ReceiptText } from "lucide-react";

import { useCommission } from "@/components/commission/commission-provider";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCommissionDateTime } from "@/lib/commission/format";

export function CommissionDashboardSummary() {
  const { records, activityLogs } = useCommission();
  const notViewed = records.filter(
    (record) => record.emailSentAt && !record.viewedAt,
  ).length;
  const acknowledged = records.filter((record) => record.acknowledgedAt).length;

  return (
    <section className="space-y-3" aria-labelledby="commission-dashboard-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="commission-dashboard-heading" className="text-sm font-semibold">
            Commission overview
          </h2>
          <p className="text-xs text-muted-foreground">
            Prototype document delivery and acknowledgement status
          </p>
        </div>
        <Link
          href="/commission"
          className="text-xs font-medium text-primary hover:underline"
        >
          Open commission records
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Commission documents uploaded"
          value={records.length}
          icon={FileUp}
        />
        <StatCard
          label="Commission documents not viewed"
          value={notViewed}
          icon={EyeOff}
          tone={notViewed > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Commission acknowledged"
          value={acknowledged}
          icon={BadgeCheck}
          tone="success"
        />
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-3">
            <div>
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recent commission activity
              </CardTitle>
            </div>
            <ReceiptText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {activityLogs[0] ? (
              <div>
                <p className="text-sm font-medium leading-snug">
                  {activityLogs[0].action}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {activityLogs[0].description}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatCommissionDateTime(activityLogs[0].createdAt)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ReminderRunStatusBadge } from "@/components/reminders/run-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { getReminderRun, getReminderSchedule, listReminderDeliveries } from "@/lib/queries/reminders";
import type { ReminderDeliveryStatus } from "@/lib/types";
import { RetryButton } from "./retry-button";

export const metadata = { title: "Reminder delivery — IRIS" };

const dateTime = new Intl.DateTimeFormat("en-MY", {
  day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  timeZone: "Asia/Kuala_Lumpur",
});

const DELIVERY_LABELS: Record<ReminderDeliveryStatus, string> = {
  pending: "Queued", processing: "Sending", accepted: "Accepted",
  delivered: "Delivered", failed: "Failed", unknown: "Needs review", skipped: "Skipped",
};

export default async function ReminderRunPage({ params }: { params: { id: string } }) {
  await requireRole(["hr_admin"]);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const run = await getReminderRun(id);
  if (!run) notFound();
  const [schedule, deliveries] = await Promise.all([
    getReminderSchedule(run.schedule_id),
    listReminderDeliveries(run.id),
  ]);
  const hasFailures = deliveries.some((delivery) => delivery.status === "failed");

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild><Link href="/reminders"><ArrowLeft className="h-4 w-4" />Back to reminders</Link></Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{schedule?.name ?? "Reminder delivery"}</h1>
            {run.is_test_mode_snapshot ? <Badge variant="warning">Test mode</Badge> : null}</div>
            <p className="text-sm text-muted-foreground">Scheduled {dateTime.format(new Date(run.scheduled_for))}</p></div>
          <ReminderRunStatusBadge status={run.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[{ label: "Recipients", value: run.recipient_count }, { label: "Accepted", value: run.accepted_count }, { label: "Failed", value: run.failed_count }].map((item) => (
          <Card key={item.label}><CardContent className="pt-6"><p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p><p className="text-2xl font-semibold">{item.value}</p></CardContent></Card>
        ))}
      </div>

      {hasFailures ? <RetryButton runId={run.id} /> : null}

      <Card>
        <CardHeader><CardTitle>Recipients</CardTitle></CardHeader>
        <CardContent>
          {deliveries.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">The worker has not prepared recipients yet.</p> : (
            <Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead>Last attempt</TableHead><TableHead>Error</TableHead></TableRow></TableHeader>
              <TableBody>{deliveries.map((delivery) => (
                <TableRow key={delivery.id}><TableCell className="font-medium">{delivery.recipient_name}</TableCell><TableCell>{delivery.recipient_email}</TableCell>
                  <TableCell><Badge variant={delivery.status === "accepted" || delivery.status === "delivered" ? "success" : delivery.status === "failed" || delivery.status === "unknown" ? "destructive" : "secondary"}>{DELIVERY_LABELS[delivery.status]}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap">{delivery.last_attempt_at ? dateTime.format(new Date(delivery.last_attempt_at)) : "—"}</TableCell>
                  <TableCell className="max-w-xs text-sm text-destructive">{delivery.last_error ?? "—"}</TableCell></TableRow>
              ))}</TableBody></Table>
          )}
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Content used</CardTitle></CardHeader><CardContent className="space-y-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Subject</p><p className="font-medium">{run.subject_snapshot}</p></div><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Message</p><p className="whitespace-pre-wrap text-sm leading-6">{run.body_snapshot}</p></div></CardContent></Card>
    </div>
  );
}

import Link from "next/link";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  Mail,
  Pencil,
  Plus,
} from "lucide-react";

import { ReminderRunStatusBadge } from "@/components/reminders/run-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { emailDeliveryConfigured } from "@/lib/email/resend";
import { listReminderRuns, listReminderSchedules } from "@/lib/queries/reminders";
import {
  formatReminderSchedule,
  nextReminderOccurrence,
} from "@/lib/reminders/schedule";

export const metadata = { title: "Reminders — IRIS" };

const malaysiaDateTime = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kuala_Lumpur",
});

export default async function RemindersPage() {
  await requireRole(["hr_admin"]);
  const [schedules, runs] = await Promise.all([
    listReminderSchedules(),
    listReminderRuns(),
  ]);

  const latestBySchedule = new Map<number, (typeof runs)[number]>();
  for (const run of runs) {
    if (!latestBySchedule.has(run.schedule_id)) {
      latestBySchedule.set(run.schedule_id, run);
    }
  }
  const names = new Map(schedules.map((schedule) => [schedule.id, schedule.name]));
  const configured = emailDeliveryConfigured();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reminders</h1>
          <p className="text-sm text-muted-foreground">
            Schedule private monthly emails to active employees and monitor every delivery.
          </p>
        </div>
        <Button asChild>
          <Link href="/reminders/new"><Plus className="h-4 w-4" />New reminder</Link>
        </Button>
      </div>

      {!configured ? (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Email delivery needs configuration</AlertTitle>
          <AlertDescription>
            You can prepare and preview reminders now. Before sending a test or enabling a schedule,
            configure the Resend API key and verified sender address on the server.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {schedules.map((schedule) => {
          const latest = latestBySchedule.get(schedule.id);
          return (
            <Card key={schedule.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle>{schedule.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {formatReminderSchedule(schedule)} · Malaysia time
                    </p>
                  </div>
                  <Badge variant={schedule.is_enabled ? "success" : "secondary"}>
                    {schedule.is_enabled ? "Enabled" : "Paused"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-3 text-sm">
                  <div className="flex gap-3">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div><dt className="text-muted-foreground">Audience</dt><dd>
                      {schedule.audience === "incomplete_training"
                        ? "Employees who have not submitted"
                        : "All active employees"}
                    </dd></div>
                  </div>
                  <div className="flex gap-3">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div><dt className="text-muted-foreground">Next send</dt><dd>
                      {schedule.is_enabled
                        ? malaysiaDateTime.format(nextReminderOccurrence(schedule))
                        : "Not scheduled while paused"}
                    </dd></div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div><dt className="text-muted-foreground">Last run</dt><dd>
                      {latest ? `${latest.accepted_count} accepted, ${latest.failed_count} failed` : "Never sent"}
                    </dd></div>
                  </div>
                </dl>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/reminders/${schedule.id}`}><Pencil className="h-4 w-4" />Edit and test</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {schedules.length === 0 ? (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <BellRing className="h-8 w-8 text-muted-foreground" />
              <div><p className="font-medium">No reminders yet</p><p className="text-sm text-muted-foreground">Create a reminder, send yourself a test, then enable it.</p></div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader><CardTitle>Delivery history</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Automated sends will appear here with recipient and failure counts.
            </p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Reminder</TableHead><TableHead>Scheduled</TableHead>
                <TableHead>Status</TableHead><TableHead>Recipients</TableHead>
                <TableHead>Accepted</TableHead><TableHead>Failed</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>{runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium">{names.get(run.schedule_id) ?? "Deleted reminder"}</TableCell>
                  <TableCell className="whitespace-nowrap">{malaysiaDateTime.format(new Date(run.scheduled_for))}</TableCell>
                  <TableCell><ReminderRunStatusBadge status={run.status} /></TableCell>
                  <TableCell>{run.recipient_count}</TableCell>
                  <TableCell>{run.accepted_count}</TableCell>
                  <TableCell>{run.failed_count}</TableCell>
                  <TableCell className="text-right"><Button variant="outline" size="sm" asChild><Link href={`/reminders/runs/${run.id}`}>View</Link></Button></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

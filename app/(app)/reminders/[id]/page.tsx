import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { getReminderSchedule } from "@/lib/queries/reminders";
import { getTargets } from "@/lib/queries/settings";
import { ReminderForm } from "../reminder-form";

export const metadata = { title: "Edit reminder — IRIS" };

export default async function EditReminderPage({ params }: { params: { id: string } }) {
  const profile = await requireRole(["hr_admin"]);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [schedule, targets] = await Promise.all([
    getReminderSchedule(id),
    getTargets(),
  ]);
  if (!schedule) notFound();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/reminders"><ArrowLeft className="h-4 w-4" />Back to reminders</Link>
        </Button>
        <div><h1 className="text-2xl font-semibold tracking-tight">Edit reminder</h1>
          <p className="text-sm text-muted-foreground">Changes affect future sends. Previous runs keep a snapshot of the content used.</p></div>
      </div>
      <ReminderForm
        schedule={schedule}
        testEmail={profile.email}
        deadlineDay={targets.submissionDeadlineDay}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}
      />
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { getTargets } from "@/lib/queries/settings";
import { ReminderForm } from "../reminder-form";

export const metadata = { title: "New reminder — IRIS" };

export default async function NewReminderPage() {
  const profile = await requireRole(["hr_admin"]);
  const targets = await getTargets();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/reminders"><ArrowLeft className="h-4 w-4" />Back to reminders</Link>
        </Button>
        <div><h1 className="text-2xl font-semibold tracking-tight">New reminder</h1>
          <p className="text-sm text-muted-foreground">Prepare the email, send yourself a test, and enable it when ready.</p></div>
      </div>
      <ReminderForm
        schedule={null}
        testEmail={profile.email}
        deadlineDay={targets.submissionDeadlineDay}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}
      />
    </div>
  );
}

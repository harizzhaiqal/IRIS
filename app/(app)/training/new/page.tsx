import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isEditableStatus } from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import { monthName } from "@/lib/utils/targets";
import { EntryForm, type EntryFormDefaults } from "./entry-form";

export const metadata = { title: "Add training — IRIS" };

/** datetime-local needs local wall-clock time with no zone suffix. */
function toDatetimeLocal(value: string): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function NewTrainingPage({
  searchParams,
}: {
  searchParams: { recordId?: string; month?: string; year?: string };
}) {
  const profile = await requireProfile();
  const now = new Date();

  const month = Number(searchParams.month) || now.getMonth() + 1;
  const year = Number(searchParams.year) || now.getFullYear();

  let defaults: EntryFormDefaults = {
    title: "",
    startDatetime: "",
    endDatetime: "",
    hours: "",
    overrideReason: "",
    location: "",
    trainerProvider: "",
    remarks: "",
  };

  let existingAttachments: { id: string; file_name: string }[] = [];

  if (searchParams.recordId) {
    // The id is a bigint now, so a hand-edited ?recordId=abc is not found
    // rather than passed to the query as a string.
    const recordId = Number(searchParams.recordId);
    if (!Number.isInteger(recordId) || recordId <= 0) notFound();

    const supabase = createClient();

    const { data: record } = await supabase
      .from("training_records")
      .select(
        "*, submission:training_submissions!inner ( id, status, employee_id, month, year ), attachments:training_attachments ( id, file_name )",
      )
      .eq("id", recordId)
      .maybeSingle();

    if (!record) notFound();

    const submission = record.submission as unknown as {
      status: Parameters<typeof isEditableStatus>[0];
      employee_id: string;
      month: number;
      year: number;
    };

    if (submission.employee_id !== profile.id) notFound();

    if (!isEditableStatus(submission.status)) {
      redirect(`/training?month=${submission.month}&year=${submission.year}`);
    }

    defaults = {
      recordId: record.id,
      title: record.title,
      startDatetime: toDatetimeLocal(record.start_datetime),
      endDatetime: toDatetimeLocal(record.end_datetime),
      hours: minutesToHHMM(record.recorded_minutes),
      overrideReason: record.override_reason ?? "",
      location: record.location ?? "",
      trainerProvider: record.trainer_provider ?? "",
      effectiveness: record.effectiveness ?? undefined,
      remarks: record.remarks ?? "",
    };

    existingAttachments =
      (record.attachments as unknown as { id: string; file_name: string }[]) ??
      [];
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-3">
          <Link href={`/training?month=${month}&year=${year}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to {monthName(month)} {year}
          </Link>
        </Button>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {defaults.recordId ? "Edit training entry" : "Add training"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Recording against {monthName(month)} {year}.
          </p>
        </div>
      </div>

      <EntryForm
        month={month}
        year={year}
        userId={profile.id}
        defaults={defaults}
        existingAttachments={existingAttachments}
      />
    </div>
  );
}

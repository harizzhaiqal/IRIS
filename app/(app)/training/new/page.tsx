import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarOff, NotebookPen } from "lucide-react";

import { EmptyState } from "@/components/training/empty-state";
import { EntriesTable } from "@/components/training/entries-table";
import { StatusBadge } from "@/components/training/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { getSubmissionForMonth } from "@/lib/queries/submissions";
import { createClient } from "@/lib/supabase/server";
import { filesOwnRecords, isEditableStatus } from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import { monthName } from "@/lib/utils/targets";
import { EntryRowActions } from "../entry-row-actions";
import { MonthActions } from "../month-actions";
import { MonthPicker } from "../month-picker";
import { WithdrawNilReturn } from "../withdraw-nil-return";
import { EntryForm, type EntryFormDefaults } from "./entry-form";

export const metadata = { title: "Monthly training — IRIS" };

/** datetime-local needs local wall-clock time with no zone suffix. */
function toDatetimeLocal(value: string): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function resolvePeriod(searchParams: { month?: string; year?: string }) {
  const now = new Date();
  const requestedMonth = Number(searchParams.month);
  const requestedYear = Number(searchParams.year);

  return {
    month:
      requestedMonth >= 1 && requestedMonth <= 12
        ? requestedMonth
        : now.getMonth() + 1,
    year:
      requestedYear >= 2000 && requestedYear <= 2100
        ? requestedYear
        : now.getFullYear(),
  };
}

export default async function NewTrainingPage({
  searchParams,
}: {
  searchParams: { recordId?: string; month?: string; year?: string };
}) {
  const profile = await requireProfile();

  if (!filesOwnRecords(profile.role)) redirect("/training/submissions");

  let { month, year } = resolvePeriod(searchParams);
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
  let existingAttachments: { id: number; file_name: string }[] = [];

  if (searchParams.recordId) {
    const recordId = Number(searchParams.recordId);
    if (!Number.isInteger(recordId) || recordId <= 0) notFound();

    const supabase = createClient();
    const { data: record, error } = await supabase
      .from("training_records")
      .select(
        "*, submission:training_submissions!inner ( id, status, employee_id, month, year ), attachments:training_attachments ( id, file_name )",
      )
      .eq("id", recordId)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load this training entry: ${error.message}`);
    }
    if (!record) notFound();

    const recordSubmission = record.submission as unknown as {
      status: Parameters<typeof isEditableStatus>[0];
      employee_id: number;
      month: number;
      year: number;
    };

    if (recordSubmission.employee_id !== profile.id) notFound();
    if (!isEditableStatus(recordSubmission.status)) {
      redirect(
        `/training/new?month=${recordSubmission.month}&year=${recordSubmission.year}`,
      );
    }

    // The record owns its period. A hand-edited month/year in the URL must not
    // move an existing entry into another monthly submission.
    month = recordSubmission.month;
    year = recordSubmission.year;
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
      (record.attachments as unknown as { id: number; file_name: string }[]) ??
      [];
  }

  const submission = await getSubmissionForMonth(profile.id, month, year);
  const records = submission?.records ?? [];
  const editable = submission ? isEditableStatus(submission.status) : true;
  const entriesMissingAttachments = records
    .filter((record) => record.attachments.length === 0)
    .map((record) => record.title);

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  const workspaceHref = `/training/new?month=${month}&year=${year}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Button variant="ghost" size="sm" asChild className="-ml-3">
            <Link href={`/training?month=${month}&year=${year}`}>
              <ArrowLeft className="h-4 w-4" />
              Back to training overview
            </Link>
          </Button>

          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Monthly training
            </h1>
            <p className="text-sm text-muted-foreground">
              Choose a period, save each entry, then submit the complete month.
            </p>
          </div>
        </div>

        <MonthPicker
          month={month}
          year={year}
          years={years}
          basePath="/training/new"
          resetKeys={["recordId"]}
        />
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle>
              {monthName(month)} {year} training
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {records.length} saved {records.length === 1 ? "entry" : "entries"}
              {records.length > 0
                ? ` · ${minutesToHHMM(submission?.total_minutes ?? 0)} total`
                : ""}
            </p>
          </div>
          <StatusBadge
            status={submission?.status ?? null}
            isLate={submission?.is_late ?? false}
          />
        </CardHeader>

        <CardContent className="space-y-4">
          {submission?.is_nil_return ? (
            <EmptyState
              icon={CalendarOff}
              title="Recorded as a nil return"
              description={`No training entries are recorded for ${monthName(month)} ${year}.`}
              action={
                editable ? (
                  <WithdrawNilReturn month={month} year={year} />
                ) : undefined
              }
            />
          ) : records.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="No training saved for this month"
              description="Use the form below to add the first training entry before submitting the month."
            />
          ) : (
            <EntriesTable
              records={records}
              actionsPosition="start"
              renderActions={
                editable
                  ? (record) => (
                      <EntryRowActions
                        recordId={record.id}
                        title={record.title}
                        month={month}
                        year={year}
                        afterDeleteHref={workspaceHref}
                      />
                    )
                  : undefined
              }
            />
          )}

          {editable ? (
            <div className="border-t pt-4">
              <div className="mb-3 space-y-1">
                <p className="text-sm font-medium">Submit this monthly record</p>
                <p className="text-xs text-muted-foreground">
                  HOD approval covers every training entry listed above.
                </p>
              </div>
              <MonthActions
                month={month}
                year={year}
                entryCount={records.length}
                entriesMissingAttachments={entriesMissingAttachments}
              />
            </div>
          ) : (
            <p className="border-t pt-4 text-sm text-muted-foreground">
              This complete month is with your reviewers. Its entries are locked
              unless the submission is returned or rejected.
            </p>
          )}
        </CardContent>
      </Card>

      {editable && !submission?.is_nil_return ? (
        <section className="mx-auto w-full max-w-3xl space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">
              {defaults.recordId ? "Edit training" : "Add training"}
            </h2>
            <p className="text-sm text-muted-foreground">
              This entry will be saved under {monthName(month)} {year} without
              submitting the month.
            </p>
          </div>

          <EntryForm
            key={defaults.recordId ?? `new-${month}-${year}`}
            month={month}
            year={year}
            userId={profile.id}
            defaults={defaults}
            existingAttachments={existingAttachments}
          />
        </section>
      ) : submission?.is_nil_return ? null : (
        <Alert>
          <AlertTitle>Monthly record locked</AlertTitle>
          <AlertDescription>
            New entries cannot be added while {monthName(month)} {year} is with
            HOD or HR. If a reviewer returns it, the form will become available
            again.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

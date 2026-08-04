import Link from "next/link";
import { CalendarOff, FileDown, NotebookPen, Plus } from "lucide-react";

import { EmptyState } from "@/components/training/empty-state";
import { EntriesTable } from "@/components/training/entries-table";
import { StatusBadge } from "@/components/training/status-badge";
import { TargetProgress } from "@/components/training/target-progress";
import { VerificationTrail } from "@/components/training/verification-trail";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth";
import { getProfileName } from "@/lib/queries/profiles";
import { getTargets } from "@/lib/queries/settings";
import {
  getSubmissionForMonth,
  listYearSubmissions,
} from "@/lib/queries/submissions";
import { filesOwnRecords, isEditableStatus } from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import {
  daysUntilDeadline,
  monthName,
  splitApprovedAndPending,
} from "@/lib/utils/targets";
import { EntryRowActions } from "./entry-row-actions";
import { MonthActions } from "./month-actions";
import { MonthPicker } from "./month-picker";
import { WithdrawNilReturn } from "./withdraw-nil-return";

export const metadata = { title: "My training — IRIS" };

function resolvePeriod(searchParams: { month?: string; year?: string }) {
  const now = new Date();

  const month = Number(searchParams.month);
  const year = Number(searchParams.year);

  return {
    month: month >= 1 && month <= 12 ? month : now.getMonth() + 1,
    year: year >= 2000 && year <= 2100 ? year : now.getFullYear(),
  };
}

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: { month?: string; year?: string };
}) {
  const profile = await requireProfile();

  // HR administers the process rather than taking part in it, and the CEO
  // neither submits nor approves, so for both this page would always be empty.
  if (!filesOwnRecords(profile.role)) redirect("/training/submissions");
  const { month, year } = resolvePeriod(searchParams);

  const [targets, submission, yearSubmissions] = await Promise.all([
    getTargets(),
    getSubmissionForMonth(profile.id, month, year),
    listYearSubmissions(profile.id, year),
  ]);

  const [hodName, hrName] = await Promise.all([
    getProfileName(submission?.hod_verified_by ?? null),
    getProfileName(submission?.hr_verified_by ?? null),
  ]);

  const { approvedMinutes, pendingMinutes } =
    splitApprovedAndPending(yearSubmissions);

  const records = submission?.records ?? [];
  const monthMinutes = submission?.total_minutes ?? 0;
  const editable = submission ? isEditableStatus(submission.status) : true;
  const daysLeft = daysUntilDeadline(
    month,
    year,
    targets.submissionDeadlineDay,
    new Date(),
  );

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  const entriesMissingAttachments = records
    .filter((record) => record.attachments.length === 0)
    .map((record) => record.title);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">My training</h1>
          <p className="text-sm text-muted-foreground">
            {monthName(month)} {year}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker month={month} year={year} years={years} />

          {/* A plain link, not a client action: the response is a file, so the
              browser's own download handling is what should take it. */}
          <Button asChild variant="outline" size="sm">
            <a href={`/training/export?year=${year}`}>
              <FileDown className="h-4 w-4" />
              Export {year}
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>
              {monthName(month)} {year}
            </CardTitle>
            <StatusBadge
              status={submission?.status ?? null}
              isLate={submission?.is_late ?? false}
            />
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Recorded this month
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {minutesToHHMM(monthMinutes)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Deadline
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {daysLeft >= 0 ? `${daysLeft}d` : "Passed"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {targets.submissionDeadlineDay}
                  {" "}
                  {monthName(month === 12 ? 1 : month + 1)}
                </p>
              </div>
            </div>

            <TargetProgress
              label="Monthly target"
              approvedMinutes={monthMinutes}
              targetHours={targets.monthlyStandardHours}
            />

            <TargetProgress
              label={`Approved year to date, ${year}`}
              approvedMinutes={approvedMinutes}
              pendingMinutes={pendingMinutes}
              targetHours={targets.yearlyStandardHours}
            />

            <TargetProgress
              label="Against the minimum threshold"
              approvedMinutes={approvedMinutes}
              targetHours={targets.yearlyThresholdHours}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verification</CardTitle>
          </CardHeader>
          <CardContent>
            {submission ? (
              <VerificationTrail
                status={submission.status}
                submittedAt={submission.submitted_at}
                hodName={hodName}
                hodVerifiedAt={submission.hod_verified_at}
                hodComment={submission.hod_comment}
                hrName={hrName}
                hrVerifiedAt={submission.hr_verified_at}
                hrComment={submission.hr_comment}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing to verify yet. Add your first entry for this month to get
                started.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {submission?.status === "returned_by_hod" ? (
        <Alert variant="destructive">
          <AlertTitle>Your head of department sent this back</AlertTitle>
          <AlertDescription>
            {submission.hod_comment ??
              "Review the entries for this month and submit again."}
          </AlertDescription>
        </Alert>
      ) : null}

      {submission?.status === "rejected" ? (
        <Alert variant="destructive">
          <AlertTitle>HR rejected this month</AlertTitle>
          <AlertDescription>
            {submission.hr_comment ??
              "Review the entries for this month and submit again."}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Entries</CardTitle>
          {editable ? (
            <Button asChild size="sm">
              <Link href={`/training/new?month=${month}&year=${year}`}>
                <Plus className="h-4 w-4" />
                Add training
              </Link>
            </Button>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4">
          {submission?.is_nil_return ? (
            <EmptyState
              icon={CalendarOff}
              title="Recorded as a nil return"
              description={`You reported no training for ${monthName(month)} ${year}. HR can tell this apart from a month that has not been filled in.`}
              action={
                editable ? (
                  <WithdrawNilReturn month={month} year={year} />
                ) : undefined
              }
            />
          ) : records.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="No training recorded for this month"
              description="Add a course, workshop, or briefing you attended, or declare a nil return if you had none."
              action={
                editable ? (
                  <Button asChild size="sm">
                    <Link href={`/training/new?month=${month}&year=${year}`}>
                      <Plus className="h-4 w-4" />
                      Add training
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <EntriesTable
                records={records}
                renderActions={
                  editable
                    ? (record) => (
                        <EntryRowActions
                          recordId={record.id}
                          title={record.title}
                          month={month}
                          year={year}
                        />
                      )
                    : undefined
                }
              />
              <div className="flex justify-end border-t pt-3 text-sm">
                <span className="text-muted-foreground">Month total</span>
                <span className="ml-3 font-semibold tabular-nums">
                  {minutesToHHMM(monthMinutes)}
                </span>
              </div>
            </>
          )}

          {editable ? (
            <div className="border-t pt-4">
              <MonthActions
                month={month}
                year={year}
                entryCount={records.length}
                isNilReturn={submission?.is_nil_return ?? false}
                entriesMissingAttachments={entriesMissingAttachments}
              />
            </div>
          ) : (
            <p className="border-t pt-4 text-sm text-muted-foreground">
              This month is with your reviewers. You can edit it again only if it
              is sent back to you.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

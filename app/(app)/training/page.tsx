import Link from "next/link";
import { CalendarOff, FileDown, NotebookPen, Plus } from "lucide-react";

import { InsightCard } from "@/components/dashboard/insight-card";
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
import { listYearSubmissionsWithRecords } from "@/lib/queries/submissions";
import { filesOwnRecords, isEditableStatus } from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import {
  daysUntilDeadline,
  hoursToMinutes,
  monthName,
  splitApprovedAndPending,
} from "@/lib/utils/targets";
import { EntryRowActions } from "./entry-row-actions";
import { MonthActions } from "./month-actions";
import { MonthPicker } from "./month-picker";
import { MonthlyTrainingList } from "./monthly-training-list";
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

  const [targets, yearSubmissions] = await Promise.all([
    getTargets(),
    listYearSubmissionsWithRecords(profile.id, year),
  ]);

  const submission =
    yearSubmissions.find((item) => item.month === month) ?? null;
  const isStaff = profile.role === "staff";

  const [hodName, hrName] = isStaff
    ? [null, null]
    : await Promise.all([
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

  const yearTrainingItems = yearSubmissions
    .flatMap((item) =>
      item.records.map((record) => ({
        record,
        month: item.month,
        year: item.year,
        status: item.status,
        isLate: item.is_late,
        editable: isEditableStatus(item.status),
      })),
    )
    .sort(
      (left, right) =>
        new Date(right.record.start_datetime).getTime() -
          new Date(left.record.start_datetime).getTime() ||
        right.record.id - left.record.id,
    );

  const monthlyTrainingGroups = [...yearSubmissions]
    .sort((left, right) => right.month - left.month)
    .map((item) => ({
      id: item.id,
      month: item.month,
      year: item.year,
      status: item.status,
      isLate: item.is_late,
      isNilReturn: item.is_nil_return,
      totalMinutes: item.total_minutes,
      submittedAt: item.submitted_at,
      editable: isEditableStatus(item.status),
      records: item.records,
    }));
  const yearRecordedMinutes = yearTrainingItems.reduce(
    (total, item) => total + item.record.recorded_minutes,
    0,
  );
  const activeMonths = new Set(yearTrainingItems.map((item) => item.month)).size;
  const missingDocumentCount = yearTrainingItems.filter(
    (item) => item.record.attachments.length === 0,
  ).length;
  const remainingToYearlyStandard = Math.max(
    0,
    hoursToMinutes(targets.yearlyStandardHours) - approvedMinutes,
  );
  const remainingToThreshold = Math.max(
    0,
    hoursToMinutes(targets.yearlyThresholdHours) - approvedMinutes,
  );
  const needsYearlyAction = remainingToThreshold > 0;

  const trainingInsights = [
    yearTrainingItems.length > 0
      ? `${yearTrainingItems.length} training ${yearTrainingItems.length === 1 ? "session" : "sessions"} across ${activeMonths} ${activeMonths === 1 ? "month" : "months"}, totalling ${minutesToHHMM(yearRecordedMinutes)} recorded in ${year}.`
      : `No training sessions have been recorded for ${year} yet.`,
    pendingMinutes > 0
      ? `${minutesToHHMM(approvedMinutes)} is approved and ${minutesToHHMM(pendingMinutes)} is still awaiting verification.`
      : `${minutesToHHMM(approvedMinutes)} is approved, with no training currently awaiting verification.`,
    remainingToYearlyStandard > 0
      ? `${minutesToHHMM(remainingToYearlyStandard)} more approved training is needed to reach the ${targets.yearlyStandardHours}-hour yearly standard.`
      : `The ${targets.yearlyStandardHours}-hour yearly training standard has been reached.`,
    missingDocumentCount > 0
      ? `${missingDocumentCount} ${missingDocumentCount === 1 ? "session has" : "sessions have"} no supporting document attached.`
      : yearTrainingItems.length > 0
        ? "Every listed training session has a supporting document."
        : "Supporting-document coverage will appear after training is recorded.",
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">My training</h1>
          <p className="text-sm text-muted-foreground">
            Review your monthly progress and yearly training history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* A plain link, not a client action: the response is a file, so the
              browser's own download handling is what should take it. */}
          <Button asChild variant="outline" size="sm">
            <a href={`/training/export?year=${year}`}>
              <FileDown className="h-4 w-4" />
              Export {year}
            </a>
          </Button>

          {editable && !submission?.is_nil_return ? (
            <Button asChild size="sm">
              <Link href={`/training/new?month=${month}&year=${year}`}>
                <Plus className="h-4 w-4" />
                Add training
              </Link>
            </Button>
          ) : (
            <Button
              size="sm"
              disabled
              title={
                submission?.is_nil_return
                  ? "Withdraw the nil return before adding training."
                  : "This month is with your reviewers and cannot be edited."
              }
            >
              <Plus className="h-4 w-4" />
              Add training
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row flex-wrap items-center gap-3 space-y-0">
            <CardTitle className="mr-auto">
              {monthName(month)} {year}
            </CardTitle>
            <MonthPicker month={month} year={year} years={years} />
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

        {isStaff ? (
          <InsightCard
            summary={
              yearTrainingItems.length === 0
                ? `There is not enough training data yet to assess your ${year} progress.`
                : needsYearlyAction
                  ? `Your priority is to close the ${minutesToHHMM(remainingToThreshold)} gap to the yearly minimum threshold.`
                  : "Your approved training has reached the yearly minimum threshold."
            }
            insights={trainingInsights}
            scope={`Based on your ${year} training records`}
            badge={
              yearTrainingItems.length === 0
                ? "No data"
                : needsYearlyAction
                  ? "Action needed"
                  : "On track"
            }
            badgeTone={
              yearTrainingItems.length === 0
                ? "secondary"
                : needsYearlyAction
                  ? "warning"
                  : "success"
            }
            evidenceHref={`/training?month=${month}&year=${year}#training-list`}
          />
        ) : (
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
                  Nothing to verify yet. Add your first entry for this month to
                  get started.
                </p>
              )}
            </CardContent>
          </Card>
        )}
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

      <Card id="training-list" className="scroll-mt-6">
        <CardHeader>
          <div className="space-y-1">
            <CardTitle>{isStaff ? "Training list" : "Entries"}</CardTitle>
            {isStaff ? (
              <p className="text-xs text-muted-foreground">
                All training recorded in {year}, newest first.
              </p>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isStaff ? (
            monthlyTrainingGroups.length === 0 ? (
              <EmptyState
                icon={NotebookPen}
                title={`No training recorded in ${year}`}
                description="Add a course, workshop, or briefing to start building your yearly training list."
              />
            ) : (
              <>
                <MonthlyTrainingList
                  groups={monthlyTrainingGroups}
                  selectedMonth={month}
                />
                <div className="flex justify-end border-t pt-3 text-sm">
                  <span className="text-muted-foreground">Year total</span>
                  <span className="ml-3 font-semibold tabular-nums">
                    {minutesToHHMM(yearRecordedMinutes)}
                  </span>
                </div>
              </>
            )
          ) : submission?.is_nil_return ? (
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
              description="Add a course, workshop, or briefing you attended for this month."
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

          {isStaff && submission?.is_nil_return ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
              <div>
                <p className="text-sm font-medium">
                  {monthName(month)} is recorded as a nil return
                </p>
                <p className="text-xs text-muted-foreground">
                  No training entry is expected for this selected month.
                </p>
              </div>
              {editable ? <WithdrawNilReturn month={month} year={year} /> : null}
            </div>
          ) : null}

          {editable ? (
            <div className="border-t pt-4">
              {isStaff ? (
                <p className="mb-3 text-sm font-medium">
                  {monthName(month)} actions
                </p>
              ) : null}
              <MonthActions
                month={month}
                year={year}
                entryCount={records.length}
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

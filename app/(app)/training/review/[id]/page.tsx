import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarOff } from "lucide-react";

import { EmptyState } from "@/components/training/empty-state";
import { EntriesTable } from "@/components/training/entries-table";
import { StatusBadge } from "@/components/training/status-badge";
import { TargetProgress } from "@/components/training/target-progress";
import { VerificationTrail } from "@/components/training/verification-trail";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth";
import { getProfileName } from "@/lib/queries/profiles";
import { getTargets } from "@/lib/queries/settings";
import { getSubmissionById } from "@/lib/queries/submissions";
import { minutesToHHMM } from "@/lib/utils/duration";
import { monthName } from "@/lib/utils/targets";
import { idParamSchema } from "@/lib/validation/training";
import { VerificationPanel } from "./verification-panel";

export const metadata = { title: "Review submission — IRIS" };

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export default async function ReviewSubmissionPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();

  const id = idParamSchema.safeParse(params.id);
  if (!id.success) notFound();

  // RLS decides visibility, so an id the viewer may not see reads as missing.
  const submission = await getSubmissionById(id.data);
  if (!submission) notFound();

  const [targets, hodName, hrName, employeeHodName] = await Promise.all([
    getTargets(),
    getProfileName(submission.hod_verified_by),
    getProfileName(submission.hr_verified_by),
    getProfileName(submission.employee?.hod_id ?? null),
  ]);

  const employee = submission.employee;
  const backHref =
    profile.role === "hod"
      ? "/training/team"
      : profile.role === "hr_admin"
        ? "/training/approvals"
      : employee
        ? `/training/staff/${employee.id}?month=${submission.month}&year=${submission.year}`
        : "/training/submissions";
  const backLabel =
    profile.role === "hod"
      ? "Back to team submissions"
      : profile.role === "hr_admin"
        ? "Back to training submissions"
        : "Back to employee training";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-3">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {employee?.full_name ?? "Employee"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {monthName(submission.month)} {submission.year}
            </p>
          </div>

          <StatusBadge status={submission.status} isLate={submission.is_late} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Employee</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Designation
                </dt>
                <dd className="text-sm">{employee?.designation ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Department
                </dt>
                <dd className="text-sm">{employee?.department?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Head of department
                </dt>
                <dd className="text-sm">{employeeHodName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Date joined
                </dt>
                <dd className="text-sm">{formatDate(employee?.date_joined ?? null)}</dd>
              </div>
            </dl>

            <div className="mt-5 border-t pt-5">
              <TargetProgress
                label={`Recorded in ${monthName(submission.month)}`}
                approvedMinutes={submission.total_minutes}
                targetHours={targets.monthlyStandardHours}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verification trail</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {submission.is_nil_return ? (
            <EmptyState
              icon={CalendarOff}
              title="Nil return"
              description={`${employee?.full_name ?? "This employee"} reported no training for ${monthName(submission.month)} ${submission.year}.`}
            />
          ) : submission.records.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="No entries recorded"
              description="This month was submitted without any training entries."
            />
          ) : (
            <>
              <EntriesTable records={submission.records} />
              <div className="flex justify-end border-t pt-3 text-sm">
                <span className="text-muted-foreground">Month total</span>
                <span className="ml-3 font-semibold tabular-nums">
                  {minutesToHHMM(submission.total_minutes)}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decision</CardTitle>
        </CardHeader>
        <CardContent>
          <VerificationPanel
            submissionId={submission.id}
            status={submission.status}
            viewerRole={profile.role}
            isOwnSubmission={submission.employee_id === profile.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}

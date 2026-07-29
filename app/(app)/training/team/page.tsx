import Link from "next/link";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/training/empty-state";
import { StatusBadge } from "@/components/training/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { listTeamMembers } from "@/lib/queries/users";
import { getTargets } from "@/lib/queries/settings";
import { listTeamSubmissionsForMonth } from "@/lib/queries/submissions";
import { minutesToHHMM } from "@/lib/utils/duration";
import { isOverdue, monthName } from "@/lib/utils/targets";
import { MonthPicker } from "../month-picker";

export const metadata = { title: "Team submissions — IRIS" };

export default async function TeamPage({
  searchParams,
}: {
  searchParams: { month?: string; year?: string };
}) {
  const profile = await requireRole(["hod"]);
  const now = new Date();

  const monthParam = Number(searchParams.month);
  const yearParam = Number(searchParams.year);
  const month = monthParam >= 1 && monthParam <= 12 ? monthParam : now.getMonth() + 1;
  const year = yearParam >= 2000 && yearParam <= 2100 ? yearParam : now.getFullYear();

  const [targets, team] = await Promise.all([
    getTargets(),
    listTeamMembers(profile.id),
  ]);

  const submissions = await listTeamSubmissionsForMonth(
    team.map((member) => member.id),
    month,
    year,
  );

  const byEmployee = new Map(submissions.map((row) => [row.employee_id, row]));

  const rows = team.map((member) => ({
    member,
    submission: byEmployee.get(member.id) ?? null,
  }));

  const submittedCount = rows.filter(
    (row) => row.submission && row.submission.status !== "draft",
  ).length;
  const awaitingMe = rows.filter(
    (row) => row.submission?.status === "submitted_pending_hod",
  ).length;
  const notSubmitted = rows.filter(
    (row) => !row.submission || row.submission.status === "draft",
  );

  const currentYear = now.getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Team submissions
          </h1>
          <p className="text-sm text-muted-foreground">
            {monthName(month)} {year}
          </p>
        </div>

        <MonthPicker
          month={month}
          year={year}
          years={years}
          basePath="/training/team"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Submitted
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {submittedCount}
              <span className="text-base font-normal text-muted-foreground">
                {" / "}
                {team.length}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Awaiting my verification
            </p>
            <p className="text-2xl font-semibold tabular-nums">{awaitingMe}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Not yet submitted
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {notSubmitted.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {monthName(month)} {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {team.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No one reports to you yet"
              description="Once HR assigns team members to you, their monthly submissions appear here for verification."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Review</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map(({ member, submission }) => {
                  const overdue = isOverdue(
                    submission?.status ?? null,
                    month,
                    year,
                    targets.submissionDeadlineDay,
                    now,
                  );

                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <p className="font-medium">{member.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.designation ?? "—"}
                        </p>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge
                            status={submission?.status ?? null}
                            isLate={submission?.is_late ?? false}
                          />
                          {overdue ? (
                            <span className="text-xs font-medium text-destructive">
                              Overdue
                            </span>
                          ) : null}
                          {submission?.is_nil_return ? (
                            <span className="text-xs text-muted-foreground">
                              Nil return
                            </span>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        {submission ? minutesToHHMM(submission.total_minutes) : "—"}
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">
                        {submission?.submitted_at
                          ? new Date(submission.submitted_at).toLocaleDateString(
                              undefined,
                              { dateStyle: "medium" },
                            )
                          : "—"}
                      </TableCell>

                      <TableCell className="text-right">
                        {submission && submission.status !== "draft" ? (
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/training/review/${submission.id}`}>
                              {submission.status === "submitted_pending_hod"
                                ? "Verify"
                                : "View"}
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Nothing to review
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {notSubmitted.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Still waiting on</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {notSubmitted.map(({ member }) => (
                <li
                  key={member.id}
                  className="rounded-full border px-3 py-1 text-sm"
                >
                  {member.full_name}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

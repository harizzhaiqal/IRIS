"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  BellRing,
  Building2,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  MailCheck,
  UserRound,
} from "lucide-react";

import { CommissionPdfPreview } from "@/components/commission/commission-pdf-preview";
import { useCommission } from "@/components/commission/commission-provider";
import { CommissionStatusBadge } from "@/components/commission/commission-status";
import { EmptyState } from "@/components/training/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { commissionMonthLabel } from "@/lib/commission/demo-data";
import { formatCommissionDateTime } from "@/lib/commission/format";
import type { UserRole } from "@/lib/types";

export function CommissionDetailClient({
  recordId,
  profileId,
  profileName,
  role,
}: {
  recordId: number;
  profileId: number;
  profileName: string;
  role: UserRole;
}) {
  const {
    records,
    activityLogs,
    markEmailSent,
    sendReminder,
    markViewed,
    acknowledge,
  } = useCommission();
  const record = records.find((entry) => entry.id === recordId);
  const isHr = role === "hr_admin";
  const isReviewer = isHr || role === "ceo";
  const canAccess =
    record &&
    (isReviewer ||
      record.employeeId === profileId ||
      record.employeeName === profileName);

  if (!record || !canAccess) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Button asChild variant="ghost" size="sm">
          <Link href="/commission">
            <ArrowLeft className="h-4 w-4" />
            Back to commission records
          </Link>
        </Button>
        <EmptyState
          icon={FileText}
          title="Commission record not available"
          description="This record does not exist or is not assigned to your staff profile."
        />
      </div>
    );
  }

  const recordActivity = activityLogs.filter(
    (entry) => entry.commissionRecordId === record.id,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/commission">
            <ArrowLeft className="h-4 w-4" />
            Back to commission records
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {commissionMonthLabel(record.commissionMonth)} {record.commissionYear}
              </h1>
              <CommissionStatusBadge status={record.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Commission record #{record.id} for {record.employeeName}
            </p>
          </div>
          {!isReviewer ? (
            <CommissionPdfPreview
              record={record}
              onView={() => markViewed(record.id, record.employeeName)}
              trigger={
                <Button type="button">
                  <Eye className="h-4 w-4" />
                  View PDF
                </Button>
              }
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Record details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <DetailItem icon={UserRound} label="Staff" value={record.employeeName} />
              <DetailItem icon={Building2} label="Department" value={record.department} />
              <DetailItem
                icon={Clock3}
                label="Commission period"
                value={`${commissionMonthLabel(record.commissionMonth)} ${record.commissionYear}`}
              />
              <DetailItem icon={UserRound} label="Uploaded by" value={record.uploadedBy} />
              <DetailItem
                icon={FileText}
                label="Attachment"
                value={record.pdfFileName}
                className="sm:col-span-2"
              />
              <DetailItem
                icon={BellRing}
                label="Reminders"
                value={
                  record.reminderCount > 0
                    ? `${record.reminderCount} sent · Last ${formatCommissionDateTime(record.lastReminderSentAt)}`
                    : "No reminders sent"
                }
                className="sm:col-span-2"
              />
            </dl>

            <div className="mt-6 rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{record.pdfFileName}</p>
                  <p className="text-xs text-muted-foreground">
                    Prototype PDF attachment
                  </p>
                </div>
                <CommissionPdfPreview
                  record={record}
                  onView={isReviewer ? undefined : () => markViewed(record.id, record.employeeName)}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      <Eye className="h-4 w-4" />
                      Open PDF
                    </Button>
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-5">
              <TimelineItem
                icon={FileText}
                label="PDF uploaded"
                value={formatCommissionDateTime(record.uploadedAt)}
                complete
              />
              <TimelineItem
                icon={MailCheck}
                label="Email sent"
                value={formatCommissionDateTime(record.emailSentAt)}
                complete={Boolean(record.emailSentAt)}
              />
              <TimelineItem
                icon={Eye}
                label="Viewed"
                value={formatCommissionDateTime(record.viewedAt)}
                complete={Boolean(record.viewedAt)}
              />
              <TimelineItem
                icon={BadgeCheck}
                label="Acknowledged"
                value={formatCommissionDateTime(record.acknowledgedAt)}
                complete={Boolean(record.acknowledgedAt)}
              />
            </ol>
          </CardContent>
        </Card>
      </div>

      {isHr ? (
        <Card>
          <CardHeader>
            <CardTitle>HR actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={Boolean(record.emailSentAt)}
                onClick={() => markEmailSent(record.id)}
              >
                <MailCheck className="h-4 w-4" />
                {record.emailSentAt ? "Email sent" : "Mark email sent"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!record.emailSentAt || Boolean(record.viewedAt)}
                onClick={() => sendReminder(record.id)}
              >
                <BellRing className="h-4 w-4" />
                Send reminder
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(record.viewedAt)}
                onClick={() => markViewed(record.id, profileName)}
              >
                <Eye className="h-4 w-4" />
                Mark as viewed for demo
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!record.viewedAt || Boolean(record.acknowledgedAt)}
                onClick={() => acknowledge(record.id, profileName)}
              >
                <BadgeCheck className="h-4 w-4" />
                Mark as acknowledged for demo
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Reminder is available only after email is sent and before the staff
              member views the PDF. Acknowledgement follows viewing.
            </p>
          </CardContent>
        </Card>
      ) : !isReviewer ? (
        <Card>
          <CardHeader>
            <CardTitle>Your acknowledgement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">
                  {record.acknowledgedAt
                    ? "You have acknowledged this commission record."
                    : record.viewedAt
                      ? "Confirm that you have reviewed this commission record."
                      : "Open the PDF before acknowledging this record."}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {record.acknowledgedAt
                    ? formatCommissionDateTime(record.acknowledgedAt)
                    : "Your acknowledgement time will be recorded in the activity log."}
                </p>
              </div>
              <Button
                type="button"
                disabled={!record.viewedAt || Boolean(record.acknowledgedAt)}
                onClick={() => acknowledge(record.id, record.employeeName)}
              >
                <BadgeCheck className="h-4 w-4" />
                {record.acknowledgedAt ? "Acknowledged" : "Acknowledge record"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Commission activity</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Automation log entries for this record.
            </p>
          </div>
          <Badge variant="outline">{recordActivity.length}</Badge>
        </CardHeader>
        <CardContent>
          {recordActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity has been recorded for this commission document yet.
            </p>
          ) : (
            <ul className="divide-y">
              {recordActivity.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <div>
                      <p className="text-sm font-medium">{entry.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.description}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        By {entry.performedBy}
                      </p>
                    </div>
                  </div>
                  <time className="text-xs text-muted-foreground">
                    {formatCommissionDateTime(entry.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function TimelineItem({
  icon: Icon,
  label,
  value,
  complete,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  complete: boolean;
}) {
  return (
    <li className="flex gap-3">
      <div
        className={
          complete
            ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success"
            : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        }
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{value}</p>
      </div>
    </li>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BadgeCheck,
  BellRing,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  MailCheck,
  Plus,
  Sparkles,
} from "lucide-react";

import { CommissionPdfPreview } from "@/components/commission/commission-pdf-preview";
import {
  AcknowledgementStatusBadge,
  EmailStatusBadge,
  ViewStatusBadge,
} from "@/components/commission/commission-status";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/training/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCommission } from "@/components/commission/commission-provider";
import { commissionMonthLabel } from "@/lib/commission/demo-data";
import { formatCommissionDateTime } from "@/lib/commission/format";
import { getCommissionFollowUpSuggestion } from "@/lib/commission/insights";
import type { CommissionRecord, CommissionStatus, UserRole } from "@/lib/types";

const STATUS_FILTERS: CommissionStatus[] = [
  "PDF Uploaded",
  "Email Sent",
  "Viewed",
  "Not Viewed",
  "Acknowledged",
];

const selectClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

function isStatusMatch(record: CommissionRecord, status: string): boolean {
  if (!status) return true;
  if (status === "Not Viewed") return Boolean(record.emailSentAt && !record.viewedAt);
  if (status === "Email Sent") return Boolean(record.emailSentAt);
  if (status === "Viewed") return Boolean(record.viewedAt);
  if (status === "Acknowledged") return Boolean(record.acknowledgedAt);
  return record.status === status;
}

export function CommissionPageClient({
  profileId,
  profileName,
  role,
}: {
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
  const [month, setMonth] = useState("");
  const [department, setDepartment] = useState("");
  const [staff, setStaff] = useState("");
  const [status, setStatus] = useState("");
  const [feedback, setFeedback] = useState("");

  const isHr = role === "hr_admin";
  const isReviewer = isHr || role === "ceo";
  const visibleRecords = useMemo(
    () =>
      isReviewer
        ? records
        : records.filter(
            (record) =>
              record.employeeId === profileId || record.employeeName === profileName,
          ),
    [isReviewer, profileId, profileName, records],
  );

  const filteredRecords = useMemo(
    () =>
      visibleRecords.filter(
        (record) =>
          (!month || record.commissionMonth === Number(month)) &&
          (!department || record.department === department) &&
          (!staff || record.employeeName === staff) &&
          isStatusMatch(record, status),
      ),
    [department, month, staff, status, visibleRecords],
  );

  const departments = Array.from(
    new Set(visibleRecords.map((record) => record.department)),
  ).sort();
  const staffNames = Array.from(
    new Set(visibleRecords.map((record) => record.employeeName)),
  ).sort();
  const months = Array.from(
    new Set(visibleRecords.map((record) => record.commissionMonth)),
  ).sort((left, right) => right - left);

  const totalUploaded = visibleRecords.length;
  const emailSent = visibleRecords.filter((record) => record.emailSentAt).length;
  const viewed = visibleRecords.filter((record) => record.viewedAt).length;
  const notViewed = visibleRecords.filter(
    (record) => record.emailSentAt && !record.viewedAt,
  ).length;
  const acknowledged = visibleRecords.filter(
    (record) => record.acknowledgedAt,
  ).length;

  const latestRecord = [...visibleRecords].sort(
    (left, right) =>
      right.commissionYear - left.commissionYear ||
      right.commissionMonth - left.commissionMonth ||
      right.updatedAt.localeCompare(left.updatedAt),
  )[0];
  const pendingAcknowledgement = visibleRecords.filter(
    (record) => record.viewedAt && !record.acknowledgedAt,
  ).length;
  const suggestion = getCommissionFollowUpSuggestion(visibleRecords);

  function handleEmail(record: CommissionRecord) {
    markEmailSent(record.id);
    setFeedback(`Email marked as sent for ${record.employeeName}.`);
  }

  function handleReminder(record: CommissionRecord) {
    sendReminder(record.id);
    setFeedback(`Reminder sent to ${record.employeeName}.`);
  }

  function handleViewed(record: CommissionRecord) {
    markViewed(record.id, isHr ? profileName : record.employeeName);
    setFeedback(`${record.pdfFileName} marked as viewed.`);
  }

  function handleAcknowledged(record: CommissionRecord) {
    acknowledge(record.id, isHr ? profileName : record.employeeName);
    setFeedback(`${record.employeeName}'s record marked as acknowledged.`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isReviewer ? "Commission records" : "My commission records"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isReviewer
              ? "Track uploaded commission documents, delivery, viewing, and acknowledgement."
              : "Open your commission documents and confirm when you have reviewed them."}
          </p>
        </div>
        {isHr ? (
          <Button asChild>
            <Link href="/commission/new">
              <Plus className="h-4 w-4" />
              Upload commission PDF
            </Link>
          </Button>
        ) : null}
      </div>

      {feedback ? (
        <div
          className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {feedback}
        </div>
      ) : null}

      {isReviewer ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Total uploaded" value={totalUploaded} icon={FileUp} />
          <StatCard label="Email sent" value={emailSent} icon={MailCheck} />
          <StatCard label="Viewed" value={viewed} icon={Eye} tone="success" />
          <StatCard
            label="Not viewed"
            value={notViewed}
            icon={EyeOff}
            tone={notViewed > 0 ? "warning" : "success"}
          />
          <StatCard
            label="Acknowledged"
            value={acknowledged}
            icon={BadgeCheck}
            tone="success"
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Latest commission"
            value={
              latestRecord
                ? commissionMonthLabel(latestRecord.commissionMonth).slice(0, 3)
                : "—"
            }
            hint={latestRecord ? String(latestRecord.commissionYear) : "No record yet"}
            icon={FileText}
          />
          <StatCard
            label="Viewed records"
            value={viewed}
            hint={`${visibleRecords.length} total records`}
            icon={Eye}
            tone={viewed === visibleRecords.length ? "success" : "default"}
          />
          <StatCard
            label="Pending acknowledgement"
            value={pendingAcknowledgement}
            hint="Viewed and awaiting confirmation"
            icon={BadgeCheck}
            tone={pendingAcknowledgement > 0 ? "warning" : "success"}
          />
        </div>
      )}

      {isHr ? (
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                AI follow-up suggestion
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Deterministic guidance based on the current commission records.
              </p>
            </div>
            <Badge variant={suggestion.actionNeeded ? "warning" : "success"}>
              {suggestion.actionNeeded ? "Follow-up" : "All clear"}
            </Badge>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6">{suggestion.summary}</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              {suggestion.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {isReviewer ? (
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                Month
                <select
                  className={selectClassName}
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                >
                  <option value="">All months</option>
                  {months.map((value) => (
                    <option key={value} value={value}>
                      {commissionMonthLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                Department
                <select
                  className={selectClassName}
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                >
                  <option value="">All departments</option>
                  {departments.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                Staff
                <select
                  className={selectClassName}
                  value={staff}
                  onChange={(event) => setStaff(event.target.value)}
                >
                  <option value="">All staff</option>
                  {staffNames.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                Status
                <select
                  className={selectClassName}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">All statuses</option>
                  {STATUS_FILTERS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={!month && !department && !staff && !status}
                  onClick={() => {
                    setMonth("");
                    setDepartment("");
                    setStaff("");
                    setStatus("");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>
              {filteredRecords.length} {filteredRecords.length === 1 ? "record" : "records"}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {isReviewer ? "Commission document register" : "Your document history"}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRecords.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No commission records found"
              description={
                isReviewer
                  ? "Clear or widen the filters to see more commission records."
                  : "Your commission PDFs will appear here after HR uploads them."
              }
            />
          ) : (
            <CommissionRecordsTable
              records={filteredRecords}
              isReviewer={isReviewer}
              canManage={isHr}
              onEmail={handleEmail}
              onReminder={handleReminder}
              onViewed={handleViewed}
              onAcknowledged={handleAcknowledged}
            />
          )}
        </CardContent>
      </Card>

      {isReviewer ? (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Commission automation log</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Recent prototype actions across commission records.
              </p>
            </div>
            <BellRing className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {activityLogs.slice(0, 6).map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium">{entry.action}</p>
                    <p className="text-xs text-muted-foreground">{entry.description}</p>
                  </div>
                  <time className="text-xs text-muted-foreground">
                    {formatCommissionDateTime(entry.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function CommissionRecordsTable({
  records,
  isReviewer,
  canManage,
  onEmail,
  onReminder,
  onViewed,
  onAcknowledged,
}: {
  records: CommissionRecord[];
  isReviewer: boolean;
  canManage: boolean;
  onEmail: (record: CommissionRecord) => void;
  onReminder: (record: CommissionRecord) => void;
  onViewed: (record: CommissionRecord) => void;
  onAcknowledged: (record: CommissionRecord) => void;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              {isReviewer ? <th className="pb-2 pr-3 font-medium">Staff</th> : null}
              {isReviewer ? <th className="pb-2 pr-3 font-medium">Department</th> : null}
              <th className="pb-2 pr-3 font-medium">Month</th>
              <th className="pb-2 pr-3 font-medium">PDF</th>
              <th className="pb-2 pr-3 font-medium">Email</th>
              <th className="pb-2 pr-3 font-medium">View</th>
              <th className="pb-2 pr-3 font-medium">Acknowledgement</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-b align-top last:border-0">
                {isReviewer ? (
                  <td className="py-3 pr-3 font-medium">{record.employeeName}</td>
                ) : null}
                {isReviewer ? (
                  <td className="py-3 pr-3 text-muted-foreground">{record.department}</td>
                ) : null}
                <td className="py-3 pr-3 whitespace-nowrap">
                  {commissionMonthLabel(record.commissionMonth)} {record.commissionYear}
                </td>
                <td className="max-w-44 py-3 pr-3">
                  <CommissionPdfPreview
                    record={record}
                    onView={isReviewer ? undefined : () => onViewed(record)}
                    trigger={
                      <button
                        type="button"
                        className="block max-w-full truncate text-left font-medium text-primary hover:underline"
                        title={record.pdfFileName}
                      >
                        {record.pdfFileName}
                      </button>
                    }
                  />
                </td>
                <td className="py-3 pr-3">
                  <EmailStatusBadge sentAt={record.emailSentAt} />
                </td>
                <td className="py-3 pr-3">
                  <ViewStatusBadge viewedAt={record.viewedAt} />
                </td>
                <td className="py-3 pr-3">
                  <AcknowledgementStatusBadge acknowledgedAt={record.acknowledgedAt} />
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/commission/${record.id}`}>Details</Link>
                    </Button>
                    {canManage && !record.emailSentAt ? (
                      <Button size="sm" onClick={() => onEmail(record)}>
                        Mark email sent
                      </Button>
                    ) : null}
                    {canManage && record.emailSentAt && !record.viewedAt ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onReminder(record)}
                      >
                        Reminder
                      </Button>
                    ) : null}
                    {!isReviewer && record.viewedAt && !record.acknowledgedAt ? (
                      <Button size="sm" onClick={() => onAcknowledged(record)}>
                        Acknowledge
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 lg:hidden">
        {records.map((record) => (
          <li key={record.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {isReviewer ? record.employeeName : commissionMonthLabel(record.commissionMonth)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isReviewer
                    ? `${record.department} · ${commissionMonthLabel(record.commissionMonth)} ${record.commissionYear}`
                    : `${record.commissionYear} · ${record.department}`}
                </p>
              </div>
              <AcknowledgementStatusBadge acknowledgedAt={record.acknowledgedAt} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <EmailStatusBadge sentAt={record.emailSentAt} />
              <ViewStatusBadge viewedAt={record.viewedAt} />
            </div>
            <p className="mt-3 truncate text-xs text-muted-foreground">
              {record.pdfFileName}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
              <Button asChild size="sm" variant="outline">
                <Link href={`/commission/${record.id}`}>Details</Link>
              </Button>
              <CommissionPdfPreview
                record={record}
                onView={isReviewer ? undefined : () => onViewed(record)}
                trigger={
                  <Button type="button" size="sm" variant="outline">
                    <Eye className="h-4 w-4" />
                    View PDF
                  </Button>
                }
              />
              {canManage && !record.emailSentAt ? (
                <Button size="sm" onClick={() => onEmail(record)}>
                  Mark email sent
                </Button>
              ) : null}
              {canManage && record.emailSentAt && !record.viewedAt ? (
                <Button size="sm" variant="secondary" onClick={() => onReminder(record)}>
                  Reminder
                </Button>
              ) : null}
              {!isReviewer && record.viewedAt && !record.acknowledgedAt ? (
                <Button size="sm" onClick={() => onAcknowledged(record)}>
                  Acknowledge
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

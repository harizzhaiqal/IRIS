"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  INITIAL_COMMISSION_ACTIVITY,
  INITIAL_COMMISSION_RECORDS,
  INITIAL_COMMISSION_VIEW_LOGS,
  commissionMonthLabel,
  type CommissionEmployee,
} from "@/lib/commission/demo-data";
import type {
  CommissionActivityAction,
  CommissionActivityLog,
  CommissionRecord,
  CommissionViewLog,
  UserRole,
} from "@/lib/types";

const STORAGE_KEY = "iris-commission-prototype-v1";

type CommissionViewer = {
  id: number;
  name: string;
  role: UserRole;
};

type NewCommissionRecord = {
  employee: CommissionEmployee;
  commissionMonth: number;
  commissionYear: number;
  pdfFileName: string;
};

type CommissionContextValue = {
  viewer: CommissionViewer;
  records: CommissionRecord[];
  viewLogs: CommissionViewLog[];
  activityLogs: CommissionActivityLog[];
  createRecord: (input: NewCommissionRecord) => number;
  markEmailSent: (recordId: number) => void;
  sendReminder: (recordId: number) => void;
  markViewed: (recordId: number, performedBy?: string) => void;
  acknowledge: (recordId: number, performedBy?: string) => void;
};

type StoredCommissionState = {
  records: CommissionRecord[];
  viewLogs: CommissionViewLog[];
  activityLogs: CommissionActivityLog[];
};

const CommissionContext = createContext<CommissionContextValue | null>(null);

function isStoredState(value: unknown): value is StoredCommissionState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredCommissionState>;
  return (
    Array.isArray(candidate.records) &&
    Array.isArray(candidate.viewLogs) &&
    Array.isArray(candidate.activityLogs)
  );
}

function mergeSeededItems<T extends { id: number }>(
  stored: T[],
  seeded: T[],
): T[] {
  const storedIds = new Set(stored.map((item) => item.id));
  return [...seeded.filter((item) => !storedIds.has(item.id)), ...stored];
}

export function CommissionProvider({
  viewer,
  children,
}: {
  viewer: CommissionViewer;
  children: React.ReactNode;
}) {
  const [records, setRecords] = useState<CommissionRecord[]>(
    INITIAL_COMMISSION_RECORDS,
  );
  const [viewLogs, setViewLogs] = useState<CommissionViewLog[]>(
    INITIAL_COMMISSION_VIEW_LOGS,
  );
  const [activityLogs, setActivityLogs] = useState<CommissionActivityLog[]>(
    INITIAL_COMMISSION_ACTIVITY,
  );
  const [storageLoaded, setStorageLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isStoredState(parsed)) {
          setRecords(
            mergeSeededItems(parsed.records, INITIAL_COMMISSION_RECORDS),
          );
          setViewLogs(
            mergeSeededItems(parsed.viewLogs, INITIAL_COMMISSION_VIEW_LOGS),
          );
          setActivityLogs(
            mergeSeededItems(parsed.activityLogs, INITIAL_COMMISSION_ACTIVITY),
          );
        }
      }
    } catch {
      // A private browser session can reject storage. The in-memory prototype
      // remains fully usable, so there is nothing the user needs to resolve.
    } finally {
      setStorageLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ records, viewLogs, activityLogs }),
      );
    } catch {
      // Keep the prototype working in memory if browser storage is unavailable.
    }
  }, [activityLogs, records, storageLoaded, viewLogs]);

  const addActivity = useCallback(
    (
      commissionRecordId: number,
      action: CommissionActivityAction,
      description: string,
      performedBy: string,
      createdAt: string,
    ) => {
      setActivityLogs((current) => [
        {
          id: Date.now(),
          commissionRecordId,
          action,
          description,
          performedBy,
          createdAt,
        },
        ...current,
      ]);
    },
    [],
  );

  const createRecord = useCallback(
    (input: NewCommissionRecord) => {
      const now = new Date().toISOString();
      const id = Math.max(0, ...records.map((record) => record.id)) + 1;
      const record: CommissionRecord = {
        id,
        employeeId: input.employee.id,
        employeeName: input.employee.name,
        department: input.employee.department,
        commissionMonth: input.commissionMonth,
        commissionYear: input.commissionYear,
        pdfFileName: input.pdfFileName,
        uploadedBy: viewer.name,
        uploadedAt: now,
        status: "PDF Uploaded",
        reminderCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      setRecords((current) => [record, ...current]);
      addActivity(
        id,
        "Commission PDF uploaded",
        `${commissionMonthLabel(input.commissionMonth)} ${input.commissionYear} commission PDF uploaded for ${input.employee.name}.`,
        viewer.name,
        now,
      );
      return id;
    },
    [addActivity, records, viewer.name],
  );

  const markEmailSent = useCallback(
    (recordId: number) => {
      const record = records.find((entry) => entry.id === recordId);
      if (!record || record.emailSentAt) return;

      const now = new Date().toISOString();
      setRecords((current) =>
        current.map((entry) =>
          entry.id === recordId
            ? {
                ...entry,
                emailSentAt: now,
                status: entry.viewedAt ? entry.status : "Email Sent",
                updatedAt: now,
              }
            : entry,
        ),
      );
      addActivity(
        recordId,
        "Commission email marked sent",
        `Commission email marked sent to ${record.employeeName} for ${commissionMonthLabel(record.commissionMonth)} ${record.commissionYear}.`,
        viewer.name,
        now,
      );
    },
    [addActivity, records, viewer.name],
  );

  const sendReminder = useCallback(
    (recordId: number) => {
      const record = records.find((entry) => entry.id === recordId);
      if (!record || !record.emailSentAt || record.viewedAt) return;

      const now = new Date().toISOString();
      const nextReminder = record.reminderCount + 1;
      setRecords((current) =>
        current.map((entry) =>
          entry.id === recordId
            ? {
                ...entry,
                status: "Not Viewed",
                reminderCount: nextReminder,
                lastReminderSentAt: now,
                updatedAt: now,
              }
            : entry,
        ),
      );
      addActivity(
        recordId,
        "Commission reminder sent",
        `Reminder ${nextReminder} sent to ${record.employeeName} for ${commissionMonthLabel(record.commissionMonth)} ${record.commissionYear}.`,
        viewer.name,
        now,
      );
    },
    [addActivity, records, viewer.name],
  );

  const markViewed = useCallback(
    (recordId: number, performedBy = viewer.name) => {
      const record = records.find((entry) => entry.id === recordId);
      if (!record || record.viewedAt) return;

      const now = new Date().toISOString();
      setRecords((current) =>
        current.map((entry) =>
          entry.id === recordId
            ? { ...entry, viewedAt: now, status: "Viewed", updatedAt: now }
            : entry,
        ),
      );
      setViewLogs((current) => [
        {
          id: Date.now(),
          commissionRecordId: recordId,
          employeeId: record.employeeId,
          viewedAt: now,
          action: "Commission PDF viewed",
        },
        ...current,
      ]);
      addActivity(
        recordId,
        "Commission PDF viewed",
        `${record.employeeName} viewed the ${commissionMonthLabel(record.commissionMonth)} ${record.commissionYear} commission PDF.`,
        performedBy,
        now,
      );
    },
    [addActivity, records, viewer.name],
  );

  const acknowledge = useCallback(
    (recordId: number, performedBy = viewer.name) => {
      const record = records.find((entry) => entry.id === recordId);
      if (!record || !record.viewedAt || record.acknowledgedAt) return;

      const now = new Date().toISOString();
      setRecords((current) =>
        current.map((entry) =>
          entry.id === recordId
            ? {
                ...entry,
                acknowledgedAt: now,
                status: "Acknowledged",
                updatedAt: now,
              }
            : entry,
        ),
      );
      addActivity(
        recordId,
        "Commission acknowledged",
        `${record.employeeName} acknowledged the ${commissionMonthLabel(record.commissionMonth)} ${record.commissionYear} commission record.`,
        performedBy,
        now,
      );
    },
    [addActivity, records, viewer.name],
  );

  const value = useMemo<CommissionContextValue>(
    () => ({
      viewer,
      records,
      viewLogs,
      activityLogs,
      createRecord,
      markEmailSent,
      sendReminder,
      markViewed,
      acknowledge,
    }),
    [
      acknowledge,
      activityLogs,
      createRecord,
      markEmailSent,
      markViewed,
      records,
      sendReminder,
      viewer,
      viewLogs,
    ],
  );

  return (
    <CommissionContext.Provider value={value}>
      {children}
    </CommissionContext.Provider>
  );
}

export function useCommission(): CommissionContextValue {
  const context = useContext(CommissionContext);
  if (!context) {
    throw new Error("useCommission must be used inside CommissionProvider");
  }
  return context;
}

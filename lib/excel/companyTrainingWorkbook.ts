import ExcelJS from "exceljs";

import {
  EFFECTIVENESS_LABELS,
  STATUS_LABELS,
  type SubmissionStatus,
} from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import { MONTH_NAMES } from "@/lib/utils/targets";
import type { ExportInput, ExportMonth } from "./trainingWorkbook";

const BRAND = "FF0A6871";
const HEADER_FILL = "FFE6F2F3";
const APPROVED_FILL = "FFDFF2E8";
const PENDING_FILL = "FFFFF3CD";
const ATTENTION_FILL = "FFFDE8E8";
const DRAFT_FILL = "FFF1F5F9";
const PENDING_STATUSES = new Set<SubmissionStatus>([
  "submitted_pending_hod",
  "hod_verified",
]);

function styleTitle(sheet: ExcelJS.Worksheet, title: string, columns: number) {
  sheet.mergeCells(1, 1, 1, columns);
  const cell = sheet.getCell(1, 1);
  cell.value = title;
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  cell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 26;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, size: 10 };
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 28;

  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.border = { bottom: { style: "thin", color: { argb: BRAND } } };
  });
}

function recordedMinutes(input: ExportInput) {
  return input.months.reduce((total, month) => total + month.totalMinutes, 0);
}

function approvedMinutes(input: ExportInput) {
  return input.months.reduce(
    (total, month) =>
      total + (month.status === "approved" ? month.totalMinutes : 0),
    0,
  );
}

function pendingMinutes(input: ExportInput) {
  return input.months.reduce(
    (total, month) =>
      total +
      (month.status && PENDING_STATUSES.has(month.status)
        ? month.totalMinutes
        : 0),
    0,
  );
}

function trainingCount(input: ExportInput) {
  return input.months.reduce(
    (total, month) => total + month.entries.length,
    0,
  );
}

function monthFor(input: ExportInput, month: number): ExportMonth | null {
  return input.months.find((item) => item.month === month) ?? null;
}

function statusFill(status: SubmissionStatus | null): string | null {
  if (status === "approved") return APPROVED_FILL;
  if (status && PENDING_STATUSES.has(status)) return PENDING_FILL;
  if (status === "returned_by_hod" || status === "rejected") {
    return ATTENTION_FILL;
  }
  if (status === "draft") return DRAFT_FILL;
  return null;
}

function addEmployeeSummary(
  workbook: ExcelJS.Workbook,
  inputs: ExportInput[],
  year: number,
) {
  const sheet = workbook.addWorksheet("Employee Summary", {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  sheet.columns = [
    { width: 28 },
    { width: 22 },
    { width: 24 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 20 },
    { width: 18 },
  ];
  styleTitle(sheet, `Company training summary — ${year}`, 9);

  const header = sheet.getRow(3);
  header.values = [
    "Employee",
    "Department",
    "Designation",
    "Training sessions",
    "Recorded hours",
    "Approved hours",
    "Pending hours",
    "Progress against standard",
    "Meets minimum",
  ];
  styleHeader(header);

  for (const input of inputs) {
    const approved = approvedMinutes(input);
    const standardMinutes = input.targets.yearlyStandardHours * 60;
    const thresholdMinutes = input.targets.yearlyThresholdHours * 60;
    const row = sheet.addRow([
      input.employee.fullName,
      input.employee.department ?? "—",
      input.employee.designation ?? "—",
      trainingCount(input),
      minutesToHHMM(recordedMinutes(input)),
      minutesToHHMM(approved),
      minutesToHHMM(pendingMinutes(input)),
      standardMinutes > 0
        ? `${Math.min(100, (approved / standardMinutes) * 100).toFixed(1)}%`
        : "0.0%",
      approved >= thresholdMinutes ? "Yes" : "No",
    ]);
    row.font = { size: 10 };
    row.getCell(9).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: approved >= thresholdMinutes ? APPROVED_FILL : ATTENTION_FILL,
      },
    };
  }

  if (inputs.length > 0) {
    sheet.autoFilter = { from: "A3", to: `I${inputs.length + 3}` };
  }
}

function addMonthlySummary(
  workbook: ExcelJS.Workbook,
  inputs: ExportInput[],
  year: number,
) {
  const sheet = workbook.addWorksheet("Monthly Summary", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 3 }],
  });
  sheet.columns = [
    { width: 28 },
    { width: 22 },
    ...MONTH_NAMES.map(() => ({ width: 12 })),
    { width: 14 },
  ];
  styleTitle(sheet, `Monthly recorded hours — ${year}`, 15);

  const header = sheet.getRow(3);
  header.values = ["Employee", "Department", ...MONTH_NAMES, "Year total"];
  styleHeader(header);

  for (const input of inputs) {
    const row = sheet.addRow([
      input.employee.fullName,
      input.employee.department ?? "—",
      ...MONTH_NAMES.map((_, index) =>
        minutesToHHMM(monthFor(input, index + 1)?.totalMinutes ?? 0),
      ),
      minutesToHHMM(recordedMinutes(input)),
    ]);
    row.font = { size: 10 };

    for (let month = 1; month <= 12; month += 1) {
      const found = monthFor(input, month);
      const fill = statusFill(found?.status ?? null);
      if (fill) {
        row.getCell(month + 2).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: fill },
        };
      }
      row.getCell(month + 2).note = found
        ? `${STATUS_LABELS[found.status ?? "draft"]}${found.isLate ? " · Late" : ""}`
        : "Not started";
    }
  }
}

function addDepartmentSummary(
  workbook: ExcelJS.Workbook,
  inputs: ExportInput[],
  year: number,
) {
  const sheet = workbook.addWorksheet("Department Summary", {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  sheet.columns = [
    { width: 24 },
    { width: 14 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 24 },
    { width: 24 },
  ];
  styleTitle(sheet, `Department training summary — ${year}`, 7);

  const header = sheet.getRow(3);
  header.values = [
    "Department",
    "Employees",
    "Training sessions",
    "Recorded hours",
    "Approved hours",
    "Average approved hours",
    "Employees meeting minimum",
  ];
  styleHeader(header);

  const grouped = new Map<string, ExportInput[]>();
  for (const input of inputs) {
    const department = input.employee.department ?? "No department";
    grouped.set(department, [...(grouped.get(department) ?? []), input]);
  }

  for (const [department, employees] of Array.from(grouped.entries()).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const recorded = employees.reduce(
      (total, input) => total + recordedMinutes(input),
      0,
    );
    const approved = employees.reduce(
      (total, input) => total + approvedMinutes(input),
      0,
    );
    const count = employees.reduce(
      (total, input) => total + trainingCount(input),
      0,
    );
    const meetsMinimum = employees.filter(
      (input) =>
        approvedMinutes(input) >= input.targets.yearlyThresholdHours * 60,
    ).length;

    sheet.addRow([
      department,
      employees.length,
      count,
      minutesToHHMM(recorded),
      minutesToHHMM(approved),
      minutesToHHMM(Math.round(approved / Math.max(1, employees.length))),
      `${meetsMinimum} of ${employees.length}`,
    ]).font = { size: 10 };
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function addAllEntries(
  workbook: ExcelJS.Workbook,
  inputs: ExportInput[],
  year: number,
) {
  const sheet = workbook.addWorksheet("All Training Entries", {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  sheet.columns = [
    { width: 28 },
    { width: 22 },
    { width: 14 },
    { width: 16 },
    { width: 38 },
    { width: 26 },
    { width: 16 },
    { width: 18 },
    { width: 22 },
  ];
  styleTitle(sheet, `All training entries — ${year}`, 9);

  const header = sheet.getRow(3);
  header.values = [
    "Employee",
    "Department",
    "Month",
    "Date",
    "Training",
    "Trainer / provider",
    "Recorded hours",
    "Effectiveness",
    "Submission status",
  ];
  styleHeader(header);

  for (const input of inputs) {
    for (const month of input.months) {
      for (const entry of month.entries) {
        sheet.addRow([
          input.employee.fullName,
          input.employee.department ?? "—",
          MONTH_NAMES[month.month - 1],
          formatDate(entry.startDatetime),
          entry.title,
          entry.trainerProvider ?? "—",
          minutesToHHMM(entry.recordedMinutes),
          entry.effectiveness
            ? EFFECTIVENESS_LABELS[entry.effectiveness]
            : "—",
          month.status ? STATUS_LABELS[month.status] : "Not started",
        ]).font = { size: 10 };
      }
    }
  }

  if (sheet.rowCount > 3) {
    sheet.autoFilter = { from: "A3", to: `I${sheet.rowCount}` };
  }
}

export function buildCompanyTrainingWorkbook(
  inputs: ExportInput[],
  year: number,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "IRIS — IRS Records and Insight System";
  workbook.created = new Date();

  addEmployeeSummary(workbook, inputs, year);
  addMonthlySummary(workbook, inputs, year);
  addDepartmentSummary(workbook, inputs, year);
  addAllEntries(workbook, inputs, year);
  return workbook;
}

export function companyWorkbookFilename(year: number) {
  return `Company-Training-Summary-${year}.xlsx`;
}

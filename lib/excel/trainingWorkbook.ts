import ExcelJS from "exceljs";

import {
  EFFECTIVENESS_LABELS,
  STATUS_LABELS,
  type Effectiveness,
  type SubmissionStatus,
} from "@/lib/types";
import { minutesToHHMM } from "@/lib/utils/duration";
import { MONTH_NAMES, yearlyCompliance, type Targets } from "@/lib/utils/targets";

/**
 * Rebuilds form IRS-HR-F14 as a workbook: twelve monthly sheets and a yearly
 * total, one file per employee per year — the shape the Excel process used
 * before IRIS, so a printed export still matches what people signed.
 *
 * Built from a plain data shape rather than from database rows, so the layout
 * can be unit tested without a database.
 */

export type ExportEntry = {
  seqNo: number;
  title: string;
  startDatetime: string;
  endDatetime: string;
  calculatedMinutes: number;
  recordedMinutes: number;
  overrideReason: string | null;
  location: string | null;
  trainerProvider: string | null;
  effectiveness: Effectiveness | null;
  remarks: string | null;
};

export type ExportMonth = {
  month: number;
  status: SubmissionStatus | null;
  isNilReturn: boolean;
  isLate: boolean;
  totalMinutes: number;
  hodVerifiedBy: string | null;
  hodVerifiedAt: string | null;
  hrVerifiedBy: string | null;
  hrVerifiedAt: string | null;
  entries: ExportEntry[];
};

export type ExportEmployee = {
  fullName: string;
  email: string;
  designation: string | null;
  department: string | null;
  hodName: string | null;
  dateJoined: string | null;
};

export type ExportInput = {
  employee: ExportEmployee;
  year: number;
  months: ExportMonth[];
  targets: Targets;
};

const HEADINGS = [
  "No.",
  "Training title",
  "Start",
  "End",
  "Calculated",
  "Recorded",
  "Reason for difference",
  "Location",
  "Trainer / provider",
  "Effectiveness",
  "Remarks",
];

const COLUMN_WIDTHS = [6, 38, 18, 18, 12, 12, 30, 20, 24, 16, 30];

const BRAND = "FF0A6871";
const HEADER_FILL = "FFE6F2F3";

function formatDateTime(value: string): string {
  const date = new Date(value);
  return date.toLocaleString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function titleCell(sheet: ExcelJS.Worksheet, row: number, text: string) {
  sheet.mergeCells(row, 1, row, HEADINGS.length);
  const cell = sheet.getCell(row, 1);
  cell.value = text;
  cell.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(row).height = 24;
}

function labelled(
  sheet: ExcelJS.Worksheet,
  row: number,
  pairs: [string, string][],
) {
  let column = 1;
  for (const [label, value] of pairs) {
    const labelCell = sheet.getCell(row, column);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 10 };

    const valueCell = sheet.getCell(row, column + 1);
    valueCell.value = value;
    valueCell.font = { size: 10 };
    column += 3;
  }
}

/** One month: the header block, the entries table, totals, and sign-off. */
function buildMonthSheet(
  workbook: ExcelJS.Workbook,
  input: ExportInput,
  month: ExportMonth,
) {
  const sheet = workbook.addWorksheet(MONTH_NAMES[month.month - 1]);
  sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  titleCell(sheet, 1, "Employee Training Record & Evaluation (IRS-HR-F14)");
  titleCell(sheet, 2, `${MONTH_NAMES[month.month - 1]} ${input.year}`);

  labelled(sheet, 4, [
    ["Name", input.employee.fullName],
    ["Designation", input.employee.designation ?? "—"],
  ]);
  labelled(sheet, 5, [
    ["Department", input.employee.department ?? "—"],
    ["Head of department", input.employee.hodName ?? "—"],
  ]);
  labelled(sheet, 6, [
    ["Date joined", formatDate(input.employee.dateJoined)],
    ["Email", input.employee.email],
  ]);

  const headerRow = 8;
  const header = sheet.getRow(headerRow);
  header.values = HEADINGS;
  header.font = { bold: true, size: 10 };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 28;
  for (let i = 1; i <= HEADINGS.length; i += 1) {
    header.getCell(i).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    header.getCell(i).border = { bottom: { style: "thin" } };
  }

  let row = headerRow + 1;

  if (month.isNilReturn) {
    sheet.mergeCells(row, 1, row, HEADINGS.length);
    const cell = sheet.getCell(row, 1);
    cell.value = "Nil return — no training recorded for this month.";
    cell.font = { italic: true, size: 10 };
    cell.alignment = { horizontal: "center" };
    row += 1;
  } else if (month.entries.length === 0) {
    sheet.mergeCells(row, 1, row, HEADINGS.length);
    const cell = sheet.getCell(row, 1);
    cell.value = "No entries recorded.";
    cell.font = { italic: true, size: 10 };
    cell.alignment = { horizontal: "center" };
    row += 1;
  } else {
    for (const entry of month.entries) {
      const line = sheet.getRow(row);
      line.values = [
        entry.seqNo,
        entry.title,
        formatDateTime(entry.startDatetime),
        formatDateTime(entry.endDatetime),
        minutesToHHMM(entry.calculatedMinutes),
        minutesToHHMM(entry.recordedMinutes),
        // Only meaningful when the two figures disagree, which is the case the
        // reviewer is being asked to look at.
        entry.recordedMinutes === entry.calculatedMinutes
          ? ""
          : (entry.overrideReason ?? ""),
        entry.location ?? "",
        entry.trainerProvider ?? "",
        entry.effectiveness ? EFFECTIVENESS_LABELS[entry.effectiveness] : "",
        entry.remarks ?? "",
      ];
      line.font = { size: 10 };
      line.alignment = { vertical: "top", wrapText: true };
      row += 1;
    }
  }

  row += 1;
  const totalRow = sheet.getRow(row);
  totalRow.getCell(4).value = "Month total";
  totalRow.getCell(4).font = { bold: true, size: 10 };
  totalRow.getCell(6).value = minutesToHHMM(month.totalMinutes);
  totalRow.getCell(6).font = { bold: true, size: 10 };
  totalRow.getCell(7).value = `Target ${input.targets.monthlyStandardHours}:00`;
  totalRow.getCell(7).font = { size: 10 };

  row += 2;
  labelled(sheet, row, [
    [
      "Status",
      month.status ? STATUS_LABELS[month.status] : "Not started",
    ],
    ["Late", month.isLate ? "Yes" : "No"],
  ]);

  row += 2;
  sheet.getCell(row, 1).value = "Verification";
  sheet.getCell(row, 1).font = { bold: true, size: 11 };

  row += 1;
  labelled(sheet, row, [
    ["Verified by HOD", month.hodVerifiedBy ?? "—"],
    ["Date", formatDate(month.hodVerifiedAt)],
  ]);
  row += 1;
  labelled(sheet, row, [
    ["Approved by HR", month.hrVerifiedBy ?? "—"],
    ["Date", formatDate(month.hrVerifiedAt)],
  ]);

  return sheet;
}

/** The yearly total sheet: month by month, then the compliance figures. */
function buildYearSheet(workbook: ExcelJS.Workbook, input: ExportInput) {
  const sheet = workbook.addWorksheet("Yearly total", {
    properties: { tabColor: { argb: BRAND } },
  });
  sheet.columns = [
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 22 },
    { width: 14 },
  ];

  titleCell(sheet, 1, `Yearly training summary — ${input.year}`);

  labelled(sheet, 3, [["Name", input.employee.fullName]]);
  labelled(sheet, 4, [["Designation", input.employee.designation ?? "—"]]);
  labelled(sheet, 5, [["Department", input.employee.department ?? "—"]]);

  const headerRow = 7;
  const header = sheet.getRow(headerRow);
  header.values = ["Month", "Recorded", "Approved", "Status", "Entries"];
  header.font = { bold: true, size: 10 };
  for (let i = 1; i <= 5; i += 1) {
    header.getCell(i).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    header.getCell(i).border = { bottom: { style: "thin" } };
  }

  let row = headerRow + 1;
  let approvedMinutes = 0;
  let recordedMinutes = 0;

  for (let month = 1; month <= 12; month += 1) {
    const found = input.months.find((m) => m.month === month);
    const isApproved = found?.status === "approved";

    recordedMinutes += found?.totalMinutes ?? 0;
    if (isApproved) approvedMinutes += found?.totalMinutes ?? 0;

    const line = sheet.getRow(row);
    line.values = [
      MONTH_NAMES[month - 1],
      minutesToHHMM(found?.totalMinutes ?? 0),
      // Only approved hours count, so the two columns differ whenever a month
      // is still with a reviewer. Showing one number would overstate progress.
      isApproved ? minutesToHHMM(found?.totalMinutes ?? 0) : minutesToHHMM(0),
      found ? STATUS_LABELS[found.status ?? "draft"] : "Not started",
      found?.isNilReturn ? "Nil return" : (found?.entries.length ?? 0),
    ];
    line.font = { size: 10 };
    row += 1;
  }

  const totals = sheet.getRow(row);
  totals.values = [
    "Total",
    minutesToHHMM(recordedMinutes),
    minutesToHHMM(approvedMinutes),
    "",
    "",
  ];
  totals.font = { bold: true, size: 10 };
  totals.getCell(1).border = { top: { style: "thin" } };
  totals.getCell(2).border = { top: { style: "thin" } };
  totals.getCell(3).border = { top: { style: "thin" } };

  const compliance = yearlyCompliance(approvedMinutes, input.targets);

  row += 2;
  sheet.getCell(row, 1).value = "Compliance (approved hours only)";
  sheet.getCell(row, 1).font = { bold: true, size: 11 };

  row += 1;
  labelled(sheet, row, [
    [`Against standard (${input.targets.yearlyStandardHours}h)`,
      `${compliance.standardPercent.toFixed(1)}%`],
  ]);
  row += 1;
  labelled(sheet, row, [
    [`Against threshold (${input.targets.yearlyThresholdHours}h)`,
      `${compliance.thresholdPercent.toFixed(1)}%`],
  ]);
  row += 1;
  labelled(sheet, row, [
    ["Meets threshold", compliance.meetsThreshold ? "Yes" : "No"],
  ]);

  return sheet;
}

/**
 * Builds the workbook and returns it. Twelve monthly sheets are always present,
 * including empty ones, because the paper form had twelve tabs and a missing
 * month is itself information.
 */
export function buildTrainingWorkbook(input: ExportInput): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "IRIS — IRS Records and Insight System";
  workbook.created = new Date();

  for (let month = 1; month <= 12; month += 1) {
    const found = input.months.find((m) => m.month === month) ?? {
      month,
      status: null,
      isNilReturn: false,
      isLate: false,
      totalMinutes: 0,
      hodVerifiedBy: null,
      hodVerifiedAt: null,
      hrVerifiedBy: null,
      hrVerifiedAt: null,
      entries: [],
    };
    buildMonthSheet(workbook, input, found);
  }

  buildYearSheet(workbook, input);
  return workbook;
}

/** A filename that sorts and reads well in a downloads folder. */
export function workbookFilename(employeeName: string, year: number): string {
  const safe = employeeName.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  return `IRS-HR-F14-${safe || "employee"}-${year}.xlsx`;
}

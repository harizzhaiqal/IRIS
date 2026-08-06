import { describe, expect, it } from "vitest";

import { DEFAULT_TARGETS } from "@/lib/utils/targets";
import {
  buildCompanyTrainingWorkbook,
  companyWorkbookFilename,
} from "./companyTrainingWorkbook";
import type { ExportInput } from "./trainingWorkbook";

const inputs: ExportInput[] = [
  {
    employee: {
      fullName: "Amyra",
      email: "amyra@irs.com.my",
      designation: "Engineer",
      department: "R&D",
      hodName: "Joshua",
      dateJoined: "2024-01-15",
    },
    year: 2026,
    targets: DEFAULT_TARGETS,
    months: [
      {
        month: 1,
        status: "approved",
        isNilReturn: false,
        isLate: false,
        totalMinutes: 120,
        hodVerifiedBy: "Joshua",
        hodVerifiedAt: "2026-02-05T02:00:00Z",
        hrVerifiedBy: "HR Admin",
        hrVerifiedAt: "2026-02-06T02:00:00Z",
        entries: [
          {
            seqNo: 1,
            title: "Secure coding workshop",
            startDatetime: "2026-01-12T01:00:00Z",
            endDatetime: "2026-01-12T03:00:00Z",
            calculatedMinutes: 120,
            recordedMinutes: 120,
            overrideReason: null,
            location: "Kuala Lumpur",
            trainerProvider: "Tech Academy",
            effectiveness: "effective",
            remarks: null,
          },
        ],
      },
    ],
  },
];

describe("buildCompanyTrainingWorkbook", () => {
  it("creates the four HR reporting views", () => {
    const workbook = buildCompanyTrainingWorkbook(inputs, 2026);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Employee Summary",
      "Monthly Summary",
      "Department Summary",
      "All Training Entries",
    ]);
  });

  it("summarises employee sessions and hours", () => {
    const workbook = buildCompanyTrainingWorkbook(inputs, 2026);
    const row = workbook.getWorksheet("Employee Summary")!.getRow(4);

    expect(row.getCell(1).value).toBe("Amyra");
    expect(row.getCell(4).value).toBe(1);
    expect(row.getCell(5).value).toBe("02:00");
    expect(row.getCell(6).value).toBe("02:00");
  });

  it("includes the underlying training entries and serializes", async () => {
    const workbook = buildCompanyTrainingWorkbook(inputs, 2026);
    const row = workbook.getWorksheet("All Training Entries")!.getRow(4);

    expect(row.getCell(1).value).toBe("Amyra");
    expect(row.getCell(5).value).toBe("Secure coding workshop");
    expect((await workbook.xlsx.writeBuffer()).byteLength).toBeGreaterThan(0);
  });
});

describe("companyWorkbookFilename", () => {
  it("includes the selected year", () => {
    expect(companyWorkbookFilename(2026)).toBe(
      "Company-Training-Summary-2026.xlsx",
    );
  });
});

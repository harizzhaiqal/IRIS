import { describe, expect, it } from "vitest";

import {
  buildTrainingWorkbook,
  workbookFilename,
  type ExportInput,
} from "./trainingWorkbook";
import { DEFAULT_TARGETS } from "@/lib/utils/targets";

function input(overrides: Partial<ExportInput> = {}): ExportInput {
  return {
    employee: {
      fullName: "Chng Kok Sheng",
      email: "ks@irs.com.my",
      designation: "Head of R&D",
      department: "R&D",
      hodName: "Joshua",
      dateJoined: "2016-04-11",
    },
    year: 2026,
    months: [],
    targets: DEFAULT_TARGETS,
    ...overrides,
  };
}

const multiDayMonth = {
  month: 2,
  status: "approved" as const,
  isNilReturn: false,
  isLate: false,
  totalMinutes: 840,
  hodVerifiedBy: "Joshua",
  hodVerifiedAt: "2026-03-05T02:00:00Z",
  hrVerifiedBy: "Nurul Aina Binti Rahim",
  hrVerifiedAt: "2026-03-07T02:00:00Z",
  entries: [
    {
      seqNo: 1,
      title: "Advanced PostgreSQL administration (2 days)",
      startDatetime: "2026-02-26T01:00:00Z",
      endDatetime: "2026-02-27T09:00:00Z",
      calculatedMinutes: 960,
      recordedMinutes: 840,
      overrideReason: "Lunch breaks on both days are not learning time.",
      location: "Kuala Lumpur",
      trainerProvider: "Tech Academy",
      effectiveness: "effective" as const,
      remarks: "Applied to the reporting queries.",
    },
  ],
};

describe("buildTrainingWorkbook", () => {
  it("always produces twelve monthly sheets plus a yearly total", () => {
    const workbook = buildTrainingWorkbook(input());

    expect(workbook.worksheets).toHaveLength(13);
    expect(workbook.worksheets[0].name).toBe("January");
    expect(workbook.worksheets[11].name).toBe("December");
    expect(workbook.worksheets[12].name).toBe("Yearly total");
  });

  it("keeps empty months rather than dropping them", () => {
    // The paper form had twelve tabs, and a month with nothing in it is itself
    // information — it says nobody recorded anything.
    const workbook = buildTrainingWorkbook(input({ months: [multiDayMonth] }));
    const january = workbook.getWorksheet("January");

    expect(january).toBeDefined();
    expect(january!.getCell(9, 1).value).toBe("No entries recorded.");
  });

  it("carries the employee header onto every monthly sheet", () => {
    const workbook = buildTrainingWorkbook(input());

    for (const name of ["January", "June", "December"]) {
      const sheet = workbook.getWorksheet(name)!;
      expect(sheet.getCell(4, 2).value).toBe("Chng Kok Sheng");
      expect(sheet.getCell(5, 2).value).toBe("R&D");
      expect(sheet.getCell(5, 5).value).toBe("Joshua");
    }
  });

  describe("the multi-day override case", () => {
    const workbook = buildTrainingWorkbook(input({ months: [multiDayMonth] }));
    const february = workbook.getWorksheet("February")!;
    const row = february.getRow(9);

    it("shows both the calculated and the recorded figure", () => {
      expect(row.getCell(5).value).toBe("16:00");
      expect(row.getCell(6).value).toBe("14:00");
    });

    it("shows the reason for the difference", () => {
      expect(row.getCell(7).value).toContain("Lunch breaks");
    });

    it("totals the recorded figure, not the calculated one", () => {
      // Row 11: one entry on row 9, a blank, then the total.
      expect(february.getRow(11).getCell(6).value).toBe("14:00");
    });
  });

  it("leaves the reason blank when the two figures agree", () => {
    const month = {
      ...multiDayMonth,
      entries: [
        {
          ...multiDayMonth.entries[0],
          calculatedMinutes: 480,
          recordedMinutes: 480,
          overrideReason: "Should not be printed.",
        },
      ],
    };

    const workbook = buildTrainingWorkbook(input({ months: [month] }));
    expect(workbook.getWorksheet("February")!.getRow(9).getCell(7).value).toBe("");
  });

  it("marks a nil return rather than showing an empty table", () => {
    const month = {
      ...multiDayMonth,
      month: 5,
      isNilReturn: true,
      totalMinutes: 0,
      entries: [],
    };

    const workbook = buildTrainingWorkbook(input({ months: [month] }));
    expect(workbook.getWorksheet("May")!.getCell(9, 1).value).toContain("Nil return");
  });

  describe("the yearly total sheet", () => {
    it("counts only approved months toward the approved column", () => {
      const approved = { ...multiDayMonth, month: 1, totalMinutes: 600 };
      const pending = {
        ...multiDayMonth,
        month: 3,
        status: "submitted_pending_hod" as const,
        totalMinutes: 300,
      };

      const workbook = buildTrainingWorkbook(
        input({ months: [approved, pending] }),
      );
      const sheet = workbook.getWorksheet("Yearly total")!;

      // Recorded counts both; approved counts only the approved one. Reporting
      // one number would present unverified hours as progress.
      expect(sheet.getRow(20).getCell(2).value).toBe("15:00");
      expect(sheet.getRow(20).getCell(3).value).toBe("10:00");
    });

    it("reports compliance against the standard and the threshold", () => {
      // 39h45m approved: 82.8% of 48h and 110.4% of 36h — the worked example
      // from the specification.
      const months = [
        { ...multiDayMonth, month: 1, totalMinutes: 2385 },
      ];

      const workbook = buildTrainingWorkbook(input({ months }));
      const sheet = workbook.getWorksheet("Yearly total")!;

      expect(sheet.getRow(23).getCell(2).value).toBe("82.8%");
      expect(sheet.getRow(24).getCell(2).value).toBe("110.4%");
    });
  });
});

describe("workbookFilename", () => {
  it("names the file after the form, the person, and the year", () => {
    expect(workbookFilename("Chng Kok Sheng", 2026)).toBe(
      "IRS-HR-F14-Chng-Kok-Sheng-2026.xlsx",
    );
  });

  it("strips characters a filesystem would object to", () => {
    expect(workbookFilename("Preetha Devi A/P Ganesan", 2026)).toBe(
      "IRS-HR-F14-Preetha-Devi-AP-Ganesan-2026.xlsx",
    );
  });

  it("falls back rather than producing a nameless file", () => {
    expect(workbookFilename("///", 2026)).toBe("IRS-HR-F14-employee-2026.xlsx");
  });
});

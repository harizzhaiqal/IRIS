import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { DEFAULT_TARGETS } from "@/lib/utils/targets";
import type { ExportInput } from "./trainingWorkbook";
import {
  buildTrainingReportArchive,
  trainingReportArchiveFilename,
} from "./trainingReportArchive";

const input: ExportInput = {
  employee: {
    fullName: "Amyra",
    email: "amyra@irs.com.my",
    designation: "Engineer",
    department: "R&D",
    hodName: "Joshua",
    dateJoined: "2024-01-15",
  },
  year: 2026,
  months: [],
  targets: DEFAULT_TARGETS,
};

describe("buildTrainingReportArchive", () => {
  it("contains the company summary and individual official reports", async () => {
    const buffer = await buildTrainingReportArchive([input], 2026);
    const archive = await JSZip.loadAsync(buffer);

    expect(Object.keys(archive.files)).toContain(
      "Company-Training-Summary-2026.xlsx",
    );
    expect(Object.keys(archive.files)).toContain(
      "Individual Reports/IRS-HR-F14-Amyra-2026.xlsx",
    );
  });
});

describe("trainingReportArchiveFilename", () => {
  it("names the ZIP after the selected year", () => {
    expect(trainingReportArchiveFilename(2026)).toBe(
      "IRIS-Training-Reports-2026.zip",
    );
  });
});

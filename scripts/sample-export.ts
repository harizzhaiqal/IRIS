// Writes a sample IRS-HR-F14 workbook so the layout can be opened and checked
// without a database or a running app.
//
//   npx tsx scripts/sample-export.ts [outputPath]

import {
  buildTrainingWorkbook,
  workbookFilename,
  type ExportMonth,
} from "../lib/excel/trainingWorkbook";
import { DEFAULT_TARGETS } from "../lib/utils/targets";

const months: ExportMonth[] = [
  {
    month: 1,
    status: "approved",
    isNilReturn: false,
    isLate: false,
    totalMinutes: 300,
    hodVerifiedBy: "Joshua",
    hodVerifiedAt: "2026-02-04T02:00:00Z",
    hrVerifiedBy: "Nurul Aina Binti Rahim",
    hrVerifiedAt: "2026-02-06T02:00:00Z",
    entries: [
      {
        seqNo: 1,
        title: "Secure coding practices workshop",
        startDatetime: "2026-01-14T01:00:00Z",
        endDatetime: "2026-01-14T06:00:00Z",
        calculatedMinutes: 300,
        recordedMinutes: 300,
        overrideReason: null,
        location: "Kuala Lumpur",
        trainerProvider: "Internal",
        effectiveness: "effective",
        remarks: "Applied to the auth review.",
      },
    ],
  },
  {
    month: 2,
    status: "approved",
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
        effectiveness: "effective",
        remarks: "The multi-day override case.",
      },
    ],
  },
  {
    month: 3,
    status: "submitted_pending_hod",
    isNilReturn: false,
    isLate: true,
    totalMinutes: 180,
    hodVerifiedBy: null,
    hodVerifiedAt: null,
    hrVerifiedBy: null,
    hrVerifiedAt: null,
    entries: [
      {
        seqNo: 1,
        title: "Incident response drill",
        startDatetime: "2026-03-18T01:00:00Z",
        endDatetime: "2026-03-18T04:00:00Z",
        calculatedMinutes: 180,
        recordedMinutes: 180,
        overrideReason: null,
        location: "Online",
        trainerProvider: "Internal",
        effectiveness: "average",
        remarks: null,
      },
    ],
  },
  {
    month: 4,
    status: "approved",
    isNilReturn: true,
    isLate: false,
    totalMinutes: 0,
    hodVerifiedBy: "Joshua",
    hodVerifiedAt: "2026-05-04T02:00:00Z",
    hrVerifiedBy: "Nurul Aina Binti Rahim",
    hrVerifiedAt: "2026-05-06T02:00:00Z",
    entries: [],
  },
];

const workbook = buildTrainingWorkbook({
  employee: {
    fullName: "Chng Kok Sheng",
    email: "ks@irs.com.my",
    designation: "Head of R&D",
    department: "R&D",
    hodName: "Joshua",
    dateJoined: "2016-04-11",
  },
  year: 2026,
  months,
  targets: DEFAULT_TARGETS,
});

const out = process.argv[2] ?? workbookFilename("Chng Kok Sheng", 2026);

workbook.xlsx
  .writeFile(out)
  .then(() => console.log(`wrote ${out}`))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

import JSZip from "jszip";

import {
  buildCompanyTrainingWorkbook,
  companyWorkbookFilename,
} from "./companyTrainingWorkbook";
import {
  buildTrainingWorkbook,
  workbookFilename,
  type ExportInput,
} from "./trainingWorkbook";

export async function buildTrainingReportArchive(
  inputs: ExportInput[],
  year: number,
) {
  const archive = new JSZip();
  const summaryWorkbook = buildCompanyTrainingWorkbook(inputs, year);
  archive.file(
    companyWorkbookFilename(year),
    await summaryWorkbook.xlsx.writeBuffer(),
  );
  const reportsFolder = archive.folder("Individual Reports");
  const filenameCounts = new Map<string, number>();

  for (const input of inputs) {
    const workbook = buildTrainingWorkbook(input);
    const baseFilename = workbookFilename(input.employee.fullName, year);
    const occurrence = (filenameCounts.get(baseFilename) ?? 0) + 1;
    filenameCounts.set(baseFilename, occurrence);
    const filename =
      occurrence === 1 ? baseFilename : `${occurrence}-${baseFilename}`;
    reportsFolder?.file(filename, await workbook.xlsx.writeBuffer());
  }

  return archive.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export function trainingReportArchiveFilename(year: number) {
  return `IRIS-Training-Reports-${year}.zip`;
}

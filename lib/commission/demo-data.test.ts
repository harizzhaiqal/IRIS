import { describe, expect, it } from "vitest";

import {
  DEMO_COMMISSION_EMPLOYEES,
  INITIAL_COMMISSION_RECORDS,
} from "@/lib/commission/demo-data";

describe("commission demo data", () => {
  it("includes a July 2026 commission record for every seeded staff and HOD", () => {
    const eligibleProfileIds = [1, 2, 3, 4, 6, 7];

    for (const employeeId of eligibleProfileIds) {
      expect(
        DEMO_COMMISSION_EMPLOYEES.some(
          (employee) => employee.id === employeeId,
        ),
      ).toBe(true);
      expect(
        INITIAL_COMMISSION_RECORDS.some(
          (record) =>
            record.employeeId === employeeId &&
            record.commissionMonth === 7 &&
            record.commissionYear === 2026,
        ),
      ).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";

import { filesOwnRecords, isReadOnlyRole, type UserRole } from "./types";

const ROLES: UserRole[] = ["staff", "hod", "hr_admin", "ceo"];

describe("filesOwnRecords", () => {
  it("is true for the people the training module is for", () => {
    expect(filesOwnRecords("staff")).toBe(true);
    expect(filesOwnRecords("hod")).toBe(true);
  });

  it("is false for HR, who administers the process rather than taking part", () => {
    // This is also what removes the case where HR approved a training record
    // they had filed themselves.
    expect(filesOwnRecords("hr_admin")).toBe(false);
  });

  it("is false for the CEO, who neither submits nor approves", () => {
    expect(filesOwnRecords("ceo")).toBe(false);
  });

  it("covers every role, so a new one has to be considered", () => {
    for (const role of ROLES) {
      expect(typeof filesOwnRecords(role)).toBe("boolean");
    }
  });
});

describe("isReadOnlyRole", () => {
  it("is only the CEO", () => {
    expect(isReadOnlyRole("ceo")).toBe(true);
    expect(isReadOnlyRole("hr_admin")).toBe(false);
    expect(isReadOnlyRole("hod")).toBe(false);
    expect(isReadOnlyRole("staff")).toBe(false);
  });

  it("is narrower than filesOwnRecords, and deliberately so", () => {
    // HR files nothing of their own but still approves, so the two rules are
    // not interchangeable: one hides personal pages, the other forbids writes.
    expect(filesOwnRecords("hr_admin")).toBe(false);
    expect(isReadOnlyRole("hr_admin")).toBe(false);
  });

  it("means a read-only role never files records either", () => {
    for (const role of ROLES) {
      if (isReadOnlyRole(role)) expect(filesOwnRecords(role)).toBe(false);
    }
  });
});

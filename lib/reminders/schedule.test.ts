import { describe, expect, it } from "vitest";

import { formatReminderSchedule, nextReminderOccurrence } from "./schedule";

const schedule = {
  day_of_month: 28,
  send_time: "09:00:00",
  timezone: "Asia/Kuala_Lumpur",
};

describe("reminder scheduling", () => {
  it("converts Malaysia time to UTC", () => {
    const next = nextReminderOccurrence(
      schedule,
      new Date("2026-08-04T04:00:00.000Z"),
    );
    expect(next.toISOString()).toBe("2026-08-28T01:00:00.000Z");
  });

  it("moves to the next month once this month's send has passed", () => {
    const next = nextReminderOccurrence(
      schedule,
      new Date("2026-08-28T02:00:00.000Z"),
    );
    expect(next.toISOString()).toBe("2026-09-28T01:00:00.000Z");
  });

  it("formats a human-readable schedule", () => {
    expect(formatReminderSchedule(schedule)).toBe("Every 28th at 9:00 AM");
  });
});

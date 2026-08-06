import { describe, expect, it } from "vitest";

import { reminderFormSchema } from "./reminders";

const valid = {
  reminderId: null,
  name: "Monthly training reminder",
  isEnabled: false,
  isTestMode: false,
  dayOfMonth: 28,
  sendTime: "09:00",
  timezone: "Asia/Kuala_Lumpur" as const,
  audience: "all_active_employees" as const,
  targetRoles: ["staff", "hod"] as ("staff" | "hod")[],
  subject: "Training reminder for {{month_name}}",
  body: "Hi {{full_name}}, please submit by {{deadline_date}}.",
  actionLabel: "Open IRIS",
  actionUrl: "/training",
  replyTo: "hr@example.com",
};

describe("reminder validation", () => {
  it("accepts the monthly reminder configuration", () => {
    expect(reminderFormSchema.safeParse(valid).success).toBe(true);
  });

  it("keeps the day within the range that exists every month", () => {
    const parsed = reminderFormSchema.safeParse({ ...valid, dayOfMonth: 29 });
    expect(parsed.success).toBe(false);
  });

  it("requires button text and URL together", () => {
    const parsed = reminderFormSchema.safeParse({ ...valid, actionUrl: "" });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown placeholders", () => {
    const parsed = reminderFormSchema.safeParse({
      ...valid,
      subject: "Hello {{first_name}}",
    });
    expect(parsed.success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  createReminderContext,
  interpolateReminder,
  renderReminderEmail,
  resolveReminderUrl,
  unsupportedPlaceholders,
} from "./template";

describe("reminder templates", () => {
  const context = createReminderContext({
    fullName: "Aina & Co",
    periodStart: "2026-08-01",
    deadlineDay: 10,
    irisUrl: "https://iris.example.com/",
  });

  it("creates month and following-month deadline values", () => {
    expect(context).toMatchObject({
      full_name: "Aina & Co",
      month_name: "August 2026",
      year: "2026",
      deadline_date: "10 September 2026",
      iris_url: "https://iris.example.com",
    });
  });

  it("interpolates supported placeholders and reports unsupported ones", () => {
    expect(interpolateReminder("Hi {{ full_name }}", context)).toBe(
      "Hi Aina & Co",
    );
    expect(unsupportedPlaceholders("{{full_name}} {{unknown}} {{unknown}}"))
      .toEqual(["unknown"]);
  });

  it("escapes recipient content in HTML and resolves relative action links", () => {
    const email = renderReminderEmail({
      subject: "Reminder for {{full_name}}",
      body: "Hi {{full_name}}\n\nPlease update <today>.",
      actionLabel: "Open IRIS",
      actionUrl: "/training",
      context,
    });

    expect(email.subject).toBe("Reminder for Aina & Co");
    expect(email.html).toContain("Aina &amp; Co");
    expect(email.html).toContain("&lt;today&gt;");
    expect(email.html).toContain("https://iris.example.com/training");
    expect(email.text).toContain("Open IRIS: https://iris.example.com/training");
  });

  it("does not prepend the app URL to an absolute HTTPS link", () => {
    expect(resolveReminderUrl("https://example.com/form", context.iris_url)).toBe(
      "https://example.com/form",
    );
  });
});

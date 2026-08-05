import type { ReminderSchedule } from "@/lib/types";

const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * The editor currently fixes schedules to Asia/Kuala_Lumpur, which has a
 * stable UTC+8 offset and no daylight-saving changes.
 */
export function nextReminderOccurrence(
  schedule: Pick<ReminderSchedule, "day_of_month" | "send_time" | "timezone">,
  now = new Date(),
): Date {
  if (schedule.timezone !== "Asia/Kuala_Lumpur") {
    throw new Error(`Unsupported reminder timezone: ${schedule.timezone}`);
  }

  const malaysiaNow = new Date(now.getTime() + MALAYSIA_OFFSET_MS);
  let year = malaysiaNow.getUTCFullYear();
  let month = malaysiaNow.getUTCMonth();
  const [hour, minute] = schedule.send_time.split(":").map(Number);

  let occurrence = new Date(
    Date.UTC(year, month, schedule.day_of_month, hour - 8, minute),
  );

  if (occurrence <= now) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    occurrence = new Date(
      Date.UTC(year, month, schedule.day_of_month, hour - 8, minute),
    );
  }

  return occurrence;
}

export function formatReminderSchedule(
  schedule: Pick<ReminderSchedule, "day_of_month" | "send_time">,
): string {
  const suffix =
    schedule.day_of_month === 1
      ? "st"
      : schedule.day_of_month === 2
        ? "nd"
        : schedule.day_of_month === 3
          ? "rd"
          : "th";
  const [hours, minutes] = schedule.send_time.split(":").map(Number);
  const displayHours = hours % 12 || 12;
  const amPm = hours < 12 ? "AM" : "PM";

  return `Every ${schedule.day_of_month}${suffix} at ${displayHours}:${String(minutes).padStart(2, "0")} ${amPm}`;
}

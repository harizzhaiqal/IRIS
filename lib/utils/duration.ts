const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

/** Minutes elapsed since local midnight. */
function minutesIntoDay(value: Date): number {
  return value.getHours() * MINUTES_PER_HOUR + value.getMinutes();
}

/** Local calendar date with the time component discarded. */
function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/** Number of calendar days a range touches, counting both endpoints. */
function calendarDaysSpanned(start: Date, end: Date): number {
  const diff = startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime();
  return Math.round(diff / (MINUTES_PER_DAY * 60 * 1000)) + 1;
}

/**
 * Whole minutes between two instants, as the training form counts them.
 *
 * A course running across several days is counted as its daily session window
 * repeated for each day, not as raw wall-clock elapsed time. A 26-27 Feb course
 * running 09:00-17:00 is 16 hours, not the 32 hours that separate the two
 * instants. Employees then override this downward to exclude breaks.
 *
 * An overnight session, where the end time of day is at or before the start
 * time of day, falls back to true elapsed time.
 */
export function calculateMinutes(
  start: Date | string,
  end: Date | string,
): number {
  const startDate = toDate(start);
  const endDate = toDate(end);

  if (!isValidDate(startDate) || !isValidDate(endDate)) return 0;

  const elapsed = Math.floor(
    (endDate.getTime() - startDate.getTime()) / 60_000,
  );
  if (elapsed <= 0) return 0;

  const days = calendarDaysSpanned(startDate, endDate);
  if (days <= 1) return elapsed;

  const dailyWindow = minutesIntoDay(endDate) - minutesIntoDay(startDate);
  if (dailyWindow <= 0) return elapsed;

  return dailyWindow * days;
}

/**
 * Formats whole minutes as HH:MM. Hours are not capped at 24, so a yearly
 * total renders as "39:45" rather than rolling over into days.
 */
export function minutesToHHMM(minutes: number): string {
  if (!Number.isFinite(minutes)) return "00:00";

  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / MINUTES_PER_HOUR);
  const mins = total % MINUTES_PER_HOUR;

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Parses "HH:MM" into whole minutes. Also accepts a bare hour count ("7") and
 * a decimal hour count ("7.5"), which is what people type when they are used
 * to the spreadsheet. Returns null when the value cannot be read.
 */
export function hhmmToMinutes(value: string): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const colonMatch = /^(\d{1,4}):([0-5]?\d)$/.exec(trimmed);
  if (colonMatch) {
    return Number(colonMatch[1]) * MINUTES_PER_HOUR + Number(colonMatch[2]);
  }

  const decimalMatch = /^(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(trimmed);
  if (decimalMatch) {
    const hours = Number(`${decimalMatch[1]}.${decimalMatch[2] ?? "0"}`);
    return Math.round(hours * MINUTES_PER_HOUR);
  }

  return null;
}

/** Human-readable duration, e.g. "14h 30m". Used where HH:MM reads as a clock time. */
export function minutesToLabel(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / MINUTES_PER_HOUR);
  const mins = total % MINUTES_PER_HOUR;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

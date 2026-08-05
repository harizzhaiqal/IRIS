export const REMINDER_PLACEHOLDERS = [
  "full_name",
  "month_name",
  "year",
  "deadline_date",
  "iris_url",
] as const;

export type ReminderPlaceholder = (typeof REMINDER_PLACEHOLDERS)[number];

export type ReminderTemplateContext = Record<ReminderPlaceholder, string>;

const PLACEHOLDER_PATTERN = /{{\s*([a-z_]+)\s*}}/g;
const ALLOWED_PLACEHOLDERS = new Set<string>(REMINDER_PLACEHOLDERS);

export function unsupportedPlaceholders(value: string): string[] {
  const unsupported = new Set<string>();

  const matcher = new RegExp(PLACEHOLDER_PATTERN.source, PLACEHOLDER_PATTERN.flags);
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(value)) !== null) {
    if (!ALLOWED_PLACEHOLDERS.has(match[1])) unsupported.add(match[1]);
  }

  return Array.from(unsupported);
}

export function interpolateReminder(
  value: string,
  context: ReminderTemplateContext,
): string {
  return value.replace(PLACEHOLDER_PATTERN, (placeholder, key: string) =>
    key in context ? context[key as ReminderPlaceholder] : placeholder,
  );
}

function parsePeriod(periodStart: string): { year: number; monthIndex: number } {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(periodStart);
  if (!match) throw new Error(`Invalid reminder period: ${periodStart}`);

  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 };
}

export function createReminderContext(input: {
  fullName: string;
  periodStart: string;
  deadlineDay: number;
  irisUrl: string;
}): ReminderTemplateContext {
  const { year, monthIndex } = parsePeriod(input.periodStart);
  const monthDate = new Date(Date.UTC(year, monthIndex, 1));
  const deadlineDate = new Date(
    Date.UTC(year, monthIndex + 1, input.deadlineDay),
  );

  const monthName = new Intl.DateTimeFormat("en-MY", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthDate);

  const formattedDeadline = new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(deadlineDate);

  return {
    full_name: input.fullName,
    month_name: monthName,
    year: String(year),
    deadline_date: formattedDeadline,
    iris_url: input.irisUrl.replace(/\/$/, ""),
  };
}

export function resolveReminderUrl(
  actionUrl: string | null,
  irisUrl: string,
): string | null {
  if (!actionUrl) return null;
  if (/^https:\/\//i.test(actionUrl)) return actionUrl;
  if (/^http:\/\/localhost(?::\d+)?(?:\/|$)/i.test(actionUrl)) return actionUrl;

  const base = irisUrl.replace(/\/$/, "");
  return `${base}${actionUrl.startsWith("/") ? actionUrl : `/${actionUrl}`}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderReminderEmail(input: {
  subject: string;
  body: string;
  actionLabel: string | null;
  actionUrl: string | null;
  context: ReminderTemplateContext;
}): { subject: string; text: string; html: string } {
  const subject = interpolateReminder(input.subject, input.context);
  const body = interpolateReminder(input.body, input.context);
  const actionLabel = input.actionLabel
    ? interpolateReminder(input.actionLabel, input.context)
    : null;
  const actionUrl = resolveReminderUrl(input.actionUrl, input.context.iris_url);

  const paragraphs = body
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");

  const button =
    actionLabel && actionUrl
      ? `<p style="margin:24px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:6px">${escapeHtml(actionLabel)}</a></p>`
      : "";

  const textAction = actionLabel && actionUrl ? `\n\n${actionLabel}: ${actionUrl}` : "";

  return {
    subject,
    text: `${body}${textAction}`,
    html: `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(subject)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e4e4e7;border-radius:10px;overflow:hidden"><tr><td style="background:#18181b;color:#ffffff;padding:18px 24px;font-size:20px;font-weight:700">IRIS</td></tr><tr><td style="padding:28px 24px;font-size:15px">${paragraphs}${button}</td></tr><tr><td style="border-top:1px solid #e4e4e7;padding:16px 24px;color:#71717a;font-size:12px">Automated reminder from IRS Records and Insight System.</td></tr></table></td></tr></table></body></html>`,
  };
}

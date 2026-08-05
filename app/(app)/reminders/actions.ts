"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { failed, type ActionResult } from "@/lib/actionResult";
import { logAction } from "@/lib/automationLog";
import { requireProfile } from "@/lib/auth";
import { sendReminderEmail } from "@/lib/email/resend";
import {
  createReminderContext,
  renderReminderEmail,
} from "@/lib/reminders/template";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  reminderFormSchema,
  reminderRunIdSchema,
} from "@/lib/validation/reminders";

function malaysiaPeriodStart(now = new Date()): string {
  const local = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

async function requireHrAction(): Promise<
  | { ok: true; profile: Awaited<ReturnType<typeof requireProfile>> }
  | { ok: false; error: string }
> {
  const profile = await requireProfile();
  if (profile.role !== "hr_admin") {
    return { ok: false, error: "Only HR administrators can manage reminders." };
  }
  return { ok: true, profile };
}

export async function saveReminder(
  input: unknown,
): Promise<ActionResult<{ reminderId: number }>> {
  const access = await requireHrAction();
  if (!access.ok) return failed(access.error);

  const parsed = reminderFormSchema.safeParse(input);
  if (!parsed.success) {
    return failed(parsed.error.issues[0]?.message ?? "Check the reminder details.");
  }

  const reminder = parsed.data;
  const supabase = createClient();
  const values = {
    name: reminder.name,
    is_enabled: reminder.isEnabled,
    day_of_month: reminder.dayOfMonth,
    send_time: reminder.sendTime,
    timezone: reminder.timezone,
    audience: reminder.audience,
    target_roles: reminder.targetRoles,
    subject: reminder.subject,
    body: reminder.body,
    action_label: reminder.actionLabel || null,
    action_url: reminder.actionUrl || null,
    reply_to: reminder.replyTo || null,
  };

  const query = reminder.reminderId
    ? supabase
        .from("reminder_schedules")
        .update(values)
        .eq("id", reminder.reminderId)
        .select("id")
        .maybeSingle()
    : supabase
        .from("reminder_schedules")
        .insert(values)
        .select("id")
        .single();

  const { data: saved, error } = await query;
  if (error || !saved) {
    return failed(`Could not save this reminder: ${error?.message ?? "not found"}`);
  }

  await logAction({
    actionType: reminder.reminderId
      ? "reminder.schedule_updated"
      : "reminder.schedule_created",
    description: `${access.profile.full_name} ${reminder.reminderId ? "updated" : "created"} reminder "${reminder.name}"${reminder.isEnabled ? " and enabled it" : ""}`,
    relatedTable: "reminder_schedules",
    relatedId: saved.id,
    performedBy: access.profile.id,
  });

  revalidatePath("/reminders");
  revalidatePath(`/reminders/${saved.id}`);
  return { ok: true, data: { reminderId: saved.id } };
}

export async function sendReminderTest(input: unknown): Promise<ActionResult> {
  const access = await requireHrAction();
  if (!access.ok) return failed(access.error);

  const parsed = reminderFormSchema.safeParse(input);
  if (!parsed.success) {
    return failed(
      parsed.error.issues[0]?.message ??
        "Complete the reminder before sending a test.",
    );
  }

  const supabase = createClient();
  const { data: settings } = await supabase
    .from("app_settings")
    .select("submission_deadline_day")
    .maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const context = createReminderContext({
    fullName: access.profile.full_name,
    periodStart: malaysiaPeriodStart(),
    deadlineDay: settings?.submission_deadline_day ?? 10,
    irisUrl: appUrl,
  });
  const rendered = renderReminderEmail({
    subject: parsed.data.subject,
    body: parsed.data.body,
    actionLabel: parsed.data.actionLabel || null,
    actionUrl: parsed.data.actionUrl || null,
    context,
  });

  const result = await sendReminderEmail({
    to: access.profile.email,
    subject: `[TEST] ${rendered.subject}`,
    html: rendered.html,
    text: rendered.text,
    replyTo: parsed.data.replyTo || null,
    idempotencyKey: `reminder-test/${access.profile.id}/${randomUUID()}`,
  });

  if (!result.ok) return failed(result.error);

  await logAction({
    actionType: "reminder.test_sent",
    description: `${access.profile.full_name} sent a reminder test to their own address`,
    relatedTable: "reminder_schedules",
    relatedId: parsed.data.reminderId ?? undefined,
    performedBy: access.profile.id,
  });

  return { ok: true };
}

export async function retryFailedDeliveries(
  input: unknown,
): Promise<ActionResult<{ queued: number }>> {
  const access = await requireHrAction();
  if (!access.ok) return failed(access.error);

  const parsed = reminderRunIdSchema.safeParse(input);
  if (!parsed.success) return failed("This reminder run is not valid.");

  // Read through the user's client first so RLS independently proves this HR
  // administrator may see the run before the service client changes it.
  const supabase = createClient();
  const { data: run, error: runError } = await supabase
    .from("reminder_runs")
    .select("id, schedule_id")
    .eq("id", parsed.data)
    .maybeSingle();
  if (runError || !run) return failed("This reminder run is no longer available.");

  const { count, error: countError } = await supabase
    .from("reminder_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .eq("status", "failed");
  if (countError) return failed(`Could not check failed emails: ${countError.message}`);
  if (!count) return failed("There are no failed emails to retry.");

  const admin = createAdminClient();
  const { error: deliveryError } = await admin
    .from("reminder_deliveries")
    .update({
      status: "pending",
      attempt_count: 0,
      last_attempt_at: null,
      last_error: null,
    })
    .eq("run_id", run.id)
    .eq("status", "failed");
  if (deliveryError) return failed(`Could not queue failed emails: ${deliveryError.message}`);

  const { error: queueError } = await admin
    .from("reminder_runs")
    .update({
      status: "pending",
      attempt_count: 0,
      lease_expires_at: null,
      completed_at: null,
      last_error: null,
    })
    .eq("id", run.id);
  if (queueError) return failed(`Could not queue this reminder run: ${queueError.message}`);

  await logAction({
    actionType: "reminder.failures_queued",
    description: `${access.profile.full_name} queued ${count} failed reminder email${count === 1 ? "" : "s"} for retry`,
    relatedTable: "reminder_runs",
    relatedId: run.id,
    performedBy: access.profile.id,
  });

  revalidatePath("/reminders");
  revalidatePath(`/reminders/runs/${run.id}`);
  return { ok: true, data: { queued: count } };
}

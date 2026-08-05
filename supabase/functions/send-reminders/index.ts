// Scheduled reminder worker. This runs on Supabase's Deno runtime, outside the
// Next.js application. The project tsconfig excludes supabase/functions so Deno
// and npm: specifiers are checked by the Supabase deploy tool instead.
import { createClient } from "npm:@supabase/supabase-js@2";

import {
  createReminderContext,
  renderReminderEmail,
} from "../../../lib/reminders/template.ts";

type UserRole = "staff" | "hod" | "hr_admin" | "ceo";

type ReminderRun = {
  id: number;
  schedule_id: number;
  period_start: string;
  audience_snapshot: "all_active_employees" | "incomplete_training";
  target_roles_snapshot: UserRole[];
  subject_snapshot: string;
  body_snapshot: string;
  action_label_snapshot: string | null;
  action_url_snapshot: string | null;
  reply_to_snapshot: string | null;
};

type Delivery = {
  id: number;
  recipient_profile_id: number | null;
  recipient_name: string;
  recipient_email: string;
  status: "pending" | "processing" | "accepted" | "delivered" | "failed" | "unknown" | "skipped";
  idempotency_key: string;
  attempt_count: number;
  last_attempt_at: string | null;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
const fromEmail = Deno.env.get("REMINDER_FROM_EMAIL")!;
const irisUrl = Deno.env.get("IRIS_APP_URL")!;
const cronSecret = Deno.env.get("REMINDER_CRON_SECRET")!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function selectRecipients(run: ReminderRun) {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("is_active", true)
    .in("role", run.target_roles_snapshot)
    .order("id");
  if (error) throw new Error(`Could not select recipients: ${error.message}`);

  if (run.audience_snapshot === "all_active_employees" || !profiles?.length) {
    return profiles ?? [];
  }

  const [year, month] = run.period_start.split("-").map(Number);
  const ids = profiles.map((profile) => profile.id);
  const { data: submissions, error: submissionError } = await supabase
    .from("training_submissions")
    .select("employee_id, status")
    .eq("year", year)
    .eq("month", month)
    .in("employee_id", ids);
  if (submissionError) {
    throw new Error(`Could not check training submissions: ${submissionError.message}`);
  }

  const submitted = new Set(
    (submissions ?? [])
      .filter((submission) =>
        ["submitted_pending_hod", "hod_verified", "approved"].includes(
          submission.status,
        ),
      )
      .map((submission) => submission.employee_id),
  );

  return profiles.filter((profile) => !submitted.has(profile.id));
}

async function sendDelivery(
  run: ReminderRun,
  delivery: Delivery,
  deadlineDay: number,
) {
  const now = new Date();
  if (
    delivery.status === "processing" &&
    delivery.last_attempt_at &&
    now.getTime() - new Date(delivery.last_attempt_at).getTime() >=
      24 * 60 * 60 * 1000
  ) {
    await supabase
      .from("reminder_deliveries")
      .update({
        status: "unknown",
        last_error:
          "The previous provider response was interrupted and its duplicate-protection window expired. Review before retrying.",
      })
      .eq("id", delivery.id);
    return;
  }

  const attemptTime = now.toISOString();
  const { error: claimError } = await supabase
    .from("reminder_deliveries")
    .update({
      status: "processing",
      attempt_count: delivery.attempt_count + 1,
      last_attempt_at: attemptTime,
      last_error: null,
    })
    .eq("id", delivery.id);
  if (claimError) throw new Error(`Could not claim delivery ${delivery.id}: ${claimError.message}`);

  const context = createReminderContext({
    fullName: delivery.recipient_name,
    periodStart: run.period_start,
    deadlineDay,
    irisUrl,
  });
  const email = renderReminderEmail({
    subject: run.subject_snapshot,
    body: run.body_snapshot,
    actionLabel: run.action_label_snapshot,
    actionUrl: run.action_url_snapshot,
    context,
  });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": delivery.idempotency_key,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [delivery.recipient_email],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(run.reply_to_snapshot
          ? { reply_to: run.reply_to_snapshot }
          : {}),
      }),
    });
    const payload = await response.json().catch(() => null) as
      | { id?: string; message?: string }
      | null;

    if (!response.ok || !payload?.id) {
      await supabase
        .from("reminder_deliveries")
        .update({
          status: "failed",
          last_error:
            payload?.message ??
            `Email provider returned ${response.status} ${response.statusText}`,
        })
        .eq("id", delivery.id);
      return;
    }

    await supabase
      .from("reminder_deliveries")
      .update({
        status: "accepted",
        provider_message_id: payload.id,
        accepted_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", delivery.id);
  } catch (error) {
    // A network interruption is ambiguous: Resend may have accepted the email.
    // Keep it processing so the next leased retry uses the same idempotency key.
    await supabase
      .from("reminder_deliveries")
      .update({
        status: delivery.attempt_count + 1 >= 3 ? "unknown" : "processing",
        last_error: `Provider response interrupted: ${errorMessage(error)}`,
      })
      .eq("id", delivery.id);
  }
}

async function processRun(run: ReminderRun, deadlineDay: number) {
  const recipients = await selectRecipients(run);
  const selectedIds = new Set(recipients.map((recipient) => recipient.id));

  if (recipients.length > 0) {
    const { error: recipientError } = await supabase
      .from("reminder_deliveries")
      .upsert(
        recipients.map((recipient) => ({
          run_id: run.id,
          recipient_profile_id: recipient.id,
          recipient_name: recipient.full_name,
          recipient_email: recipient.email,
          status: "pending",
          idempotency_key: `reminder/${run.schedule_id}/${run.period_start}/${recipient.id}`,
        })),
        { onConflict: "run_id,recipient_email", ignoreDuplicates: true },
      );
    if (recipientError) {
      throw new Error(`Could not prepare recipients: ${recipientError.message}`);
    }
  }

  const { data: deliveries, error: deliveryError } = await supabase
    .from("reminder_deliveries")
    .select("id, recipient_profile_id, recipient_name, recipient_email, status, idempotency_key, attempt_count, last_attempt_at")
    .eq("run_id", run.id)
    .in("status", ["pending", "processing", "failed"])
    .order("id");
  if (deliveryError) throw new Error(`Could not load deliveries: ${deliveryError.message}`);

  for (const delivery of (deliveries ?? []) as Delivery[]) {
    if (
      delivery.recipient_profile_id === null ||
      !selectedIds.has(delivery.recipient_profile_id)
    ) {
      await supabase
        .from("reminder_deliveries")
        .update({
          status: "skipped",
          last_error: "Recipient is no longer active or no longer needs this reminder.",
        })
        .eq("id", delivery.id);
      continue;
    }
    if (delivery.attempt_count >= 3 && delivery.status === "failed") continue;

    await sendDelivery(run, delivery, deadlineDay);
    // Resend's default account limit is five requests per second.
    await wait(220);
  }

  const { data: finalDeliveries, error: finalError } = await supabase
    .from("reminder_deliveries")
    .select("status")
    .eq("run_id", run.id);
  if (finalError) throw new Error(`Could not summarize deliveries: ${finalError.message}`);

  const all = finalDeliveries ?? [];
  const accepted = all.filter((row) => ["accepted", "delivered"].includes(row.status)).length;
  const failed = all.filter((row) => ["failed", "unknown"].includes(row.status)).length;
  const unfinished = all.filter((row) => ["pending", "processing"].includes(row.status)).length;
  const status = unfinished > 0 || (accepted > 0 && failed > 0)
    ? "partial"
    : failed > 0
      ? "failed"
      : "completed";

  const { error: runError } = await supabase
    .from("reminder_runs")
    .update({
      status,
      recipient_count: all.length,
      accepted_count: accepted,
      failed_count: failed,
      lease_expires_at: null,
      completed_at: new Date().toISOString(),
      last_error: failed > 0 ? `${failed} email${failed === 1 ? "" : "s"} failed or need review` : null,
    })
    .eq("id", run.id);
  if (runError) throw new Error(`Could not finish run: ${runError.message}`);

  await supabase.from("automation_logs").insert({
    action_type: "reminder.run_completed",
    description: `System processed reminder run #${run.id}: ${accepted} accepted, ${failed} failed`,
    related_table: "reminder_runs",
    related_id: run.id,
    performed_by: null,
    is_system: true,
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!serviceRoleKey || !resendApiKey || !fromEmail || !irisUrl) {
    return Response.json(
      { error: "Reminder worker secrets are incomplete" },
      { status: 503 },
    );
  }

  const { data: settings } = await supabase
    .from("app_settings")
    .select("submission_deadline_day")
    .maybeSingle();
  const { data: runs, error } = await supabase.rpc("claim_due_reminder_runs", {
    p_now: new Date().toISOString(),
    p_lease_minutes: 10,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results: Array<{ runId: number; ok: boolean; error?: string }> = [];
  for (const run of (runs ?? []) as ReminderRun[]) {
    try {
      await processRun(run, settings?.submission_deadline_day ?? 10);
      results.push({ runId: run.id, ok: true });
    } catch (runError) {
      const message = errorMessage(runError);
      await supabase
        .from("reminder_runs")
        .update({ status: "partial", lease_expires_at: null, last_error: message })
        .eq("id", run.id);
      results.push({ runId: run.id, ok: false, error: message });
    }
  }

  return Response.json({ claimed: results.length, results });
});

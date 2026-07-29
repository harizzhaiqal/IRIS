"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { logAction } from "@/lib/automationLog";
import { createClient } from "@/lib/supabase/server";
import { isEditableStatus, type SubmissionStatus } from "@/lib/types";
import { calculateMinutes } from "@/lib/utils/duration";
import { getTargets } from "@/lib/queries/settings";
import { isLateSubmission, monthName } from "@/lib/utils/targets";
import {
  attachmentSchema,
  periodSchema,
  trainingEntrySchema,
} from "@/lib/validation/training";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function failed(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/**
 * The employee's row for a month, creating the draft on first use. Returns null
 * if the month exists but is closed to editing.
 */
type OpenableRow = {
  id: string;
  status: SubmissionStatus;
  is_nil_return: boolean;
};

/** Reads the month, keeping the Postgres error rather than discarding it. */
async function findSubmission(
  supabase: ReturnType<typeof createClient>,
  employeeId: string,
  month: number,
  year: number,
): Promise<{ row: OpenableRow | null } | { error: string }> {
  const { data, error } = await supabase
    .from("training_submissions")
    .select("id, status, is_nil_return")
    .eq("employee_id", employeeId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  if (error) return { error: `Could not read this month: ${error.message}` };
  return { row: (data as OpenableRow | null) ?? null };
}

/** Turns a found row into an id, or explains why the month is closed. */
function resolveExisting(row: OpenableRow): { id: string } | { error: string } {
  if (!isEditableStatus(row.status)) {
    return { error: "This month has been submitted and cannot be edited." };
  }
  if (row.is_nil_return) {
    return {
      error:
        "This month is recorded as a nil return. Withdraw the nil return before adding training.",
    };
  }
  return { id: row.id };
}

async function openSubmissionForEditing(
  employeeId: string,
  month: number,
  year: number,
): Promise<{ id: string } | { error: string }> {
  const supabase = createClient();

  const found = await findSubmission(supabase, employeeId, month, year);
  if ("error" in found) return found;
  if (found.row) return resolveExisting(found.row);

  const { data: created, error } = await supabase
    .from("training_submissions")
    .insert({ employee_id: employeeId, month, year, status: "draft" })
    .select("id")
    .single();

  if (created) return { id: created.id };

  // 23505 means the row exists after all — either another tab opened the month
  // between the read and the insert, or the read could not see a row that the
  // unique constraint can, since constraints are not filtered by RLS. Re-read
  // rather than reporting a failure the user cannot act on.
  if (error?.code === "23505") {
    const retry = await findSubmission(supabase, employeeId, month, year);
    if ("error" in retry) return retry;
    if (retry.row) return resolveExisting(retry.row);

    return {
      error:
        "This month already exists but is not visible to your account. Sign out and back in, and tell an administrator if it persists.",
    };
  }

  return {
    error: `Could not open this month for editing: ${error?.message ?? "unknown error"}`,
  };
}

export async function saveTrainingEntry(
  input: unknown,
): Promise<ActionResult<{ recordId: number }>> {
  const profile = await requireProfile();

  const parsed = trainingEntrySchema.safeParse(input);
  if (!parsed.success) {
    return failed(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }

  const entry = parsed.data;
  const supabase = createClient();

  const opened = await openSubmissionForEditing(
    profile.id,
    entry.month,
    entry.year,
  );
  if ("error" in opened) return failed(opened.error);

  const startDatetime = new Date(entry.startDatetime).toISOString();
  const endDatetime = new Date(entry.endDatetime).toISOString();
  const calculatedMinutes = calculateMinutes(
    entry.startDatetime,
    entry.endDatetime,
  );

  const isOverridden = calculatedMinutes !== entry.recordedMinutes;

  const values = {
    title: entry.title,
    start_datetime: startDatetime,
    end_datetime: endDatetime,
    calculated_minutes: calculatedMinutes,
    recorded_minutes: entry.recordedMinutes,
    override_reason: isOverridden ? (entry.overrideReason ?? null) : null,
    location: entry.location || null,
    trainer_provider: entry.trainerProvider || null,
    effectiveness: entry.effectiveness ?? null,
    remarks: entry.remarks || null,
  };

  if (entry.recordId) {
    const { error } = await supabase
      .from("training_records")
      .update(values)
      .eq("id", entry.recordId)
      .eq("submission_id", opened.id);

    if (error) return failed("Could not save this entry.");

    await logAction({
      actionType: "training_record.updated",
      description: `${profile.full_name} updated "${entry.title}"`,
      relatedTable: "training_records",
      relatedId: entry.recordId,
      performedBy: profile.id,
    });

    revalidatePath("/training");
    return { ok: true, data: { recordId: entry.recordId } };
  }

  const { data: last } = await supabase
    .from("training_records")
    .select("seq_no")
    .eq("submission_id", opened.id)
    .order("seq_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from("training_records")
    .insert({
      ...values,
      submission_id: opened.id,
      seq_no: (last?.seq_no ?? 0) + 1,
    })
    .select("id")
    .single();

  if (error || !created) return failed("Could not save this entry.");

  await logAction({
    actionType: "training_record.created",
    description: `${profile.full_name} recorded "${entry.title}"`,
    relatedTable: "training_records",
    relatedId: created.id,
    performedBy: profile.id,
  });

  revalidatePath("/training");
  return { ok: true, data: { recordId: created.id } };
}

export async function deleteTrainingEntry(
  recordId: number,
): Promise<ActionResult> {
  const profile = await requireProfile();
  const supabase = createClient();

  const { error } = await supabase
    .from("training_records")
    .delete()
    .eq("id", recordId);

  if (error) {
    return failed("Could not remove this entry. The month may already be submitted.");
  }

  await logAction({
    actionType: "training_record.deleted",
    description: `${profile.full_name} removed a training entry`,
    relatedTable: "training_records",
    relatedId: recordId,
    performedBy: profile.id,
  });

  revalidatePath("/training");
  return { ok: true };
}

export async function attachFile(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = attachmentSchema.safeParse(input);
  if (!parsed.success) return failed("That file could not be attached.");

  const supabase = createClient();

  const { error } = await supabase.from("training_attachments").insert({
    training_record_id: parsed.data.recordId,
    file_path: parsed.data.filePath,
    file_name: parsed.data.fileName,
    file_size: parsed.data.fileSize,
  });

  if (error) return failed("That file could not be attached.");

  await logAction({
    actionType: "training_attachment.added",
    description: `${profile.full_name} attached ${parsed.data.fileName}`,
    relatedTable: "training_attachments",
    relatedId: parsed.data.recordId,
    performedBy: profile.id,
  });

  revalidatePath("/training");
  return { ok: true };
}

export async function removeAttachment(
  attachmentId: string,
): Promise<ActionResult> {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: attachment } = await supabase
    .from("training_attachments")
    .select("file_path")
    .eq("id", attachmentId)
    .maybeSingle();

  const { error } = await supabase
    .from("training_attachments")
    .delete()
    .eq("id", attachmentId);

  if (error) return failed("Could not remove this attachment.");

  if (attachment) {
    await supabase.storage
      .from("training-attachments")
      .remove([attachment.file_path]);
  }

  await logAction({
    actionType: "training_attachment.removed",
    description: `${profile.full_name} removed an attachment`,
    relatedTable: "training_attachments",
    relatedId: attachmentId,
    performedBy: profile.id,
  });

  revalidatePath("/training");
  return { ok: true };
}

export async function submitMonth(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = periodSchema.safeParse(input);
  if (!parsed.success) return failed("Choose a valid month.");

  const { month, year } = parsed.data;
  const supabase = createClient();

  const { data: submission } = await supabase
    .from("training_submissions")
    .select("id, status, is_nil_return, total_minutes")
    .eq("employee_id", profile.id)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  if (!submission) {
    return failed("There is nothing to submit for this month yet.");
  }

  if (!isEditableStatus(submission.status)) {
    return failed("This month has already been submitted.");
  }

  const { count } = await supabase
    .from("training_records")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submission.id);

  if (!submission.is_nil_return && (count ?? 0) === 0) {
    return failed(
      "Add at least one training entry, or declare a nil return for this month.",
    );
  }

  const targets = await getTargets();
  const submittedAt = new Date();

  const { error } = await supabase
    .from("training_submissions")
    .update({
      status: "submitted_pending_hod",
      submitted_at: submittedAt.toISOString(),
      is_late: isLateSubmission(
        submittedAt,
        month,
        year,
        targets.submissionDeadlineDay,
      ),
    })
    .eq("id", submission.id);

  if (error) return failed("Could not submit this month.");

  await logAction({
    actionType: "submission.submitted",
    description: `${profile.full_name} submitted ${monthName(month)} ${year}`,
    relatedTable: "training_submissions",
    relatedId: submission.id,
    performedBy: profile.id,
  });

  revalidatePath("/training");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Reopens a month that was declared a nil return. Needed when a HOD sends one
 * back: without this the employee cannot add the entries they were asked for.
 */
export async function withdrawNilReturn(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = periodSchema.safeParse(input);
  if (!parsed.success) return failed("Choose a valid month.");

  const { month, year } = parsed.data;
  const supabase = createClient();

  const { data: submission } = await supabase
    .from("training_submissions")
    .select("id, status, is_nil_return")
    .eq("employee_id", profile.id)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  if (!submission || !submission.is_nil_return) {
    return failed("This month is not recorded as a nil return.");
  }

  if (!isEditableStatus(submission.status)) {
    return failed("This month is with your reviewers and cannot be changed.");
  }

  const { error } = await supabase
    .from("training_submissions")
    .update({ is_nil_return: false })
    .eq("id", submission.id);

  if (error) return failed("Could not withdraw the nil return.");

  await logAction({
    actionType: "submission.nil_return_withdrawn",
    description: `${profile.full_name} withdrew the nil return for ${monthName(month)} ${year}`,
    relatedTable: "training_submissions",
    relatedId: submission.id,
    performedBy: profile.id,
  });

  revalidatePath("/training");
  return { ok: true };
}

export async function declareNilReturn(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = periodSchema.safeParse(input);
  if (!parsed.success) return failed("Choose a valid month.");

  const { month, year } = parsed.data;
  const supabase = createClient();

  const opened = await openSubmissionForEditing(profile.id, month, year);
  if ("error" in opened) return failed(opened.error);

  const { count } = await supabase
    .from("training_records")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", opened.id);

  if ((count ?? 0) > 0) {
    return failed(
      "This month already has training entries. Remove them before declaring a nil return.",
    );
  }

  const targets = await getTargets();
  const submittedAt = new Date();

  const { error } = await supabase
    .from("training_submissions")
    .update({
      is_nil_return: true,
      status: "submitted_pending_hod",
      submitted_at: submittedAt.toISOString(),
      is_late: isLateSubmission(
        submittedAt,
        month,
        year,
        targets.submissionDeadlineDay,
      ),
    })
    .eq("id", opened.id);

  if (error) return failed("Could not record a nil return for this month.");

  await logAction({
    actionType: "submission.nil_return",
    description: `${profile.full_name} declared no training for ${monthName(month)} ${year}`,
    relatedTable: "training_submissions",
    relatedId: opened.id,
    performedBy: profile.id,
  });

  revalidatePath("/training");
  revalidatePath("/dashboard");
  return { ok: true };
}

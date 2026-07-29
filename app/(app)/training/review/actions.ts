"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { logAction } from "@/lib/automationLog";
import { createClient } from "@/lib/supabase/server";
import type { SubmissionStatus } from "@/lib/types";
import { monthName } from "@/lib/utils/targets";
import { reviewDecisionSchema } from "@/lib/validation/training";

type Result = { ok: true } | { ok: false; error: string };

const DECISION_STATUS: Record<string, SubmissionStatus> = {
  verify: "hod_verified",
  return: "returned_by_hod",
  approve: "approved",
  reject: "rejected",
};

const DECISION_LOG: Record<string, string> = {
  verify: "submission.hod_verified",
  return: "submission.returned",
  approve: "submission.approved",
  reject: "submission.rejected",
};

/**
 * Applies one verification decision. The database trigger is the authority on
 * who may do what and stamps the verifier and timestamp; this only refuses
 * early so the reviewer gets a readable message instead of a raw error.
 */
export async function reviewSubmission(input: unknown): Promise<Result> {
  const profile = await requireProfile();

  const parsed = reviewDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const { submissionId, decision, comment } = parsed.data;
  const isHodStage = decision === "verify" || decision === "return";

  if (isHodStage && profile.role !== "hod") {
    return { ok: false, error: "Only a head of department can verify at this stage." };
  }

  if (!isHodStage && profile.role !== "hr_admin") {
    return { ok: false, error: "Only HR can approve or reject a submission." };
  }

  const supabase = createClient();

  const { data: submission } = await supabase
    .from("training_submissions")
    .select("id, status, month, year, employee:users!training_submissions_employee_id_fkey ( full_name )")
    .eq("id", submissionId)
    .maybeSingle();

  if (!submission) {
    return { ok: false, error: "That submission is no longer available to you." };
  }

  const expected: SubmissionStatus = isHodStage
    ? "submitted_pending_hod"
    : "hod_verified";

  if (submission.status !== expected) {
    return {
      ok: false,
      error: isHodStage
        ? "This submission is no longer waiting for HOD verification."
        : "This submission has not been verified by a head of department yet.",
    };
  }

  const { error } = await supabase
    .from("training_submissions")
    .update({
      status: DECISION_STATUS[decision],
      ...(isHodStage
        ? { hod_comment: comment || null }
        : { hr_comment: comment || null }),
    })
    .eq("id", submissionId);

  if (error) {
    return { ok: false, error: "Could not record that decision." };
  }

  const employeeName =
    (submission.employee as unknown as { full_name: string } | null)?.full_name ??
    "an employee";

  await logAction({
    actionType: DECISION_LOG[decision],
    description: `${profile.full_name}: ${employeeName} — ${monthName(submission.month)} ${submission.year}`,
    relatedTable: "training_submissions",
    relatedId: submissionId,
    performedBy: profile.id,
  });

  revalidatePath("/training");
  revalidatePath("/training/team");
  revalidatePath("/training/submissions");
  revalidatePath(`/training/review/${submissionId}`);
  revalidatePath("/dashboard");

  return { ok: true };
}

/**
 * HR approving a batch of already HOD-verified submissions. Each one goes
 * through the same trigger as a single approval; a failure on one does not
 * abandon the rest.
 */
export async function bulkApprove(
  submissionIds: string[],
): Promise<{ ok: true; approved: number; failed: number } | { ok: false; error: string }> {
  const profile = await requireProfile();

  if (profile.role !== "hr_admin") {
    return { ok: false, error: "Only HR can approve submissions." };
  }

  if (submissionIds.length === 0) {
    return { ok: false, error: "Select at least one submission to approve." };
  }

  const supabase = createClient();

  const { data: eligible } = await supabase
    .from("training_submissions")
    .select("id")
    .in("id", submissionIds)
    .eq("status", "hod_verified");

  const ids = (eligible ?? []).map((row) => row.id);

  let approved = 0;
  for (const id of ids) {
    const { error } = await supabase
      .from("training_submissions")
      .update({ status: "approved" })
      .eq("id", id);

    if (!error) approved += 1;
  }

  if (approved > 0) {
    await logAction({
      actionType: "submission.bulk_approved",
      description: `${profile.full_name} approved ${approved} submissions`,
      relatedTable: "training_submissions",
      performedBy: profile.id,
    });
  }

  revalidatePath("/training/submissions");
  revalidatePath("/dashboard");

  return { ok: true, approved, failed: submissionIds.length - approved };
}

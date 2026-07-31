"use server";

import { revalidatePath } from "next/cache";

import { failed, type ActionResult } from "@/lib/actionResult";
import { suggestRequest, type RequestSuggestion } from "@/lib/ai/suggestRequest";
import { requireProfile } from "@/lib/auth";
import { logAction } from "@/lib/automationLog";
import { createClient } from "@/lib/supabase/server";
import type { RequestStatus } from "@/lib/types";
import {
  createRequestSchema,
  requestCommentSchema,
  requestDecisionSchema,
  suggestionInputSchema,
} from "@/lib/validation/requests";

/**
 * Runs the suggestion engine and records that it was used.
 *
 * A server action rather than a call in the browser, so that swapping the
 * deterministic engine for a real model later is a change to one file and never
 * puts a key in the bundle.
 */
export async function generateSuggestion(
  input: unknown,
): Promise<ActionResult<RequestSuggestion>> {
  const profile = await requireProfile();

  const parsed = suggestionInputSchema.safeParse(input);
  if (!parsed.success) {
    return failed("Write a description first, then ask for a suggestion.");
  }

  const suggestion = suggestRequest(parsed.data.description);

  await logAction({
    actionType: "request.ai_suggested",
    description: `${profile.full_name} generated a suggestion (${suggestion.category}, ${suggestion.priority})`,
    relatedTable: "requests",
    performedBy: profile.id,
  });

  return { ok: true, data: suggestion };
}

export async function createRequest(
  input: unknown,
): Promise<ActionResult<{ requestId: number }>> {
  const profile = await requireProfile();

  const parsed = createRequestSchema.safeParse(input);
  if (!parsed.success) {
    return failed(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }

  const entry = parsed.data;
  const supabase = createClient();

  // A request needing approval waits for one; anything else goes straight into
  // the handling team's queue.
  const status: RequestStatus = entry.approvalRequired
    ? "pending_approval"
    : "submitted";

  const { data: created, error } = await supabase
    .from("requests")
    .insert({
      requester_id: profile.id,
      title: entry.title,
      description: entry.description,
      category: entry.category,
      estimated_cost_cents: entry.estimatedCostCents,
      priority: entry.priority,
      assigned_department: entry.assignedDepartment,
      approval_required: entry.approvalRequired,
      status,
      attachment_path: entry.attachmentPath ?? null,
      attachment_name: entry.attachmentName ?? null,
      ai_suggestion: entry.aiSuggestion ?? null,
    })
    .select("id")
    .single();

  if (error || !created) {
    return failed(`Could not submit this request: ${error?.message ?? "unknown error"}`);
  }

  await logAction({
    actionType: "request.submitted",
    description: `${profile.full_name} submitted "${entry.title}"`,
    relatedTable: "requests",
    relatedId: created.id,
    performedBy: profile.id,
  });

  revalidatePath("/requests");
  revalidatePath("/dashboard");

  return { ok: true, data: { requestId: created.id } };
}

const DECISION_STATUS: Record<string, RequestStatus> = {
  approve: "approved",
  reject: "rejected",
  start: "in_progress",
  complete: "completed",
};

const DECISION_LOG: Record<string, string> = {
  approve: "request.approved",
  reject: "request.rejected",
  start: "request.in_progress",
  complete: "request.completed",
};

/**
 * Approve, reject, start or complete a request.
 *
 * The database owns the rules — who may decide, that a decision stamps its
 * reviewer, that a rejection carries a reason. This checks the same things
 * first only so the user gets a sentence instead of a constraint name.
 */
export async function decideRequest(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = requestDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return failed(parsed.error.issues[0]?.message ?? "Check the decision and try again.");
  }

  const { requestId, decision, comment } = parsed.data;
  const supabase = createClient();

  const { data: request, error: readError } = await supabase
    .from("requests")
    .select("id, requester_id, status, title")
    .eq("id", requestId)
    .maybeSingle();

  if (readError) return failed(`Could not read this request: ${readError.message}`);
  if (!request) return failed("This request is no longer available.");

  if (request.requester_id === profile.id) {
    return failed("You cannot decide on a request you raised yourself.");
  }

  const nextStatus = DECISION_STATUS[decision];

  const allowed: Record<string, RequestStatus[]> = {
    approve: ["submitted", "pending_approval"],
    reject: ["submitted", "pending_approval"],
    start: ["submitted", "approved"],
    complete: ["approved", "in_progress"],
  };

  if (!allowed[decision].includes(request.status)) {
    return failed(
      `A request that is ${request.status.replace("_", " ")} cannot be moved that way.`,
    );
  }

  const { error } = await supabase
    .from("requests")
    .update({
      status: nextStatus,
      review_comment: comment && comment.length > 0 ? comment : null,
    })
    .eq("id", requestId);

  if (error) return failed(`Could not update this request: ${error.message}`);

  await logAction({
    actionType: DECISION_LOG[decision],
    description: `${profile.full_name} marked "${request.title}" as ${nextStatus.replace("_", " ")}`,
    relatedTable: "requests",
    relatedId: requestId,
    performedBy: profile.id,
  });

  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/dashboard");

  return { ok: true };
}

export async function addRequestComment(input: unknown): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = requestCommentSchema.safeParse(input);
  if (!parsed.success) {
    return failed(parsed.error.issues[0]?.message ?? "Write a comment before adding it.");
  }

  const { requestId, body } = parsed.data;
  const supabase = createClient();

  const { error } = await supabase.from("request_comments").insert({
    request_id: requestId,
    author_id: profile.id,
    body,
  });

  if (error) return failed(`Could not add this comment: ${error.message}`);

  await logAction({
    actionType: "request.comment_added",
    description: `${profile.full_name} commented on request #${requestId}`,
    relatedTable: "requests",
    relatedId: requestId,
    performedBy: profile.id,
  });

  revalidatePath(`/requests/${requestId}`);

  return { ok: true };
}

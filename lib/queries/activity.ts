import { createClient } from "@/lib/supabase/server";

export type ActivityEntry = {
  id: string;
  action_type: string;
  description: string | null;
  created_time: string;
};

/**
 * The audit trail, newest first. RLS restricts automation_logs to hr_admin, so
 * this returns an empty list for anyone else rather than failing.
 */
export async function listRecentActivity(
  limit = 8,
): Promise<ActivityEntry[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from("automation_logs")
    .select("id, action_type, description, created_time")
    .order("created_time", { ascending: false })
    .limit(limit);

  return data ?? [];
}

export const ACTIVITY_LABELS: Record<string, string> = {
  "submission.submitted": "Submitted for verification",
  "submission.nil_return": "Nil return declared",
  "submission.nil_return_withdrawn": "Nil return withdrawn",
  "submission.hod_verified": "Verified by HOD",
  "submission.returned": "Returned to employee",
  "submission.approved": "Approved by HR",
  "submission.rejected": "Rejected by HR",
  "submission.bulk_approved": "Bulk approved by HR",
  "training_record.created": "Training entry added",
  "training_record.updated": "Training entry updated",
  "training_record.deleted": "Training entry removed",
  "training_attachment.added": "Document attached",
  "training_attachment.removed": "Document removed",
};

export function activityLabel(actionType: string): string {
  return ACTIVITY_LABELS[actionType] ?? actionType;
}

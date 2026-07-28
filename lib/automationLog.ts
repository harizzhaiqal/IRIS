import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type AutomationLogEntry = {
  actionType: string;
  description?: string;
  relatedTable?: string;
  relatedId?: string;
  performedBy?: string | null;
  isSystem?: boolean;
};

/**
 * The single writer for the audit trail. Uses the service-role key because
 * automation_logs has no insert policy, which is what stops a client forging
 * or amending an entry.
 *
 * Logging must never break the action it is recording, so failures are
 * swallowed after being reported to the server console.
 */
export async function logAction(entry: AutomationLogEntry): Promise<void> {
  try {
    const admin = createAdminClient();

    const { error } = await admin.from("automation_logs").insert({
      action_type: entry.actionType,
      description: entry.description ?? null,
      related_table: entry.relatedTable ?? null,
      related_id: entry.relatedId ?? null,
      performed_by: entry.performedBy ?? null,
      is_system: entry.isSystem ?? false,
    });

    if (error) {
      console.error("automation log insert failed", error.message);
    }
  } catch (error) {
    console.error("automation log unavailable", error);
  }
}

import type { Enums, Tables } from "@/lib/supabase/database.types";

export type UserRole = Enums<"user_role">;
export type SubmissionStatus = Enums<"submission_status">;
export type Effectiveness = Enums<"training_effectiveness">;

export type Profile = Tables<"users">;
export type Department = Tables<"departments">;
export type AppSettings = Tables<"app_settings">;
export type TrainingSubmission = Tables<"training_submissions">;
export type TrainingRecord = Tables<"training_records">;
export type TrainingAttachment = Tables<"training_attachments">;

/** The statuses in which an employee may still edit their month. */
export const EDITABLE_STATUSES: SubmissionStatus[] = [
  "draft",
  "returned_by_hod",
  "rejected",
];

export function isEditableStatus(status: SubmissionStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: "Draft",
  submitted_pending_hod: "Pending HOD",
  hod_verified: "Pending HR",
  approved: "Approved",
  returned_by_hod: "Returned by HOD",
  rejected: "Rejected",
};

export const EFFECTIVENESS_LABELS: Record<Effectiveness, string> = {
  effective: "Effective",
  average: "Average",
  not_effective: "Not effective",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  staff: "Staff",
  hod: "Head of department",
  hr_admin: "HR admin",
};

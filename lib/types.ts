import type { Enums, Tables } from "@/lib/supabase/database.types";

export type UserRole = Enums<"user_role">;
export type SubmissionStatus = Enums<"submission_status">;
export type Effectiveness = Enums<"training_effectiveness">;
export type RequestStatus = Enums<"request_status">;
export type RequestCategory = Enums<"request_category">;
export type RequestPriority = Enums<"request_priority">;

export type Profile = Tables<"users">;
export type Department = Tables<"departments">;
export type AppSettings = Tables<"app_settings">;
export type TrainingSubmission = Tables<"training_submissions">;
export type TrainingRecord = Tables<"training_records">;
export type TrainingAttachment = Tables<"training_attachments">;
export type RequestRow = Tables<"requests">;
export type RequestComment = Tables<"request_comments">;

/** The statuses in which an employee may still edit their month. */
export const EDITABLE_STATUSES: SubmissionStatus[] = [
  "draft",
  "returned_by_hod",
  "rejected",
];

/**
 * The CEO reviews and reports and changes nothing. Every action in the UI is
 * gated on this, and the database refuses the same writes independently.
 */
export function isReadOnlyRole(role: UserRole): boolean {
  return role === "ceo";
}

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
  ceo: "Chief executive",
};

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: "Submitted",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  in_progress: "In progress",
  completed: "Completed",
};

export const REQUEST_CATEGORY_LABELS: Record<RequestCategory, string> = {
  it_equipment: "IT equipment",
  office_furniture: "Office furniture",
  software: "Software",
  access_card: "Access card",
  name_card: "Name card",
  office_equipment: "Office equipment",
  maintenance: "Maintenance",
  other: "Other",
};

export const REQUEST_PRIORITY_LABELS: Record<RequestPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

/** Display order for filters and summary strips, not a lifecycle. */
export const REQUEST_STATUS_ORDER: RequestStatus[] = [
  "submitted",
  "pending_approval",
  "approved",
  "in_progress",
  "completed",
  "rejected",
];

export const REQUEST_CATEGORY_ORDER: RequestCategory[] = [
  "it_equipment",
  "office_furniture",
  "software",
  "access_card",
  "name_card",
  "office_equipment",
  "maintenance",
  "other",
];

export const REQUEST_PRIORITY_ORDER: RequestPriority[] = [
  "urgent",
  "high",
  "normal",
  "low",
];

/** Still with the requester: they may revise it, nobody has decided. */
export const OPEN_REQUEST_STATUSES: RequestStatus[] = [
  "submitted",
  "pending_approval",
];

export function isOpenRequest(status: RequestStatus): boolean {
  return OPEN_REQUEST_STATUSES.includes(status);
}

/** Awaiting a decision or still being worked on — the "not finished" set. */
export const ACTIVE_REQUEST_STATUSES: RequestStatus[] = [
  "submitted",
  "pending_approval",
  "approved",
  "in_progress",
];

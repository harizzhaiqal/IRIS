import { createClient } from "@/lib/supabase/server";
import type {
  RequestCategory,
  RequestPriority,
  RequestRow,
  RequestStatus,
} from "@/lib/types";
import { ACTIVE_REQUEST_STATUSES } from "@/lib/types";

type Person = { id: number; full_name: string } | null;

export type RequestListItem = RequestRow & {
  requester: (NonNullable<Person> & { department: { name: string } | null }) | null;
};

export type RequestComment = {
  id: number;
  body: string;
  created_time: string;
  author: Person;
};

export type RequestDetail = RequestListItem & {
  reviewer: Person;
  comments: RequestComment[];
};

const LIST_SELECT = `
  *,
  requester:profiles!requests_requester_id_fkey (
    id, full_name,
    department:departments ( name )
  )
`;

const DETAIL_SELECT = `
  *,
  requester:profiles!requests_requester_id_fkey (
    id, full_name,
    department:departments ( name )
  ),
  reviewer:profiles!requests_reviewed_by_fkey ( id, full_name ),
  comments:request_comments (
    id, body, created_time,
    author:profiles!request_comments_author_id_fkey ( id, full_name )
  )
`;

export type RequestFilters = {
  status?: RequestStatus | null;
  category?: RequestCategory | null;
  priority?: RequestPriority | null;
  requesterId?: number | null;
  department?: string | null;
};

/**
 * Every request the signed-in user is allowed to see. RLS decides the scope —
 * own for staff, team for a HOD, everything for HR — so this does not filter by
 * viewer, only by what was asked for.
 */
export async function listRequests(
  filters: RequestFilters = {},
): Promise<RequestListItem[]> {
  const supabase = createClient();

  let query = supabase
    .from("requests")
    .select(LIST_SELECT)
    .order("created_time", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.requesterId) query = query.eq("requester_id", filters.requesterId);
  if (filters.department) {
    query = query.eq("assigned_department", filters.department);
  }

  const { data } = await query;
  return (data as unknown as RequestListItem[] | null) ?? [];
}

/** One request with its reviewer and conversation, or null if out of reach. */
export async function getRequest(id: number): Promise<RequestDetail | null> {
  const supabase = createClient();

  const { data } = await supabase
    .from("requests")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  const detail = data as unknown as RequestDetail;

  // PostgREST returns embedded rows unordered; the conversation must read in
  // the order it happened.
  detail.comments = [...(detail.comments ?? [])].sort((a, b) =>
    a.created_time.localeCompare(b.created_time),
  );

  return detail;
}

/** The requester's own requests, newest first. */
export async function listMyRequests(
  requesterId: number,
): Promise<RequestListItem[]> {
  return listRequests({ requesterId });
}

export type RequestMetrics = {
  open: number;
  pendingApproval: number;
  recentlyCompleted: number;
  total: number;
};

/**
 * Dashboard tiles. Counted from whatever the viewer can see, so a staff member
 * gets their own figures and HR gets the company's from the same call.
 */
export async function getRequestMetrics(
  completedSinceDays = 30,
): Promise<RequestMetrics> {
  const supabase = createClient();

  const { data } = await supabase
    .from("requests")
    .select("status, modified_time");

  const rows = data ?? [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - completedSinceDays);

  return {
    open: rows.filter((r) => ACTIVE_REQUEST_STATUSES.includes(r.status)).length,
    pendingApproval: rows.filter((r) => r.status === "pending_approval").length,
    recentlyCompleted: rows.filter(
      (r) => r.status === "completed" && new Date(r.modified_time) >= cutoff,
    ).length,
    total: rows.length,
  };
}

/** Distinct handling departments present in the data, for the filter list. */
export async function listRequestDepartments(): Promise<string[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from("requests")
    .select("assigned_department")
    .not("assigned_department", "is", null);

  const names = new Set(
    (data ?? [])
      .map((row) => row.assigned_department)
      .filter((name): name is string => Boolean(name)),
  );

  return Array.from(names).sort();
}

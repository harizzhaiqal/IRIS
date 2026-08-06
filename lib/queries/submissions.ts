import { createClient } from "@/lib/supabase/server";
import type {
  SubmissionStatus,
  TrainingAttachment,
  TrainingRecord,
  TrainingSubmission,
} from "@/lib/types";

export type RecordWithAttachments = TrainingRecord & {
  attachments: TrainingAttachment[];
};

export type SubmissionDetail = TrainingSubmission & {
  employee: {
    id: number;
    full_name: string;
    email: string;
    designation: string | null;
    date_joined: string | null;
    hod_id: number | null;
    department: { id: number; name: string } | null;
  } | null;
  hod_verifier: { id: number; full_name: string } | null;
  hr_verifier: { id: number; full_name: string } | null;
  records: RecordWithAttachments[];
};

export type SubmissionListItem = TrainingSubmission & {
  employee: {
    id: number;
    full_name: string;
    designation: string | null;
    department: { id: number; name: string } | null;
  } | null;
};

const LIST_SELECT = `
  *,
  employee:profiles!training_submissions_employee_id_fkey (
    id, full_name, designation,
    department:departments!profiles_department_id_fkey ( id, name )
  )
`;

const DETAIL_SELECT = `
  *,
  employee:profiles!training_submissions_employee_id_fkey (
    id, full_name, email, designation, date_joined, hod_id,
    department:departments!profiles_department_id_fkey ( id, name )
  ),
  hod_verifier:profiles!training_submissions_hod_verified_by_fkey ( id, full_name ),
  hr_verifier:profiles!training_submissions_hr_verified_by_fkey ( id, full_name ),
  records:training_records (
    *,
    attachments:training_attachments ( * )
  )
`;

/** One employee's month, or null if they have not opened it yet. */
export async function getSubmissionForMonth(
  employeeId: number,
  month: number,
  year: number,
): Promise<SubmissionDetail | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("training_submissions")
    .select(DETAIL_SELECT)
    .eq("employee_id", employeeId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle()
    .returns<SubmissionDetail | null>();

  if (error) {
    throw new Error(
      `Unable to load the monthly training record: ${error.message}`,
    );
  }

  if (data?.records) {
    data.records.sort((a, b) => a.seq_no - b.seq_no);
  }

  return data ?? null;
}

export async function getSubmissionById(
  id: number,
): Promise<SubmissionDetail | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("training_submissions")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle()
    .returns<SubmissionDetail | null>();

  if (error) {
    throw new Error(`Unable to load the training submission: ${error.message}`);
  }

  if (data?.records) {
    data.records.sort((a, b) => a.seq_no - b.seq_no);
  }

  return data ?? null;
}

/** Every month an employee has opened in a year, oldest first. */
export async function listYearSubmissions(
  employeeId: number,
  year: number,
): Promise<TrainingSubmission[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("training_submissions")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("year", year)
    .order("month");

  if (error) {
    throw new Error(`Unable to load yearly training records: ${error.message}`);
  }

  return data ?? [];
}

/**
 * A whole year for one employee, entries included — what the Excel export
 * needs. Separate from listYearSubmissions, which the dashboards use and which
 * deliberately does not pull the entries.
 */
export async function listYearSubmissionsWithRecords(
  employeeId: number,
  year: number,
): Promise<SubmissionDetail[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("training_submissions")
    .select(DETAIL_SELECT)
    .eq("employee_id", employeeId)
    .eq("year", year)
    .order("month");

  if (error) {
    throw new Error(
      `Unable to load the yearly training list: ${error.message}`,
    );
  }

  const rows = (data as unknown as SubmissionDetail[] | null) ?? [];

  // PostgREST returns embedded rows unordered, and the form numbers its entries
  // down the page.
  for (const row of rows) {
    row.records = [...(row.records ?? [])].sort(
      (a, b) => a.seq_no - b.seq_no || a.id - b.id,
    );
  }

  return rows;
}

/** One year's detailed submissions for many employees in one HR query. */
export async function listYearSubmissionsWithRecordsForEmployees(
  employeeIds: number[],
  year: number,
): Promise<SubmissionDetail[]> {
  if (employeeIds.length === 0) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_submissions")
    .select(DETAIL_SELECT)
    .in("employee_id", employeeIds)
    .eq("year", year)
    .order("month")
    .returns<SubmissionDetail[]>();

  if (error) {
    throw new Error(
      `Unable to load company training records: ${error.message}`,
    );
  }

  const rows = data ?? [];
  for (const row of rows) {
    row.records = [...(row.records ?? [])].sort(
      (left, right) => left.seq_no - right.seq_no || left.id - right.id,
    );
  }

  return rows;
}

/**
 * Year-to-date totals for a set of employees in one round trip, so the
 * dashboards do not fan out into a query per person.
 */
export async function listYearSubmissionsForEmployees(
  employeeIds: number[],
  year: number,
): Promise<
  Pick<
    TrainingSubmission,
    "id" | "employee_id" | "month" | "status" | "total_minutes" | "is_nil_return"
  >[]
> {
  if (employeeIds.length === 0) return [];

  const supabase = createClient();

  const { data } = await supabase
    .from("training_submissions")
    .select("id, employee_id, month, status, total_minutes, is_nil_return")
    .in("employee_id", employeeIds)
    .eq("year", year);

  return data ?? [];
}

export type EmployeeYearTrainingSummary = Pick<
  TrainingSubmission,
  "id" | "employee_id" | "month" | "status" | "total_minutes"
> & {
  records: { id: number }[];
};

/** Training counts and recorded time for an HR employee directory. */
export async function listEmployeeYearTrainingSummaries(
  employeeIds: number[],
  year: number,
): Promise<EmployeeYearTrainingSummary[]> {
  if (employeeIds.length === 0) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_submissions")
    .select(
      "id, employee_id, month, status, total_minutes, records:training_records ( id )",
    )
    .in("employee_id", employeeIds)
    .eq("year", year)
    .returns<EmployeeYearTrainingSummary[]>();

  if (error) {
    throw new Error(`Unable to load employee training totals: ${error.message}`);
  }

  return data ?? [];
}

export async function listTeamSubmissionsForMonth(
  employeeIds: number[],
  month: number,
  year: number,
): Promise<SubmissionListItem[]> {
  if (employeeIds.length === 0) return [];

  const supabase = createClient();

  const { data } = await supabase
    .from("training_submissions")
    .select(LIST_SELECT)
    .in("employee_id", employeeIds)
    .eq("month", month)
    .eq("year", year)
    .returns<SubmissionListItem[]>();

  return data ?? [];
}

export type SubmissionFilters = {
  month?: number | null;
  year?: number | null;
  departmentId?: number | null;
  status?: SubmissionStatus | null;
  employeeId?: number | null;
};

/** HR's company-wide view. RLS restricts this to hr_admin. */
export async function listSubmissions(
  filters: SubmissionFilters,
): Promise<SubmissionListItem[]> {
  const supabase = createClient();

  // Department lives on the employee, not the submission. Resolving it to a
  // list of ids first avoids filtering across an embedded resource, where a
  // non-matching row comes back with a null embed instead of being excluded.
  let departmentEmployeeIds: number[] | null = null;
  if (filters.departmentId) {
    const { data: members } = await supabase
      .from("profiles")
      .select("id")
      .eq("department_id", filters.departmentId);

    departmentEmployeeIds = (members ?? []).map((member) => member.id);
    if (departmentEmployeeIds.length === 0) return [];
  }

  let query = supabase.from("training_submissions").select(LIST_SELECT);

  if (filters.year) query = query.eq("year", filters.year);
  if (filters.month) query = query.eq("month", filters.month);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.employeeId) query = query.eq("employee_id", filters.employeeId);
  if (departmentEmployeeIds) {
    query = query.in("employee_id", departmentEmployeeIds);
  }

  const { data } = await query
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .returns<SubmissionListItem[]>();

  return data ?? [];
}

/** Submissions sitting at a given verification stage, for reviewer queues. */
export async function countSubmissionsByStatus(
  status: SubmissionStatus,
  employeeIds?: number[],
): Promise<number> {
  const supabase = createClient();

  let query = supabase
    .from("training_submissions")
    .select("id", { count: "exact", head: true })
    .eq("status", status);

  if (employeeIds) {
    if (employeeIds.length === 0) return 0;
    query = query.in("employee_id", employeeIds);
  }

  const { count } = await query;

  return count ?? 0;
}

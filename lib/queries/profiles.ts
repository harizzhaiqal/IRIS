import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type ProfileSummary = {
  id: string;
  full_name: string;
  email: string;
  designation: string | null;
  date_joined: string | null;
  department_id: string | null;
  hod_id: string | null;
};

const SUMMARY_COLUMNS =
  "id, full_name, email, designation, date_joined, department_id, hod_id";

export async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = createClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return data ?? null;
}

/** Just the display name, for verification trails and headers. */
export async function getProfileName(id: string | null): Promise<string | null> {
  if (!id) return null;

  const supabase = createClient();

  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", id)
    .maybeSingle();

  return data?.full_name ?? null;
}

/** Active employees reporting to the given HOD. */
export async function listTeamMembers(hodId: string): Promise<ProfileSummary[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from("profiles")
    .select(SUMMARY_COLUMNS)
    .eq("hod_id", hodId)
    .eq("is_active", true)
    .order("full_name");

  return data ?? [];
}

/** Every active employee. HR only — RLS returns nothing for other roles. */
export async function listActiveEmployees(): Promise<ProfileSummary[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from("profiles")
    .select(SUMMARY_COLUMNS)
    .eq("is_active", true)
    .order("full_name");

  return data ?? [];
}

import { createClient } from "@/lib/supabase/server";

export type DepartmentOption = { id: string; name: string };

export async function listDepartments(): Promise<DepartmentOption[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from("departments")
    .select("id, name")
    .order("name");

  return data ?? [];
}

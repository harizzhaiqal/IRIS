import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types";

/** The signed-in user's profile, or null when there is no valid session. */
export async function getSessionProfile(): Promise<Profile | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Matched on auth_user_id, not id: the session carries the Supabase Auth
  // uuid, while public.profiles has its own integer key.
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return data ?? null;
}

/** Same, but sends anyone without a profile back to the login page. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  return profile;
}

/**
 * Gate a page on role. Anyone signed in but not permitted lands back on the
 * dashboard rather than a dead end.
 */
export async function requireRole(roles: UserRole[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}

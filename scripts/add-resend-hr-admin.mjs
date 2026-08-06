// Creates the real-email HR test account through Supabase's supported Auth
// Admin API, then adds the matching IRIS profile and audit entry.

import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const EMAIL = "harizzhaiqal96@gmail.com";
const FULL_NAME = "HR Admin 2";
const DESIGNATION = "HR Administrator";
const DEPARTMENT = "HR";

function requiredEnvironment(name, fallbackName) {
  const value = process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) {
    const alternatives = fallbackName ? ` or ${fallbackName}` : "";
    throw new Error(`Missing ${name}${alternatives} in .env.local.`);
  }
  return value;
}

async function main() {
  const supabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = requiredEnvironment(
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  const temporaryPassword = `${randomBytes(18).toString("base64url")}!Aa1`;
  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data: existingProfile, error: existingProfileError } = await admin
    .from("profiles")
    .select("id, email, role")
    .eq("email", EMAIL)
    .maybeSingle();

  if (existingProfileError) {
    throw new Error(`Could not check the existing profile: ${existingProfileError.message}`);
  }
  if (existingProfile) {
    throw new Error(
      `${EMAIL} already has an IRIS profile (id ${existingProfile.id}, role ${existingProfile.role}). Nothing was changed.`,
    );
  }

  const { data: department, error: departmentError } = await admin
    .from("departments")
    .select("id, hod_id")
    .eq("name", DEPARTMENT)
    .maybeSingle();

  if (departmentError) {
    throw new Error(`Could not load the HR department: ${departmentError.message}`);
  }
  if (!department) {
    throw new Error('The "HR" department does not exist. Nothing was changed.');
  }

  let authUserId;

  try {
    const { data: authResult, error: authError } =
      await admin.auth.admin.createUser({
        email: EMAIL,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: FULL_NAME },
      });

    if (authError || !authResult.user) {
      throw new Error(
        `Could not create the Supabase Auth user: ${authError?.message ?? "unknown error"}`,
      );
    }
    authUserId = authResult.user.id;

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .insert({
        auth_user_id: authUserId,
        full_name: FULL_NAME,
        email: EMAIL,
        designation: DESIGNATION,
        date_joined: new Date().toISOString().slice(0, 10),
        role: "hr_admin",
        department_id: department.id,
        hod_id: department.hod_id,
        is_active: true,
      })
      .select("id, full_name, email, role")
      .single();

    if (profileError || !profile) {
      throw new Error(
        `Auth user was created, but the IRIS profile failed: ${profileError?.message ?? "unknown error"}`,
      );
    }

    const { error: logError } = await admin.from("automation_logs").insert({
      action_type: "profile.created",
      description: `${FULL_NAME} (${EMAIL}) added as hr_admin`,
      related_table: "profiles",
      related_id: profile.id,
      performed_by: null,
      is_system: true,
    });

    if (logError) {
      throw new Error(`The audit entry could not be written: ${logError.message}`);
    }

    console.log("HR administrator created successfully.");
    console.log(`Name: ${profile.full_name}`);
    console.log(`Email: ${profile.email}`);
    console.log(`Role: ${profile.role}`);
    console.log(`Temporary password: ${temporaryPassword}`);
    console.log("Copy the temporary password now, then use Reminders > Send test to me.");
  } catch (error) {
    if (authUserId) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(authUserId);
      if (cleanupError) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)} Cleanup also failed for Auth user ${authUserId}: ${cleanupError.message}`,
        );
      }
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

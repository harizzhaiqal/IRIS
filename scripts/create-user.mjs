// Creates IRIS users: the Supabase Auth account and the matching profile row.
//
//   node --env-file=.env.local scripts/create-user.mjs "Full Name" email@irs.com.my
//   node --env-file=.env.local scripts/create-user.mjs "HR Admin 2" me@gmail.com --role hr_admin --department HR
//   node --env-file=.env.local scripts/create-user.mjs --roster
//
// Why this is not SQL.
//
// auth.users belongs to Supabase Auth (GoTrue), and on current projects it is
// owned by supabase_auth_admin. The SQL Editor runs as postgres, which no
// longer has rights over that table, so an INSERT there fails with
// "must be owner of table users" — or on some projects "permission denied".
// Writing the auth schema by hand was never a supported route; it only worked
// on older projects that had looser grants.
//
// The Admin API below is the supported route. It also does two things the SQL
// could only imitate: it hashes the password the way GoTrue expects, and it
// creates the auth.identities row that email/password sign-in resolves
// through. Miss that row and the account exists but cannot log in.
//
// Options:
//   --role         staff (default) | hod | hr_admin | ceo
//   --department   must match public.departments.name, case-insensitive
//   --designation  job title
//   --hod          email of the reviewer; defaults to the head of --department
//   --password     defaults to a generated one, printed at the end
//   --joined       YYYY-MM-DD, defaults to today
//   --roster       create the twelve-person staff roster instead

import { createClient } from "@supabase/supabase-js";

const ROSTER = [
  ["Hariz Haiqal", "harizhaiqal@irs.com.my", "Software Developer", "R&D"],
  ["Amyra", "amyra@irs.com.my", "Software Developer", "R&D"],
  ["Yu Shen Fei", "fish@irs.com.my", "Software Developer", "R&D"],
  ["Steve", "steve@irs.com.my", "Quality Assurance", "R&D"],
  ["Isman", "isman@irs.com.my", "Customer Support", "Support"],
  ["Akmal", "akmal@irs.com.my", "Customer Support", "Support"],
  ["Soo Peng", "soopeng@irs.com.my", "Sales Executive", "Sales"],
  ["Jeff", "jeff@irs.com.my", "Sales Executive", "Sales"],
  ["Ina", "ina@irs.com.my", "Admin Executive", "Admin"],
  ["Yi Ting", "yiting@irs.com.my", "Finance Executive", "Finance"],
  ["Lui", "lui@irs.com.my", "Support Engineer", "Support Engineer"],
  ["Qiao Hui", "qiaohui@irs.com.my", "HR Executive", "HR"],
];

const ROSTER_PASSWORD = "Password123!";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flags = {};
const positional = [];

for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith("--")) {
    const key = argv[i].slice(2);
    // --roster takes no value; everything else consumes the next argument.
    if (key === "roster") flags.roster = true;
    else {
      flags[key] = argv[i + 1];
      i += 1;
    }
  } else {
    positional.push(argv[i]);
  }
}

function die(message, hint) {
  console.error(`\n  ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error("");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  die(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.",
    "Run with: node --env-file=.env.local scripts/create-user.mjs ...",
  );
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** A password that satisfies any reasonable policy, when none was given. */
function generatePassword() {
  return `${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}!Aa1`;
}

// ---------------------------------------------------------------------------
// Creating one person
// ---------------------------------------------------------------------------

async function createOne({
  fullName,
  email,
  designation = null,
  departmentName = null,
  role = "staff",
  hodEmail = null,
  password,
  dateJoined,
}) {
  const address = email.trim().toLowerCase();
  const name = fullName.trim();

  // Refuse rather than overwrite. This script adds people; a duplicate means
  // either a typo or someone already here, and quietly rewriting their profile
  // is the wrong answer to both.
  const { data: existing } = await db
    .from("profiles")
    .select("id")
    .eq("email", address)
    .maybeSingle();

  if (existing) {
    return { status: "skipped", email: address, reason: "profile already exists" };
  }

  // A named department that does not exist is a typo. Resolving it to null
  // would file the person outside every department instead, which reads as
  // deliberate and is not.
  let departmentId = null;
  let hodId = null;

  if (departmentName) {
    const { data: departments, error } = await db
      .from("departments")
      .select("id, name, hod_id");

    if (error) die(`Could not read departments: ${error.message}`);

    const match = (departments ?? []).find(
      (d) => d.name.toLowerCase() === departmentName.trim().toLowerCase(),
    );

    if (!match) {
      die(
        `No department named "${departmentName}".`,
        `Known: ${(departments ?? []).map((d) => d.name).join(", ")}`,
      );
    }

    departmentId = match.id;
    // Verification is matched on profiles.hod_id, so a staff member without
    // one has nobody who can verify their monthly record.
    hodId = match.hod_id;
  }

  if (hodEmail) {
    const { data: hod } = await db
      .from("profiles")
      .select("id")
      .eq("email", hodEmail.trim().toLowerCase())
      .maybeSingle();

    if (!hod) die(`No profile found for the head of department ${hodEmail}.`);
    hodId = hod.id;
  }

  // 1. The Auth account. GoTrue writes auth.users and auth.identities together,
  //    which is the part that cannot be done from SQL.
  const { data: created, error: authError } = await db.auth.admin.createUser({
    email: address,
    password,
    // Created by an administrator, so there is no confirmation mail to wait on.
    // Left false, sign-in is blocked with a message that does not explain why.
    email_confirm: true,
    user_metadata: { full_name: name },
  });

  if (authError || !created?.user) {
    return {
      status: "failed",
      email: address,
      reason: authError?.message ?? "Auth account was not created",
    };
  }

  // 2. The profile. There is no transaction across these two calls, so if this
  //    fails the Auth account is removed again — otherwise the address is burnt:
  //    a retry then trips "already registered" with no profile to show for it.
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .insert({
      auth_user_id: created.user.id,
      full_name: name,
      email: address,
      designation,
      date_joined: dateJoined,
      role,
      department_id: departmentId,
      hod_id: hodId,
      is_active: true,
    })
    .select("id")
    .single();

  if (profileError || !profile) {
    await db.auth.admin.deleteUser(created.user.id);
    return {
      status: "failed",
      email: address,
      reason: `${profileError?.message ?? "profile insert failed"} (auth account rolled back)`,
    };
  }

  // 3. The audit trail. is_system, because this ran outside the UI.
  await db.from("automation_logs").insert({
    action_type: "profile.created",
    description: `${name} (${address}) added as ${role}`,
    related_table: "profiles",
    related_id: profile.id,
    performed_by: null,
    is_system: true,
  });

  return {
    status: "created",
    email: address,
    profileId: profile.id,
    fullName: name,
    role,
    department: departmentName,
    hodId,
    password,
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const today = new Date().toISOString().slice(0, 10);
const results = [];

if (flags.roster) {
  console.log(`\nCreating the staff roster against ${url}\n`);

  for (const [fullName, email, designation, department] of ROSTER) {
    const result = await createOne({
      fullName,
      email,
      designation,
      departmentName: department,
      role: "staff",
      password: ROSTER_PASSWORD,
      dateJoined: flags.joined ?? "2026-01-01",
    });
    results.push(result);
    console.log(
      `  ${result.status.padEnd(8)} ${result.email}${result.reason ? ` — ${result.reason}` : ""}`,
    );
  }
} else {
  const [fullName, email] = positional;

  if (!fullName || !email) {
    die(
      "A full name and an email address are required.",
      'Example: node --env-file=.env.local scripts/create-user.mjs "Hariz Haiqal" hariz@irs.com.my --department R&D',
    );
  }

  const password = flags.password ?? generatePassword();

  console.log(`\nCreating one user against ${url}\n`);

  const result = await createOne({
    fullName,
    email,
    designation: flags.designation ?? null,
    departmentName: flags.department ?? null,
    role: flags.role ?? "staff",
    hodEmail: flags.hod ?? null,
    password,
    dateJoined: flags.joined ?? today,
  });

  results.push(result);

  if (result.status === "created") {
    console.log(`  profile id   ${result.profileId}`);
    console.log(`  name         ${result.fullName}`);
    console.log(`  email        ${result.email}`);
    console.log(`  role         ${result.role}`);
    console.log(`  department   ${result.department ?? "—"}`);
    console.log(`  reviewer id  ${result.hodId ?? "— none, see the warning below"}`);
    console.log(`  password     ${result.password}`);

    if (!result.hodId && result.role === "staff") {
      console.log(
        `\n  Warning: no head of department, so nobody can verify this person's\n` +
          `  monthly training record. Pass --department, or set profiles.hod_id.`,
      );
    }
  } else {
    console.log(`  ${result.status} — ${result.reason}`);
  }
}

const created = results.filter((r) => r.status === "created").length;
const skipped = results.filter((r) => r.status === "skipped").length;
const failed = results.filter((r) => r.status === "failed").length;

console.log(`\n${created} created, ${skipped} already present, ${failed} failed.`);

if (flags.roster && created > 0) {
  console.log(`Every roster account signs in with: ${ROSTER_PASSWORD}`);
  console.log(
    `Next: paste supabase/add-staff-and-training.sql to give them training history.`,
  );
}

console.log("");
process.exit(failed > 0 ? 1 : 0);

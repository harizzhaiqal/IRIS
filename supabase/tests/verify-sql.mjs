// Executes the IRIS migrations and seed against a real Postgres (PGlite/WASM)
// to verify syntax, constraints, triggers, and the RLS rules.
//
// Supabase-specific pieces (auth schema, storage schema, pgcrypto) are stubbed
// because they are provided by the platform, not by these migrations.

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

// Strip CREATE EXTENSION lines: PGlite ships neither uuid-ossp nor pgcrypto.
const stripExtensions = (sql) =>
  sql.replace(/create extension[^;]*;/gi, "");

const db = new PGlite();

// PGlite dumps its whole bundle into stack traces; keep failures readable.
process.on("uncaughtException", (error) => {
  console.error(`\nUNCAUGHT: ${error.message}`);
  if (error.internalQuery) console.error(`in: ${error.internalQuery.slice(0, 400)}`);
  process.exit(1);
});
process.on("unhandledRejection", (error) => {
  console.error(`\nFAILED: ${error?.message ?? error}`);
  if (error?.internalQuery) console.error(`in: ${error.internalQuery.slice(0, 400)}`);
  process.exit(1);
});

let failures = 0;
let checks = 0;

function check(name, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function expectError(name, fn, expectedFragment) {
  checks += 1;
  try {
    await fn();
    failures += 1;
    console.log(`  FAIL  ${name} — expected an error, none raised`);
  } catch (error) {
    const message = String(error.message ?? error);
    if (!expectedFragment || message.toLowerCase().includes(expectedFragment.toLowerCase())) {
      console.log(`  PASS  ${name}`);
    } else {
      failures += 1;
      console.log(`  FAIL  ${name} — wrong error: ${message}`);
    }
  }
}

// SET LOCAL would be a no-op here: PGlite autocommits each statement, so the
// setting must be session-scoped to survive into the next query.
//
// Impersonation is by auth uuid, not by public.profiles.id: that is what a real
// JWT carries and what auth.uid() returns. Resolving it to the integer profile
// id is the schema's job, and these tests exercise that crossing rather than
// bypassing it.
async function asUser(authUid, fn) {
  await db.exec(`select set_config('iris.user_id', '${authUid}', false);`);
  await db.exec(`set role authenticated;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
    await db.exec(`select set_config('iris.user_id', '', false);`);
  }
}

/** The auth uuid behind an integer profile id, for impersonating a seeded row. */
async function authUidFor(profileId) {
  const { rows } = await db.query(
    `select auth_user_id from public.profiles where id = $1`,
    [profileId],
  );
  return rows[0].auth_user_id;
}

console.log("\n=== Platform stubs ===");

await db.exec(`
  create schema if not exists auth;
  create schema if not exists extensions;
  create schema if not exists storage;

  create table auth.users (
    instance_id uuid,
    id uuid primary key,
    aud text, role text, email text,
    encrypted_password text,
    email_confirmed_at timestamptz,
    created_at timestamptz, updated_at timestamptz,
    confirmation_token text, email_change text,
    email_change_token_new text, recovery_token text,
    raw_app_meta_data jsonb, raw_user_meta_data jsonb
  );

  create table auth.identities (
    id uuid primary key,
    user_id uuid references auth.users(id),
    identity_data jsonb,
    provider text,
    provider_id text,
    last_sign_in_at timestamptz,
    created_at timestamptz, updated_at timestamptz,
    unique (provider, provider_id)
  );

  -- Reads the id the test harness is impersonating.
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('iris.user_id', true), '')::uuid;
  $$;

  create function extensions.crypt(text, text) returns text language sql as $$
    select $1 || $2;
  $$;

  create function extensions.gen_salt(text) returns text language sql as $$
    select 'salt';
  $$;

  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text, name text, owner uuid
  );
  create function storage.foldername(text) returns text[] language sql as $$
    select string_to_array($1, '/');
  $$;

  -- The three roles Supabase provisions on every project.
  create role anon;
  create role authenticated;
  create role service_role;
  grant usage on schema public, storage to anon, authenticated, service_role;
`);
console.log("  stubs installed");

console.log("\n=== Migration 1: schema ===");
await db.exec(stripExtensions(read("supabase/migrations/20260728090000_initial_schema.sql")));
console.log("  applied without error");

console.log("\n=== Migration 2: RLS and workflow ===");
await db.exec(stripExtensions(read("supabase/migrations/20260728090100_rls_policies.sql")));
console.log("  applied without error");

console.log("\n=== Migration 3: requests ===");
const requestsMigration = stripExtensions(
  read("supabase/migrations/20260730120000_requests.sql"),
);
await db.exec(requestsMigration);
console.log("  applied without error");

// This file is pasted into the SQL Editor by hand to add the module to a
// database that already holds data, so a second paste must be a no-op rather
// than an error partway down. It once was not: CREATE TYPE has no IF NOT EXISTS.
try {
  await db.exec(requestsMigration);
  check("the requests migration can be applied twice", true);
} catch (error) {
  check("the requests migration can be applied twice", false, error.message);
}

console.log("\n=== Migration 4: create_user ===");
await db.exec(
  stripExtensions(read("supabase/migrations/20260804000000_create_user.sql")),
);
console.log("  applied without error");

// RLS is bypassed for the table owner, so force it for the test.
//
// Deliberately no GRANT here: the migration is expected to issue its own. It
// once did not, relying on Supabase's schema default privileges, and a grant in
// this block hid that for every test below.
await db.exec(`
  alter table public.profiles force row level security;
  alter table public.training_submissions force row level security;
  alter table public.training_records force row level security;
  alter table public.training_attachments force row level security;
  alter table public.automation_logs force row level security;
  alter table public.requests force row level security;
  alter table public.request_comments force row level security;
`);

// Assert the migration granted table access, rather than assuming it.
{
  const { rows } = await db.query(`
    select count(*)::int as n from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public'
      and privilege_type = 'SELECT'
  `);
  check("migration grants authenticated access to the tables", rows[0].n >= 5, `${rows[0].n} tables`);
}

console.log("\n=== Seed ===");
await db.exec(stripExtensions(read("supabase/seed.sql")));
console.log("  applied without error");

// The seed fixes the auth uuids because auth.users belongs to Supabase Auth and
// keys on uuid. Everything in the public schema is keyed by a generated
// integer, so those ids are read back rather than written down here.
const AUTH_UID = {
  hr: "11111111-1111-1111-1111-111111111111",
  ks: "22222222-2222-2222-2222-222222222222",
  joshua: "33333333-3333-3333-3333-333333333333",
  chen: "44444444-4444-4444-4444-444444444444",
  lee: "55555555-5555-5555-5555-555555555555",
  ceo: "66666666-6666-6666-6666-666666666666",
  staffRnd: "77777777-7777-7777-7777-777777777777",
  staffSupport: "88888888-8888-8888-8888-888888888888",
};

const EMAIL = {
  hr: "hr@irs.com.my",
  ks: "ks@irs.com.my",
  joshua: "joshua@irs.com.my",
  chen: "chen@irs.com.my",
  lee: "lee@irs.com.my",
  ceo: "polak@irs.com.my",
  staffRnd: "staff.rnd@irs.com.my",
  staffSupport: "staff.support@irs.com.my",
};

const uid = {};
{
  const { rows } = await db.query(`select email, id, auth_user_id from public.profiles`);
  const byEmail = new Map(rows.map((r) => [r.email, r]));

  for (const [person, email] of Object.entries(EMAIL)) {
    uid[person] = byEmail.get(email)?.id;
  }

  console.log("\n=== Integer keys ===");
  check(
    "every seeded profile has an integer id",
    Object.values(uid).every((v) => Number.isInteger(v)),
    JSON.stringify(uid),
  );
  check(
    "each profile links to the auth account the seed named",
    Object.entries(AUTH_UID).every(
      ([person, authUid]) => byEmail.get(EMAIL[person])?.auth_user_id === authUid,
    ),
  );

  // The point of the whole change: keys read 1, 2, 3, 4 rather than uuids.
  for (const table of [
    "profiles",
    "departments",
    "training_submissions",
    "training_records",
    "automation_logs",
  ]) {
    const { rows: span } = await db.query(`
      select min(id)::int as lo, max(id)::int as hi, count(*)::int as n
        from public.${table}
    `);
    check(
      `${table}.id counts 1..n with no gaps`,
      span[0].lo === 1 && span[0].hi === span[0].n,
      `lo=${span[0].lo} hi=${span[0].hi} n=${span[0].n}`,
    );
  }

  const { rows: types } = await db.query(`
    select table_name, data_type from information_schema.columns
     where table_schema = 'public' and column_name = 'id'
     order by table_name
  `);
  check(
    "every public id column is an integer",
    types.length > 0 && types.every((r) => r.data_type === "integer"),
    types.map((r) => `${r.table_name}=${r.data_type}`).join(", "),
  );

  // A generated identity column must refuse a client-supplied key outright,
  // which is what keeps the sequence and the data in step.
  await expectError(
    "an explicit id is refused by the identity column",
    () =>
      db.query(
        `insert into public.departments (id, name) values (999, 'Forged key')`,
      ),
    "non-DEFAULT value",
  );
}

console.log("\n=== Seed shape ===");
{
  const roles = await db.query(
    `select role, count(*)::int as n from public.profiles group by role order by role`,
  );
  const byRole = Object.fromEntries(roles.rows.map((r) => [r.role, r.n]));
  check("1 hr_admin, 4 hods, 2 staff, 1 ceo",
    byRole.hr_admin === 1 && byRole.hod === 4 && byRole.staff === 2 && byRole.ceo === 1,
    JSON.stringify(byRole));

  const depts = await db.query(`select count(*)::int as n from public.departments`);
  check("7 departments", depts.rows[0].n === 7, `got ${depts.rows[0].n}`);

  const statuses = await db.query(
    `select status, count(*)::int as n from public.training_submissions group by status order by status`,
  );
  const seen = Object.fromEntries(statuses.rows.map((r) => [r.status, r.n]));
  const required = [
    "approved", "submitted_pending_hod", "hod_verified",
    "draft", "returned_by_hod", "rejected",
  ];
  check("every status appears in the seed",
    required.every((s) => (seen[s] ?? 0) > 0), JSON.stringify(seen));

  const nil = await db.query(
    `select count(*)::int as n from public.training_submissions where is_nil_return`,
  );
  check("nil returns present", nil.rows[0].n > 0, `got ${nil.rows[0].n}`);

  const users = await db.query(`select count(*)::int as n from auth.users`);
  check("auth accounts created", users.rows[0].n === 8, `got ${users.rows[0].n}`);

  const spread = await db.query(`
    select min(total)::int as lo, max(total)::int as hi from (
      select sum(total_minutes) as total
        from public.training_submissions
       where year = 2026 and status = 'approved'
       group by employee_id
    ) t
  `);
  check("approved 2026 hours vary across employees",
    spread.rows[0].hi - spread.rows[0].lo > 300,
    `range ${spread.rows[0].lo}–${spread.rows[0].hi} minutes`);
}

console.log("\n=== The multi-day override case ===");
{
  const res = await db.query(`
    select calculated_minutes, recorded_minutes, override_reason
      from public.training_records
     where title like 'Advanced PostgreSQL administration%'
  `);
  const row = res.rows[0];
  check("26–27 Feb entry stored as 16h calculated, 14h recorded",
    row && row.calculated_minutes === 960 && row.recorded_minutes === 840,
    JSON.stringify(row));
  check("override carries a reason", Boolean(row?.override_reason));
}

console.log("\n=== total_minutes trigger ===");
{
  const sub = await db.query(`
    select id, total_minutes from public.training_submissions
     where not is_nil_return and status = 'approved' limit 1
  `);
  const { id } = sub.rows[0];

  const sum = await db.query(
    `select coalesce(sum(recorded_minutes),0)::int as s from public.training_records where submission_id = $1`,
    [id],
  );
  check("total matches the sum of its records",
    sub.rows[0].total_minutes === sum.rows[0].s,
    `${sub.rows[0].total_minutes} vs ${sum.rows[0].s}`);

  const before = sub.rows[0].total_minutes;
  await db.query(
    `insert into public.training_records
       (submission_id, seq_no, title, start_datetime, end_datetime, calculated_minutes, recorded_minutes)
     values ($1, 99, 'Trigger probe', '2026-01-05 09:00+00', '2026-01-05 11:00+00', 120, 120)`,
    [id],
  );
  let after = await db.query(`select total_minutes from public.training_submissions where id = $1`, [id]);
  check("insert raises the total", after.rows[0].total_minutes === before + 120,
    `${after.rows[0].total_minutes}`);

  await db.query(
    `update public.training_records
        set recorded_minutes = 30, override_reason = 'Trigger probe override'
      where submission_id = $1 and seq_no = 99`, [id]);
  after = await db.query(`select total_minutes from public.training_submissions where id = $1`, [id]);
  check("update adjusts the total", after.rows[0].total_minutes === before + 30);

  await db.query(`delete from public.training_records where submission_id = $1 and seq_no = 99`, [id]);
  after = await db.query(`select total_minutes from public.training_submissions where id = $1`, [id]);
  check("delete restores the total", after.rows[0].total_minutes === before);
}

console.log("\n=== Constraints ===");
{
  const sub = await db.query(
    `select id, employee_id, month, year from public.training_submissions limit 1`);
  const { id, employee_id, month, year } = sub.rows[0];

  await expectError("duplicate (employee, month, year) rejected", () =>
    db.query(
      `insert into public.training_submissions (employee_id, month, year) values ($1,$2,$3)`,
      [employee_id, month, year]),
    "unique");

  await expectError("override without a reason rejected", () =>
    db.query(
      `insert into public.training_records
         (submission_id, seq_no, title, start_datetime, end_datetime, calculated_minutes, recorded_minutes)
       values ($1, 98, 'No reason', '2026-01-05 09:00+00', '2026-01-05 17:00+00', 480, 300)`,
      [id]),
    "override_needs_reason");

  await expectError("end before start rejected", () =>
    db.query(
      `insert into public.training_records
         (submission_id, seq_no, title, start_datetime, end_datetime, calculated_minutes, recorded_minutes)
       values ($1, 97, 'Backwards', '2026-01-05 17:00+00', '2026-01-05 09:00+00', 0, 0)`,
      [id]),
    "end_after_start");

  await expectError("month outside 1–12 rejected", () =>
    db.query(
      `insert into public.training_submissions (employee_id, month, year) values ($1, 13, 2027)`,
      [employee_id]),
    "check");
}

console.log("\n=== total_minutes cannot be forged ===");
{
  const sub = await db.query(`
    select id, total_minutes from public.training_submissions
     where not is_nil_return and total_minutes > 0 limit 1`);
  const { id, total_minutes } = sub.rows[0];

  await db.query(
    `update public.training_submissions set total_minutes = 99999 where id = $1`, [id]);
  const after = await db.query(
    `select total_minutes from public.training_submissions where id = $1`, [id]);
  check("a written total is replaced by the true sum",
    after.rows[0].total_minutes === total_minutes, `got ${after.rows[0].total_minutes}`);
}

// Fewer than the number of accounts: HR administers the process rather than
// taking part in it, and the CEO neither submits nor approves. Read from the
// data rather than restated, because who files is a policy decision that has
// already changed once.
const { rows: filers } = await db.query(
  `select count(distinct employee_id)::int as n from public.training_submissions`,
);
const employeesWithRecords = filers[0].n;

console.log("\n=== RLS: row visibility ===");
{
  await asUser(AUTH_UID.staffRnd, async () => {
    const own = await db.query(
      `select count(*)::int as n from public.training_submissions where employee_id = $1`,
      [uid.staffRnd]);
    check("staff sees their own submissions", own.rows[0].n > 0, `got ${own.rows[0].n}`);

    const others = await db.query(
      `select count(*)::int as n from public.training_submissions where employee_id = $1`,
      [uid.staffSupport]);
    check("staff sees nothing of a colleague's submissions", others.rows[0].n === 0,
      `got ${others.rows[0].n}`);

    const otherRecords = await db.query(`
      select count(*)::int as n from public.training_records r
       join public.training_submissions s on s.id = r.submission_id
       where s.employee_id = $1`, [uid.staffSupport]);
    check("staff sees none of a colleague's training records", otherRecords.rows[0].n === 0);

    const logs = await db.query(`select count(*)::int as n from public.automation_logs`);
    check("staff cannot read the audit trail", logs.rows[0].n === 0, `got ${logs.rows[0].n}`);
  });

  await asUser(AUTH_UID.ks, async () => {
    const team = await db.query(
      `select count(*)::int as n from public.training_submissions where employee_id = $1`,
      [uid.staffRnd]);
    check("hod sees a team member's submissions", team.rows[0].n > 0);

    const outside = await db.query(
      `select count(*)::int as n from public.training_submissions where employee_id = $1`,
      [uid.staffSupport]);
    check("hod sees nothing outside their team", outside.rows[0].n === 0,
      `got ${outside.rows[0].n}`);
  });

  await asUser(AUTH_UID.hr, async () => {
    const all = await db.query(
      `select count(distinct employee_id)::int as n from public.training_submissions`);
    check("hr sees every employee who files a record",
      all.rows[0].n === employeesWithRecords,
      `got ${all.rows[0].n}`);

    const logs = await db.query(`select count(*)::int as n from public.automation_logs`);
    check("hr can read the audit trail", logs.rows[0].n > 0);
  });
}

console.log("\n=== RLS: editing windows ===");
{
  const locked = await db.query(`
    select id from public.training_submissions
     where employee_id = $1
       and status not in ('draft', 'returned_by_hod', 'rejected')
     limit 1`, [uid.staffRnd]);

  await asUser(AUTH_UID.staffRnd, async () => {
    // Opened here rather than looked up: which month the seed happens to leave
    // in draft for one person is not what these checks are about, and tying
    // them to it makes them break every time the roster changes.
    const opened = await db.query(
      `insert into public.training_submissions (employee_id, month, year, status)
       values ($1, 5, 2028, 'draft') returning id`, [uid.staffRnd]);
    const draftId = opened.rows[0].id;

    const res = await db.query(
      `insert into public.training_records
         (submission_id, seq_no, title, start_datetime, end_datetime, calculated_minutes, recorded_minutes)
       values ($1, 50, 'Allowed while draft', '2028-05-06 09:00+00', '2028-05-06 12:00+00', 180, 180)
       returning id`, [draftId]);
    check("staff may add entries to a draft month", res.rows.length === 1);

    if (locked.rows[0]) {
      await expectError("staff may not add entries to a submitted month", () =>
        db.query(
          `insert into public.training_records
             (submission_id, seq_no, title, start_datetime, end_datetime, calculated_minutes, recorded_minutes)
           values ($1, 51, 'Blocked', '2026-01-06 09:00+00', '2026-01-06 12:00+00', 180, 180)`,
          [locked.rows[0].id]),
        "row-level security");
    }

    await expectError("staff cannot approve their own month", () =>
      db.query(
        `update public.training_submissions set status = 'approved' where id = $1`,
        [draftId]),
      "only move a submission to submitted_pending_hod");
  });
}

console.log("\n=== Two-stage verification ===");
{
  const res = await db.query(`
    select id from public.training_submissions
     where employee_id = $1 and status = 'draft' limit 1`, [uid.staffRnd]);
  const subId = res.rows[0].id;

  // Staff submits.
  await asUser(AUTH_UID.staffRnd, async () => {
    await db.query(
      `update public.training_submissions
          set status = 'submitted_pending_hod', submitted_at = now() where id = $1`, [subId]);
  });
  let row = await db.query(`select status from public.training_submissions where id = $1`, [subId]);
  check("staff can submit", row.rows[0].status === "submitted_pending_hod");

  // HR cannot skip the HOD stage.
  await asUser(AUTH_UID.hr, async () => {
    await expectError("hr cannot approve before the hod stage", () =>
      db.query(`update public.training_submissions set status = 'approved' where id = $1`, [subId]),
      "only a hod-verified submission");
  });

  // A HOD outside the team cannot act. RLS filters the row out rather than
  // raising, so the update must simply touch nothing.
  await asUser(AUTH_UID.joshua, async () => {
    const res = await db.query(
      `update public.training_submissions set status = 'hod_verified'
        where id = $1 returning id`, [subId]);
    check("a hod outside the team changes nothing", res.rows.length === 0,
      `affected ${res.rows.length} rows`);
  });
  row = await db.query(`select status from public.training_submissions where id = $1`, [subId]);
  check("the submission is untouched by the outside hod",
    row.rows[0].status === "submitted_pending_hod", row.rows[0].status);

  // Return requires a comment.
  await asUser(AUTH_UID.ks, async () => {
    await expectError("returning without a comment is refused", () =>
      db.query(`update public.training_submissions set status = 'returned_by_hod' where id = $1`, [subId]),
      "requires a comment");

    await expectError("a hod cannot write the hr fields", () =>
      db.query(
        `update public.training_submissions
            set status = 'hod_verified', hr_comment = 'sneaking in' where id = $1`, [subId]),
      "only write the hod verification fields");

    await db.query(
      `update public.training_submissions
          set status = 'returned_by_hod', hod_comment = 'Please attach the certificate.'
        where id = $1`, [subId]);
  });
  row = await db.query(
    `select status, hod_verified_by, hod_verified_at from public.training_submissions where id = $1`,
    [subId]);
  check("hod return recorded with actor and timestamp",
    row.rows[0].status === "returned_by_hod" &&
    row.rows[0].hod_verified_by === uid.ks &&
    row.rows[0].hod_verified_at !== null);

  // Staff revises and resubmits.
  await asUser(AUTH_UID.staffRnd, async () => {
    await db.query(
      `update public.training_submissions set status = 'submitted_pending_hod' where id = $1`, [subId]);
  });
  row = await db.query(`select status from public.training_submissions where id = $1`, [subId]);
  check("a returned month reopens and can be resubmitted",
    row.rows[0].status === "submitted_pending_hod");

  // HOD verifies.
  await asUser(AUTH_UID.ks, async () => {
    await db.query(
      `update public.training_submissions
          set status = 'hod_verified', hod_comment = null where id = $1`, [subId]);
  });

  // HR approves.
  await asUser(AUTH_UID.hr, async () => {
    await expectError("hr cannot write the hod fields", () =>
      db.query(
        `update public.training_submissions
            set status = 'approved', hod_comment = 'overwritten' where id = $1`, [subId]),
      "only write the hr verification fields");

    await db.query(
      `update public.training_submissions set status = 'approved' where id = $1`, [subId]);
  });
  row = await db.query(
    `select status, hr_verified_by, hr_verified_at from public.training_submissions where id = $1`,
    [subId]);
  check("hr approval completes the lifecycle",
    row.rows[0].status === "approved" &&
    row.rows[0].hr_verified_by === uid.hr &&
    row.rows[0].hr_verified_at !== null);

  await asUser(AUTH_UID.hr, async () => {
    await expectError("rejecting without a comment is refused", async () => {
      const other = await db.query(
        `select id from public.training_submissions where status = 'hod_verified' limit 1`);
      await db.query(
        `update public.training_submissions set status = 'rejected' where id = $1`,
        [other.rows[0].id]);
    }, "requires a comment");
  });
}

console.log("\n=== Nil returns ===");
{
  const nil = await db.query(`
    select s.id, s.employee_id from public.training_submissions s
     where s.is_nil_return limit 1`);
  const { id, employee_id } = nil.rows[0];

  // Reopen it the way a returned nil return has to be reopened.
  await db.query(
    `update public.training_submissions set status = 'returned_by_hod' where id = $1`, [id]);

  await asUser(await authUidFor(employee_id), async () => {
    const res = await db.query(
      `update public.training_submissions set is_nil_return = false
        where id = $1 returning is_nil_return`, [id]);
    check("the owner can withdraw a nil return while the month is open",
      res.rows[0]?.is_nil_return === false);

    const added = await db.query(
      `insert into public.training_records
         (submission_id, seq_no, title, start_datetime, end_datetime, calculated_minutes, recorded_minutes)
       values ($1, 60, 'Added after withdrawing', '2026-03-04 09:00+00', '2026-03-04 13:00+00', 240, 240)
       returning id`, [id]);
    check("entries can be added once the nil return is withdrawn", added.rows.length === 1);
  });

  await expectError("a nil return cannot hold entries", () =>
    db.query(
      `update public.training_submissions set is_nil_return = true where id = $1`, [id]),
    "nil return cannot contain training entries");
}

console.log("\n=== Privilege escalation ===");
{
  await asUser(AUTH_UID.staffRnd, async () => {
    await expectError("staff cannot promote themselves", () =>
      db.query(`update public.profiles set role = 'hr_admin' where id = $1`, [uid.staffRnd]),
      "only hr can change role");

    await expectError("staff cannot reassign their reporting line", () =>
      db.query(`update public.profiles set hod_id = null where id = $1`, [uid.staffRnd]),
      "only hr can change role");

    // Rebinding the credential link would hand this account to someone else,
    // so it is guarded separately from the HR-owned fields above.
    await expectError("staff cannot repoint their profile at another account", () =>
      db.query(
        `update public.profiles set auth_user_id = $2 where id = $1`,
        [uid.staffRnd, AUTH_UID.staffSupport]),
      "cannot be reassigned");

    const res = await db.query(
      `update public.profiles set designation = 'Principal Engineer' where id = $1 returning designation`,
      [uid.staffRnd]);
    check("staff may still edit their own designation", res.rows[0]?.designation === "Principal Engineer");
  });
}

// The "add training" path end to end: open a month that does not exist yet,
// then write an entry into it and confirm the total follows. This is the flow
// that reported "Could not open this month for editing".
console.log("\n=== Add training, start to finish ===");
{
  await asUser(AUTH_UID.staffRnd, async () => {
    const opened = await db.query(
      `insert into public.training_submissions (employee_id, month, year, status)
       values ($1, 3, 2027, 'draft') returning id`,
      [uid.staffRnd],
    );
    check("staff can open a month that does not exist yet", opened.rows.length === 1);

    const submissionId = opened.rows[0].id;

    // A month the employee just opened must be readable back, or the action
    // cannot tell an existing month from a missing one.
    const readBack = await db.query(
      `select id from public.training_submissions where employee_id = $1 and month = 3 and year = 2027`,
      [uid.staffRnd],
    );
    check("the month just opened is visible to its owner", readBack.rows.length === 1);

    const entry = await db.query(
      `insert into public.training_records
         (submission_id, seq_no, title, start_datetime, end_datetime,
          calculated_minutes, recorded_minutes, effectiveness)
       values ($1, 1, 'Regression entry', '2027-03-02T09:00:00Z', '2027-03-02T17:00:00Z',
               480, 480, 'effective')
       returning id`,
      [submissionId],
    );
    check("staff can add an entry to their open month", entry.rows.length === 1);

    const total = await db.query(
      `select total_minutes from public.training_submissions where id = $1`,
      [submissionId],
    );
    check("the total follows the new entry", total.rows[0]?.total_minutes === 480,
      `got ${total.rows[0]?.total_minutes}`);
  });
}

// Reported as "I submit training, it shows, then I log out and back in and the
// record is gone". A new session changes nothing the database can see: the
// integer profile id is resolved from auth_user_id, which is stable. This
// asserts the row survives being written in one session and read in another.
console.log("\n=== Records survive a new session ===");
{
  let submissionId;
  let recordId;

  await asUser(AUTH_UID.staffRnd, async () => {
    const opened = await db.query(
      `insert into public.training_submissions (employee_id, month, year, status)
       values ($1, 9, 2027, 'draft') returning id`,
      [uid.staffRnd],
    );
    submissionId = opened.rows[0].id;

    const entry = await db.query(
      `insert into public.training_records
         (submission_id, seq_no, title, start_datetime, end_datetime,
          calculated_minutes, recorded_minutes, effectiveness)
       values ($1, 1, 'Survives logout', '2027-09-01T09:00:00Z', '2027-09-01T13:00:00Z',
               240, 240, 'effective')
       returning id`,
      [submissionId],
    );
    recordId = entry.rows[0].id;

    await db.query(
      `update public.training_submissions
          set status = 'submitted_pending_hod', submitted_at = now()
        where id = $1`,
      [submissionId],
    );
  });

  // asUser resets the impersonation on exit, so this block is a fresh session.
  await asUser(AUTH_UID.staffRnd, async () => {
    const sub = await db.query(
      `select status, total_minutes from public.training_submissions where id = $1`,
      [submissionId],
    );
    check("the submitted month is still there in a new session",
      sub.rows.length === 1, `found ${sub.rows.length} rows`);
    check("it is still submitted_pending_hod",
      sub.rows[0]?.status === "submitted_pending_hod", sub.rows[0]?.status);
    check("its total is still 240", sub.rows[0]?.total_minutes === 240,
      `got ${sub.rows[0]?.total_minutes}`);

    const rec = await db.query(
      `select title from public.training_records where id = $1`, [recordId]);
    check("the entry is still readable by its owner", rec.rows.length === 1);
  });

  // A submitted month is no longer editable, but it must remain visible.
  await asUser(AUTH_UID.staffRnd, async () => {
    const listed = await db.query(
      `select count(*)::int as n from public.training_records
        where submission_id = $1`, [submissionId]);
    check("the entry still lists under its month", listed.rows[0].n === 1,
      `got ${listed.rows[0].n}`);
  });
}

// ---------------------------------------------------------------------------
// Requests — the prototype module. Smaller surface than training, but the same
// two questions matter: who can see a request, and who can decide on it.
// ---------------------------------------------------------------------------

console.log("\n=== Requests: seed shape ===");
{
  const statuses = await db.query(
    `select status, count(*)::int as n from public.requests group by status`,
  );
  const seen = Object.fromEntries(statuses.rows.map((r) => [r.status, r.n]));
  const required = [
    "submitted", "pending_approval", "approved",
    "rejected", "in_progress", "completed",
  ];
  check("every request status appears in the seed",
    required.every((s) => (seen[s] ?? 0) > 0), JSON.stringify(seen));

  const cats = await db.query(
    `select count(distinct category)::int as n from public.requests`);
  check("the seed spans several categories", cats.rows[0].n >= 5, `${cats.rows[0].n}`);

  const comments = await db.query(`select count(*)::int as n from public.request_comments`);
  check("requests have comments to show", comments.rows[0].n >= 3, `${comments.rows[0].n}`);
}

console.log("\n=== Requests: visibility ===");
{
  await asUser(AUTH_UID.staffRnd, async () => {
    const mine = await db.query(
      `select count(*)::int as n from public.requests where requester_id <> $1`,
      [uid.staffRnd]);
    check("staff see no one else's requests", mine.rows[0].n === 0, `${mine.rows[0].n} leaked`);
  });

  await asUser(AUTH_UID.hr, async () => {
    const all = await db.query(`select count(*)::int as n from public.requests`);
    check("hr sees every request", all.rows[0].n === 10, `${all.rows[0].n}`);
  });

  await asUser(AUTH_UID.ks, async () => {
    // Faizal heads Software Development, so he sees his team's and his own.
    const team = await db.query(`
      select count(*)::int as n from public.requests r
      join public.profiles u on u.id = r.requester_id
      where u.hod_id is distinct from $1 and r.requester_id <> $2`,
      [uid.ks, uid.ks]);
    check("a hod sees only their team's requests and their own",
      team.rows[0].n === 0, `${team.rows[0].n} outside the team`);
  });
}

console.log("\n=== Requests: who may decide ===");
{
  // Faizal raised a request of his own; he must not be able to approve it even
  // though he holds a reviewing role.
  // Must be one still open: a request already decided is out of everyone's
  // reach by policy, so the attempt would touch no rows and prove nothing.
  const own = await db.query(
    `select id from public.requests
      where requester_id = $1 and status in ('submitted', 'pending_approval')
      limit 1`, [uid.ks]);
  const ownId = own.rows[0].id;

  await asUser(AUTH_UID.ks, async () => {
    await expectError("a reviewer cannot approve their own request", () =>
      db.query(`update public.requests set status = 'approved' where id = $1`, [ownId]),
      "cannot be approved or rejected by the person who raised it");
  });

  const others = await db.query(
    `select id from public.requests where status = 'pending_approval' limit 1`);

  await asUser(AUTH_UID.staffRnd, async () => {
    // Two separate defences, and both are worth pinning down.
    //
    // First the policy: once a request has been decided, the USING clause stops
    // matching it, so an update touches no rows rather than raising.
    const settled = await db.query(
      `update public.requests set title = 'Reopened by the requester'
        where requester_id = $1 and status = 'approved' returning id`,
      [uid.staffRnd]);
    check("a decided request is out of its owner's reach",
      settled.rows.length === 0, `${settled.rows.length} rows changed`);

    // Then the trigger, on a request still inside the editable window: the row
    // is reachable, so the rule about status has to do the work.
    const fresh = await db.query(
      `insert into public.requests (requester_id, title, description, category, status)
       values ($1, 'Spare keyboard', 'The space bar sticks.', 'it_equipment', 'submitted')
       returning id`,
      [uid.staffRnd]);

    await expectError("a requester cannot move their own request past approval", () =>
      db.query(`update public.requests set status = 'completed' where id = $1`,
        [fresh.rows[0].id]),
      "may not move their request beyond approval");

    await expectError("a requester cannot approve their own request", () =>
      db.query(`update public.requests set status = 'approved' where id = $1`,
        [fresh.rows[0].id]),
      "cannot be approved or rejected by the person who raised it");
  });

  await asUser(AUTH_UID.hr, async () => {
    const target = others.rows[0]?.id ?? ownId;

    await db.query(
      `update public.requests set status = 'approved' where id = $1`, [target]);

    const row = await db.query(
      `select status, reviewed_by, reviewed_at from public.requests where id = $1`,
      [target]);
    check("hr can approve a request", row.rows[0].status === "approved");
    check("the decision stamps the reviewer automatically",
      row.rows[0].reviewed_by === uid.hr && row.rows[0].reviewed_at !== null,
      JSON.stringify(row.rows[0]));

    // A reviewer judges; they must not be able to rewrite what they judged.
    await db.query(
      `update public.requests set title = 'Rewritten by the reviewer' where id = $1`,
      [target]);
    const after = await db.query(
      `select title from public.requests where id = $1`, [target]);
    check("a reviewer cannot rewrite the request they are judging",
      after.rows[0].title !== "Rewritten by the reviewer", after.rows[0].title);
  });
}

console.log("\n=== Requests: rejection needs a reason ===");
{
  const pending = await db.query(
    `select id from public.requests where status = 'pending_approval' limit 1`);

  if (pending.rows.length > 0) {
    await asUser(AUTH_UID.hr, async () => {
      await expectError("rejecting without a comment is refused", () =>
        db.query(
          `update public.requests set status = 'rejected', review_comment = null where id = $1`,
          [pending.rows[0].id]),
        "requests_rejection_needs_comment");
    });
  } else {
    check("a pending request exists to reject", false, "none left in the seed");
  }
}

// ---------------------------------------------------------------------------
// The CEO reads the whole company and writes none of it. Hiding the buttons is
// not the guarantee — these checks go straight at the tables.
// ---------------------------------------------------------------------------

console.log("\n=== CEO: reads everything ===");
{
  // Counted as the table owner first: earlier blocks add rows, so a hardcoded
  // total would drift. What matters is that the CEO sees all of whatever exists.
  const { rows: totals } = await db.query(
    `select count(*)::int as n from public.requests`);
  const trueRequestCount = totals[0].n;

  await asUser(AUTH_UID.ceo, async () => {
    const people = await db.query(`select count(*)::int as n from public.profiles`);
    check("ceo sees the whole staff directory", people.rows[0].n === 8, `${people.rows[0].n}`);

    const subs = await db.query(
      `select count(distinct employee_id)::int as n from public.training_submissions`);
    check("ceo sees every employee's training",
      subs.rows[0].n === employeesWithRecords,
      `${subs.rows[0].n} of ${employeesWithRecords}`);

    const records = await db.query(`select count(*)::int as n from public.training_records`);
    check("ceo sees the training entries behind them", records.rows[0].n > 0);

    const reqs = await db.query(`select count(*)::int as n from public.requests`);
    check("ceo sees every request", reqs.rows[0].n === trueRequestCount,
      `${reqs.rows[0].n} of ${trueRequestCount}`);

    const comments = await db.query(`select count(*)::int as n from public.request_comments`);
    check("ceo sees request comments", comments.rows[0].n >= 3);

    const logs = await db.query(`select count(*)::int as n from public.automation_logs`);
    check("ceo can read the audit trail for reporting", logs.rows[0].n > 0);
  });
}

console.log("\n=== CEO: writes nothing ===");
{
  const anyOpenRequest = await db.query(
    `select id from public.requests
      where status in ('submitted', 'pending_approval') limit 1`);
  const anyPendingSubmission = await db.query(
    `select id from public.training_submissions
      where status = 'submitted_pending_hod' limit 1`);
  const anyRecord = await db.query(`select id from public.training_records limit 1`);

  await asUser(AUTH_UID.ceo, async () => {
    // Every one of these is silently filtered by policy rather than raising, so
    // each is asserted on rows affected. A write that changes nothing is the
    // outcome; a write that changes something is the bug.
    const opened = await db.query(
      `insert into public.training_submissions (employee_id, month, year, status)
       values ($1, 4, 2028, 'draft')
       on conflict do nothing returning id`,
      [uid.ceo]).catch(() => ({ rows: [] }));
    check("ceo cannot open a training month", opened.rows.length === 0,
      `${opened.rows.length} rows`);

    if (anyRecord.rows[0]) {
      const edited = await db.query(
        `update public.training_records set title = 'Rewritten by the CEO'
          where id = $1 returning id`, [anyRecord.rows[0].id]).catch(() => ({ rows: [] }));
      check("ceo cannot edit a training entry", edited.rows.length === 0,
        `${edited.rows.length} rows`);
    }

    if (anyPendingSubmission.rows[0]) {
      const verified = await db.query(
        `update public.training_submissions set status = 'hod_verified'
          where id = $1 returning id`,
        [anyPendingSubmission.rows[0].id]).catch(() => ({ rows: [] }));
      check("ceo cannot verify a submission", verified.rows.length === 0,
        `${verified.rows.length} rows`);
    }

    const raised = await db.query(
      `insert into public.requests (requester_id, title, description, category, status)
       values ($1, 'CEO raised this', 'Should not be possible.', 'other', 'submitted')
       returning id`, [uid.ceo]).catch(() => ({ rows: [] }));
    check("ceo cannot raise a request", raised.rows.length === 0, `${raised.rows.length} rows`);

    if (anyOpenRequest.rows[0]) {
      const decided = await db.query(
        `update public.requests set status = 'approved' where id = $1 returning id`,
        [anyOpenRequest.rows[0].id]).catch(() => ({ rows: [] }));
      check("ceo cannot approve a request", decided.rows.length === 0,
        `${decided.rows.length} rows`);

      const commented = await db.query(
        `insert into public.request_comments (request_id, author_id, body)
         values ($1, $2, 'CEO comment') returning id`,
        [anyOpenRequest.rows[0].id, uid.ceo]).catch(() => ({ rows: [] }));
      check("ceo cannot comment on a request", commented.rows.length === 0,
        `${commented.rows.length} rows`);
    }
  });

  // Nothing above may have left a mark.
  const ceoSubs = await db.query(
    `select count(*)::int as n from public.training_submissions where employee_id = $1`,
    [uid.ceo]);
  check("the ceo owns no training submissions at all", ceoSubs.rows[0].n === 0,
    `${ceoSubs.rows[0].n}`);

  const ceoReqs = await db.query(
    `select count(*)::int as n from public.requests where requester_id = $1`, [uid.ceo]);
  check("the ceo owns no requests at all", ceoReqs.rows[0].n === 0, `${ceoReqs.rows[0].n}`);

  const rewritten = await db.query(
    `select count(*)::int as n from public.training_records
      where title = 'Rewritten by the CEO'`);
  check("no training entry was rewritten", rewritten.rows[0].n === 0);
}

// Adding a person is three rows in two schemas, and a miss in any one of them
// produces an account that looks present and does not work. Runs last so the
// row counts asserted earlier are not disturbed.
console.log("\n=== create_user ===");
{
  const created = await db.query(
    `select * from public.create_user('Nur Batrisyia Binti Kamal', 'batrisyia@irs.com.my')`,
  );
  check("name and email alone create a person", created.rows.length === 1,
    JSON.stringify(created.rows[0]));

  const newId = created.rows[0]?.profile_id;
  check("the new profile id is an integer", Number.isInteger(newId), `got ${newId}`);

  const profile = await db.query(
    `select id, auth_user_id, email, full_name, role, is_active, date_joined
       from public.profiles where id = $1`, [newId]);
  check("the profile row is written", profile.rows.length === 1);
  check("it defaults to staff and active",
    profile.rows[0]?.role === "staff" && profile.rows[0]?.is_active === true);
  check("date_joined is filled rather than left null",
    profile.rows[0]?.date_joined !== null);

  const authUid = profile.rows[0]?.auth_user_id;

  const authRow = await db.query(
    `select email, email_confirmed_at, encrypted_password
       from auth.users where id = $1`, [authUid]);
  check("the credential row is written", authRow.rows.length === 1);
  check("the email is confirmed, so sign-in is not blocked",
    authRow.rows[0]?.email_confirmed_at !== null);
  check("a password hash is stored", Boolean(authRow.rows[0]?.encrypted_password));

  // The row most easily forgotten: GoTrue resolves an email/password sign-in
  // through auth.identities, so without it the account exists and cannot log in.
  const identity = await db.query(
    `select provider, provider_id from auth.identities where user_id = $1`, [authUid]);
  check("the provider link is written", identity.rows.length === 1);
  check("the identity is an email provider keyed by the auth uuid",
    identity.rows[0]?.provider === "email" &&
    identity.rows[0]?.provider_id === authUid);

  const logged = await db.query(
    `select related_table, related_id, is_system from public.automation_logs
      where action_type = 'profile.created' and related_id = $1`, [newId]);
  check("the creation is recorded in the audit trail",
    logged.rows.length === 1 && logged.rows[0].related_table === "profiles" &&
    logged.rows[0].is_system === true);

  // The point of the whole exercise: the person can actually be resolved the
  // way a request resolves them, uuid in the JWT through to the integer key.
  await asUser(authUid, async () => {
    const me = await db.query(`select public.current_user_id() as id`);
    check("the new account resolves through current_user_id()",
      me.rows[0].id === newId, `got ${me.rows[0].id}`);

    const visible = await db.query(
      `select count(*)::int as n from public.profiles p where p.id = $1`, [newId]);
    check("the new account can read its own profile under RLS",
      visible.rows[0].n === 1);
  });

  // Addresses are the natural key here, so they are normalised before storing.
  // '  Foo@IRS.COM.MY ' and 'foo@irs.com.my' must not become two people.
  const messy = await db.query(
    `select * from public.create_user('  Lim Wei Sheng  ', '  WeiSheng@IRS.COM.MY  ')`,
  );
  const stored = await db.query(
    `select email, full_name from public.profiles where id = $1`,
    [messy.rows[0].profile_id]);
  check("the email is lowercased and trimmed",
    stored.rows[0]?.email === "weisheng@irs.com.my", stored.rows[0]?.email);
  check("the name is trimmed", stored.rows[0]?.full_name === "Lim Wei Sheng");

  await expectError("a duplicate email is refused, not overwritten", () =>
    db.query(`select public.create_user('Someone Else', 'BATRISYIA@irs.com.my')`),
    "profile already exists");

  await expectError("an address that is not an email is refused", () =>
    db.query(`select public.create_user('No Address', 'not-an-email')`),
    "valid email address is required");

  await expectError("a blank name is refused", () =>
    db.query(`select public.create_user('   ', 'blank.name@irs.com.my')`),
    "full name is required");

  // A mistyped department would otherwise put the person in no department at
  // all, which reads as deliberate and is not.
  await expectError("an unknown department is refused", () =>
    db.query(
      `select public.create_user('Wrong Dept', 'wrong.dept@irs.com.my',
         p_department_name => 'Reserch and Development')`),
    "no department named");

  // Verification is matched on profiles.hod_id, so a staff member without one
  // has nobody who can verify their month. Naming a department fills it in.
  const withDept = await db.query(
    `select * from public.create_user('Tan Mei Ling', 'meiling@irs.com.my',
       p_role => 'staff', p_department_name => 'R&D',
       p_designation => 'Software Engineer')`);
  const placed = await db.query(
    `select p.department_id, p.hod_id, p.designation
       from public.profiles p where p.id = $1`, [withDept.rows[0].profile_id]);
  check("a named department is resolved to its id",
    placed.rows[0]?.department_id !== null);
  check("the reporting line is inherited from the head of that department",
    placed.rows[0]?.hod_id === uid.ks, `got ${placed.rows[0]?.hod_id}`);
  check("the designation is stored", placed.rows[0]?.designation === "Software Engineer");
  check("the returned row names the department and the reviewer",
    withDept.rows[0].department === "R&D" &&
    withDept.rows[0].reports_to === "Chng Kok Sheng",
    JSON.stringify(withDept.rows[0]));

  // And the HOD is verifiable in the direction that matters: the head of
  // department must now see this person as one of their team.
  await asUser(AUTH_UID.ks, async () => {
    const mine = await db.query(
      `select public.is_my_team_member($1) as ok`, [withDept.rows[0].profile_id]);
    check("the new hire shows up as a member of that HOD's team",
      mine.rows[0].ok === true);
  });

  const override = await db.query(
    `select * from public.create_user('Ravi Kumar', 'ravi@irs.com.my',
       p_role => 'staff', p_department_name => 'R&D',
       p_hod_email => 'joshua@irs.com.my')`);
  const overridden = await db.query(
    `select p.hod_id from public.profiles p where p.id = $1`,
    [override.rows[0].profile_id]);
  check("an explicit p_hod_email overrides the department's head",
    overridden.rows[0]?.hod_id === uid.joshua, `got ${overridden.rows[0]?.hod_id}`);

  // A failure must not leave a credential behind with no profile against it,
  // or the address is burnt: the retry then trips the orphaned-account check.
  const before = await db.query(`select count(*)::int as n from auth.users`);
  try {
    await db.query(
      `select public.create_user('Half Made', 'half.made@irs.com.my',
         p_department_name => 'Nowhere')`);
  } catch {
    // expected
  }
  const after = await db.query(`select count(*)::int as n from auth.users`);
  check("a rejected call leaves no half-made account behind",
    after.rows[0].n === before.rows[0].n,
    `${before.rows[0].n} -> ${after.rows[0].n}`);

  const retry = await db.query(
    `select * from public.create_user('Half Made', 'half.made@irs.com.my')`);
  check("and the address is still free to use afterwards",
    Number.isInteger(retry.rows[0]?.profile_id));

  // Ids must keep counting, not jump, after all of the above.
  const span = await db.query(
    `select min(id)::int as lo, max(id)::int as hi, count(*)::int as n
       from public.profiles`);
  check("profile ids still count 1..n after every insert and rejection",
    span.rows[0].lo === 1 && span.rows[0].hi === span.rows[0].n,
    `lo=${span.rows[0].lo} hi=${span.rows[0].hi} n=${span.rows[0].n}`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
await db.close();
process.exit(failures === 0 ? 0 : 1);

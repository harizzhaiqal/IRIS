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
async function asUser(userId, fn) {
  await db.exec(`select set_config('iris.user_id', '${userId}', false);`);
  await db.exec(`set role authenticated;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
    await db.exec(`select set_config('iris.user_id', '', false);`);
  }
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

  create function public.uuid_generate_v4() returns uuid language sql as $$
    select gen_random_uuid();
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

// RLS is bypassed for the table owner, so force it for the test.
//
// Deliberately no GRANT here: the migration is expected to issue its own. It
// once did not, relying on Supabase's schema default privileges, and a grant in
// this block hid that for every test below.
await db.exec(`
  alter table public.users force row level security;
  alter table public.training_submissions force row level security;
  alter table public.training_records force row level security;
  alter table public.training_attachments force row level security;
  alter table public.automation_logs force row level security;
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

console.log("\n=== Seed shape ===");
{
  const roles = await db.query(
    `select role, count(*)::int as n from public.users group by role order by role`,
  );
  const byRole = Object.fromEntries(roles.rows.map((r) => [r.role, r.n]));
  check("1 hr_admin, 2 hods, 8 staff", byRole.hr_admin === 1 && byRole.hod === 2 && byRole.staff === 8,
    JSON.stringify(byRole));

  const depts = await db.query(`select count(*)::int as n from public.departments`);
  check("3 departments", depts.rows[0].n === 3, `got ${depts.rows[0].n}`);

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
  check("auth accounts created", users.rows[0].n === 11, `got ${users.rows[0].n}`);

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

const STAFF_AIMAN = "44444444-4444-4444-4444-444444444444";
const STAFF_PREETHA = "55555555-5555-5555-5555-555555555555";
const HOD_FAIZAL = "22222222-2222-2222-2222-222222222222";
const HOD_SHARON = "33333333-3333-3333-3333-333333333333";
const HR_AINA = "11111111-1111-1111-1111-111111111111";

console.log("\n=== RLS: row visibility ===");
{
  await asUser(STAFF_AIMAN, async () => {
    const own = await db.query(
      `select count(*)::int as n from public.training_submissions where employee_id = $1`,
      [STAFF_AIMAN]);
    check("staff sees their own submissions", own.rows[0].n > 0, `got ${own.rows[0].n}`);

    const others = await db.query(
      `select count(*)::int as n from public.training_submissions where employee_id = $1`,
      [STAFF_PREETHA]);
    check("staff sees nothing of a colleague's submissions", others.rows[0].n === 0,
      `got ${others.rows[0].n}`);

    const otherRecords = await db.query(`
      select count(*)::int as n from public.training_records r
       join public.training_submissions s on s.id = r.submission_id
       where s.employee_id = $1`, [STAFF_PREETHA]);
    check("staff sees none of a colleague's training records", otherRecords.rows[0].n === 0);

    const logs = await db.query(`select count(*)::int as n from public.automation_logs`);
    check("staff cannot read the audit trail", logs.rows[0].n === 0, `got ${logs.rows[0].n}`);
  });

  await asUser(HOD_FAIZAL, async () => {
    const team = await db.query(
      `select count(*)::int as n from public.training_submissions where employee_id = $1`,
      [STAFF_AIMAN]);
    check("hod sees a team member's submissions", team.rows[0].n > 0);

    const outside = await db.query(
      `select count(*)::int as n from public.training_submissions
        where employee_id = '88888888-8888-8888-8888-888888888888'`);
    check("hod sees nothing outside their team", outside.rows[0].n === 0,
      `got ${outside.rows[0].n}`);
  });

  await asUser(HR_AINA, async () => {
    const all = await db.query(
      `select count(distinct employee_id)::int as n from public.training_submissions`);
    check("hr sees every employee", all.rows[0].n === 11, `got ${all.rows[0].n}`);

    const logs = await db.query(`select count(*)::int as n from public.automation_logs`);
    check("hr can read the audit trail", logs.rows[0].n > 0);
  });
}

console.log("\n=== RLS: editing windows ===");
{
  const draft = await db.query(`
    select id from public.training_submissions
     where employee_id = $1 and status = 'draft' limit 1`, [STAFF_AIMAN]);
  const approved = await db.query(`
    select id from public.training_submissions
     where employee_id = $1 and status = 'approved' limit 1`, [STAFF_AIMAN]);

  await asUser(STAFF_AIMAN, async () => {
    if (draft.rows[0]) {
      const res = await db.query(
        `insert into public.training_records
           (submission_id, seq_no, title, start_datetime, end_datetime, calculated_minutes, recorded_minutes)
         values ($1, 50, 'Allowed while draft', '2026-07-06 09:00+00', '2026-07-06 12:00+00', 180, 180)
         returning id`, [draft.rows[0].id]);
      check("staff may add entries to a draft month", res.rows.length === 1);
    }

    await expectError("staff may not add entries to an approved month", () =>
      db.query(
        `insert into public.training_records
           (submission_id, seq_no, title, start_datetime, end_datetime, calculated_minutes, recorded_minutes)
         values ($1, 51, 'Blocked', '2026-01-06 09:00+00', '2026-01-06 12:00+00', 180, 180)`,
        [approved.rows[0].id]),
      "row-level security");

    await expectError("staff cannot approve their own month", () =>
      db.query(
        `update public.training_submissions set status = 'approved' where id = $1`,
        [draft.rows[0].id]),
      "only move a submission to submitted_pending_hod");
  });
}

console.log("\n=== Two-stage verification ===");
{
  const res = await db.query(`
    select id from public.training_submissions
     where employee_id = $1 and status = 'draft' limit 1`, [STAFF_AIMAN]);
  const subId = res.rows[0].id;

  // Staff submits.
  await asUser(STAFF_AIMAN, async () => {
    await db.query(
      `update public.training_submissions
          set status = 'submitted_pending_hod', submitted_at = now() where id = $1`, [subId]);
  });
  let row = await db.query(`select status from public.training_submissions where id = $1`, [subId]);
  check("staff can submit", row.rows[0].status === "submitted_pending_hod");

  // HR cannot skip the HOD stage.
  await asUser(HR_AINA, async () => {
    await expectError("hr cannot approve before the hod stage", () =>
      db.query(`update public.training_submissions set status = 'approved' where id = $1`, [subId]),
      "only a hod-verified submission");
  });

  // A HOD outside the team cannot act. RLS filters the row out rather than
  // raising, so the update must simply touch nothing.
  await asUser(HOD_SHARON, async () => {
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
  await asUser(HOD_FAIZAL, async () => {
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
    row.rows[0].hod_verified_by === HOD_FAIZAL &&
    row.rows[0].hod_verified_at !== null);

  // Staff revises and resubmits.
  await asUser(STAFF_AIMAN, async () => {
    await db.query(
      `update public.training_submissions set status = 'submitted_pending_hod' where id = $1`, [subId]);
  });
  row = await db.query(`select status from public.training_submissions where id = $1`, [subId]);
  check("a returned month reopens and can be resubmitted",
    row.rows[0].status === "submitted_pending_hod");

  // HOD verifies.
  await asUser(HOD_FAIZAL, async () => {
    await db.query(
      `update public.training_submissions
          set status = 'hod_verified', hod_comment = null where id = $1`, [subId]);
  });

  // HR approves.
  await asUser(HR_AINA, async () => {
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
    row.rows[0].hr_verified_by === HR_AINA &&
    row.rows[0].hr_verified_at !== null);

  await asUser(HR_AINA, async () => {
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

  await asUser(employee_id, async () => {
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
  await asUser(STAFF_AIMAN, async () => {
    await expectError("staff cannot promote themselves", () =>
      db.query(`update public.users set role = 'hr_admin' where id = $1`, [STAFF_AIMAN]),
      "only hr can change role");

    await expectError("staff cannot reassign their reporting line", () =>
      db.query(`update public.users set hod_id = null where id = $1`, [STAFF_AIMAN]),
      "only hr can change role");

    const res = await db.query(
      `update public.users set designation = 'Principal Engineer' where id = $1 returning designation`,
      [STAFF_AIMAN]);
    check("staff may still edit their own designation", res.rows[0]?.designation === "Principal Engineer");
  });
}

// The "add training" path end to end: open a month that does not exist yet,
// then write an entry into it and confirm the total follows. This is the flow
// that reported "Could not open this month for editing".
console.log("\n=== Add training, start to finish ===");
{
  await asUser(STAFF_AIMAN, async () => {
    const opened = await db.query(
      `insert into public.training_submissions (employee_id, month, year, status)
       values ($1, 3, 2027, 'draft') returning id`,
      [STAFF_AIMAN],
    );
    check("staff can open a month that does not exist yet", opened.rows.length === 1);

    const submissionId = opened.rows[0].id;

    // A month the employee just opened must be readable back, or the action
    // cannot tell an existing month from a missing one.
    const readBack = await db.query(
      `select id from public.training_submissions where employee_id = $1 and month = 3 and year = 2027`,
      [STAFF_AIMAN],
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

console.log(`\n${checks - failures}/${checks} checks passed`);
await db.close();
process.exit(failures === 0 ? 0 : 1);

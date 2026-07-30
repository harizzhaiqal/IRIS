// Proves supabase/repair.sql does what it claims: fixes a database whose
// functions and policies have drifted, without losing a single row.
//
// The break it simulates is the real one — renaming a table in the Supabase
// dashboard. Postgres stores function bodies as text and never rewrites them,
// so every security-definer helper keeps pointing at the old name and the RLS
// policies that call them start throwing.

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const strip = (sql) => sql.replace(/create extension[^;]*;/gi, "");
const db = new PGlite();

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

process.on("unhandledRejection", (error) => {
  console.error(`\nFAILED: ${error?.message ?? error}`);
  process.exit(1);
});

console.log("\n=== Platform stubs ===");
await db.exec(`
  create schema if not exists auth;
  create schema if not exists extensions;
  create schema if not exists storage;
  create table auth.users (
    instance_id uuid, id uuid primary key, aud text, role text, email text,
    encrypted_password text, email_confirmed_at timestamptz,
    created_at timestamptz, updated_at timestamptz,
    confirmation_token text, email_change text,
    email_change_token_new text, recovery_token text,
    raw_app_meta_data jsonb, raw_user_meta_data jsonb
  );
  create table auth.identities (
    id uuid primary key, user_id uuid references auth.users(id),
    identity_data jsonb, provider text, provider_id text,
    last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz,
    unique (provider, provider_id)
  );
  create function auth.uid() returns uuid language sql stable as $fn$
    select nullif(current_setting('iris.user_id', true), '')::uuid; $fn$;
  create function extensions.crypt(text, text) returns text language sql as $fn$
    select $1 || $2; $fn$;
  create function extensions.gen_salt(text) returns text language sql as $fn$
    select 'salt'; $fn$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text, name text, owner uuid
  );
  create function storage.foldername(text) returns text[] language sql as $fn$
    select string_to_array($1, '/'); $fn$;
  create role anon; create role authenticated; create role service_role;
  grant usage on schema public, storage to anon, authenticated, service_role;
`);
console.log("  stubs installed");

console.log("\n=== Build a healthy database ===");
await db.exec(strip(read("supabase/migrations/20260728090000_initial_schema.sql")));
await db.exec(strip(read("supabase/migrations/20260728090100_rls_policies.sql")));
await db.exec(strip(read("supabase/seed.sql")));
console.log("  migrations and seed applied");

// Data the user typed in, which must survive the repair.
const aiman = await db.query(
  `select id, auth_user_id from public.users where email = 'aiman@irssoftware.test'`,
);
const uid = aiman.rows[0].id;
const authUid = aiman.rows[0].auth_user_id;

const sub = await db.query(
  `insert into public.training_submissions (employee_id, month, year, status)
   values ($1, 11, 2027, 'draft') returning id`,
  [uid],
);
await db.query(
  `insert into public.training_records
     (submission_id, seq_no, title, start_datetime, end_datetime,
      calculated_minutes, recorded_minutes, effectiveness)
   values ($1, 1, 'Precious hand-typed entry', '2027-11-03T09:00:00Z',
           '2027-11-03T17:00:00Z', 480, 480, 'effective')`,
  [sub.rows[0].id],
);

const before = await db.query(`
  select
    (select count(*)::int from public.users) as users,
    (select count(*)::int from public.training_submissions) as submissions,
    (select count(*)::int from public.training_records) as records
`);
console.log(`  baseline: ${JSON.stringify(before.rows[0])}`);

console.log("\n=== Break it the way a dashboard rename does ===");
// The real sequence, because Postgres validates a LANGUAGE SQL body when the
// function is created: the helpers have to be written while the old table name
// still exists, and only then does the rename strand them.
await db.exec(`alter table public.users rename to profiles;`);

await db.exec(`
  create or replace function public.current_user_role()
  returns public.user_role language sql stable security definer
  set search_path = public as $fn$
    select role from public.profiles where auth_user_id = auth.uid();
  $fn$;

  create or replace function public.is_hr_admin()
  returns boolean language sql stable security definer
  set search_path = public as $fn$
    select exists (select 1 from public.profiles
                    where auth_user_id = auth.uid() and role = 'hr_admin');
  $fn$;
`);

// The dashboard's rename button. The table is now correctly called users; the
// two functions above still say profiles, and nothing rewrote them.
await db.exec(`alter table public.profiles rename to users;`);

// A policy lost along the way, as happens when tables are edited by hand.
await db.exec(`drop policy if exists users_select_authenticated on public.users;`);

async function readOwnProfile() {
  await db.exec(`select set_config('iris.user_id', '${authUid}', false);`);
  await db.exec(`set role authenticated;`);
  try {
    const r = await db.query(`select id from public.users where auth_user_id = $1`, [authUid]);
    return { ok: true, rows: r.rows.length };
  } catch (e) {
    return { ok: false, message: e.message };
  } finally {
    await db.exec(`reset role;`);
  }
}

const broken = await readOwnProfile();
check(
  "the break reproduces the reported failure",
  !broken.ok && /public\.profiles.*does not exist/.test(broken.message),
  broken.ok ? "query unexpectedly succeeded" : broken.message,
);

console.log("\n=== Run repair.sql ===");
await db.exec(strip(read("supabase/repair.sql")));
console.log("  applied without error");

const fixed = await readOwnProfile();
check("reads work again after the repair", fixed.ok && fixed.rows === 1,
  fixed.ok ? `${fixed.rows} rows` : fixed.message);

const after = await db.query(`
  select
    (select count(*)::int from public.users) as users,
    (select count(*)::int from public.training_submissions) as submissions,
    (select count(*)::int from public.training_records) as records
`);
check("not one row was lost",
  JSON.stringify(before.rows[0]) === JSON.stringify(after.rows[0]),
  `${JSON.stringify(before.rows[0])} vs ${JSON.stringify(after.rows[0])}`);

const kept = await db.query(
  `select title from public.training_records where title = 'Precious hand-typed entry'`,
);
check("the hand-typed entry is still there", kept.rows.length === 1);

const policy = await db.query(`
  select count(*)::int as n from pg_policies
   where schemaname = 'public' and tablename = 'users'
     and policyname = 'users_select_authenticated'
`);
check("the dropped policy was restored", policy.rows[0].n === 1);

// Running it twice must be as safe as running it once.
console.log("\n=== Run it a second time ===");
await db.exec(strip(read("supabase/repair.sql")));
const twice = await db.query(`
  select
    (select count(*)::int from public.users) as users,
    (select count(*)::int from public.training_submissions) as submissions,
    (select count(*)::int from public.training_records) as records
`);
check("a second run is still non-destructive",
  JSON.stringify(before.rows[0]) === JSON.stringify(twice.rows[0]),
  JSON.stringify(twice.rows[0]));

const dupes = await db.query(`
  select policyname, count(*)::int as n from pg_policies
   where schemaname = 'public' group by policyname having count(*) > 1
`);
check("no duplicate policies after two runs", dupes.rows.length === 0,
  JSON.stringify(dupes.rows));

// The generator once dropped four policies silently, because a semicolon inside
// a prose comment split them away from their own CREATE. Nothing failed; they
// were simply absent. Counting them against the migrations catches that class
// of bug directly rather than relying on a test happening to exercise one.
console.log("\n=== repair.sql covers the migrations ===");
{
  const migrations =
    read("supabase/migrations/20260728090000_initial_schema.sql") +
    read("supabase/migrations/20260728090100_rls_policies.sql");
  const repair = read("supabase/repair.sql");

  const count = (text, pattern) => (text.match(pattern) ?? []).length;

  const kinds = [
    ["policies", /^create\s+policy\s/gim],
    ["functions", /^create\s+or\s+replace\s+function\s/gim],
    ["triggers", /^create\s+trigger\s/gim],
  ];

  for (const [label, pattern] of kinds) {
    const inMigrations = count(migrations, pattern);
    const inRepair = count(repair, pattern);
    check(`every one of the ${inMigrations} ${label} is in repair.sql`,
      inMigrations > 0 && inMigrations === inRepair,
      `migrations ${inMigrations}, repair ${inRepair}`);
  }

  // Each policy and trigger must be preceded by its own DROP, or a second run
  // fails on "already exists".
  check("every policy is dropped before it is created",
    count(repair, /^create\s+policy\s/gim) === count(repair, /^drop\s+policy\s+if\s+exists\s/gim));
  check("every trigger is dropped before it is created",
    count(repair, /^create\s+trigger\s/gim) === count(repair, /^drop\s+trigger\s+if\s+exists\s/gim));

  // The whole promise of the file.
  check("repair.sql creates no tables and writes no application rows",
    !/^\s*(create\s+table|drop\s+schema|create\s+type|insert\s+into\s+public\.)/im.test(repair));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);

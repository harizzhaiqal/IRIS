// Runs supabase/setup.sql end to end against PGlite, twice, to prove that the
// single-paste hosted-Supabase bundle applies cleanly and is safe to re-run.
//
// This checks the bundle mechanics — schema drop, extension pinning, demo
// account reset, idempotency. The behavioural guarantees (triggers, RLS, the
// approval lifecycle) are covered by verify-sql.mjs.

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

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
  if (error?.internalQuery) console.error(`in: ${error.internalQuery.slice(0, 400)}`);
  process.exit(1);
});

// PGlite has neither uuid-ossp nor pgcrypto, and no auth schema. Supabase
// supplies all three; stub them so the bundle can be exercised locally.
console.log("\n=== Platform stubs ===");
await db.exec(`
  create schema if not exists auth;
  create schema if not exists extensions;
  create schema if not exists storage;

  create table auth.users (
    instance_id uuid, id uuid primary key,
    aud text, role text, email text, encrypted_password text,
    email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz,
    confirmation_token text, email_change text,
    email_change_token_new text, recovery_token text,
    raw_app_meta_data jsonb, raw_user_meta_data jsonb
  );
  create table auth.identities (
    id uuid primary key,
    user_id uuid references auth.users(id),
    identity_data jsonb, provider text, provider_id text,
    last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz,
    unique (provider, provider_id)
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('iris.user_id', true), '')::uuid;
  $$;

  create function extensions.uuid_generate_v4() returns uuid language sql as $$
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

  create role anon;
  create role authenticated;
  create role service_role;
`);
console.log("  stubs installed");

// CREATE EXTENSION is unavailable in PGlite; the stubs above stand in for what
// those two extensions would provide.
const rawBundle = read("supabase/setup.sql");
const bundle = rawBundle.replace(/create extension[^;]*;/gi, "");

// Static guard, because execution here cannot catch this. PGlite runs the whole
// bundle in one session, so a temporary table always resolves; the Supabase SQL
// Editor does not promise one session across a script, where the same table
// disappears mid-run. A real setup.sql failed this way after passing every
// executed check below.
console.log("\n=== Static checks ===");
const tempTables = [...rawBundle.matchAll(/create\s+(temporary|temp)\s+table\s+(\w+)/gi)];
check(
  "no temporary tables — they do not survive the SQL Editor",
  tempTables.length === 0,
  tempTables.map((m) => m[2]).join(", "),
);

async function applyBundle(label) {
  console.log(`\n=== ${label} ===`);
  try {
    await db.exec(bundle);
  } catch (error) {
    // PGlite dumps its entire WASM bundle into the stack; keep this readable.
    console.log(`  FAIL  bundle did not apply — ${error.message}`);
    if (error.internalQuery) {
      console.log(`  in: ${error.internalQuery.slice(0, 300)}`);
    }
    process.exit(1);
  }
  console.log("  applied without error");

  const counts = {};
  for (const table of [
    "profiles",
    "departments",
    "training_submissions",
    "training_records",
  ]) {
    const { rows } = await db.query(`select count(*)::int as n from public.${table}`);
    counts[table] = rows[0].n;
  }
  const { rows: users } = await db.query(
    `select count(*)::int as n from auth.users where email like '%@irssoftware.test'`,
  );
  counts.auth_users = users[0].n;
  return counts;
}

const first = await applyBundle("First run (fresh database)");

check("11 profiles seeded", first.profiles === 11, `got ${first.profiles}`);
check("3 departments seeded", first.departments === 3, `got ${first.departments}`);
check("submissions seeded", first.training_submissions > 50, `got ${first.training_submissions}`);
check("training entries seeded", first.training_records > 100, `got ${first.training_records}`);
check("11 auth accounts created", first.auth_users === 11, `got ${first.auth_users}`);

const second = await applyBundle("Second run (re-run over existing data)");

check(
  "re-run leaves identical row counts",
  JSON.stringify(first) === JSON.stringify(second),
  `${JSON.stringify(first)} vs ${JSON.stringify(second)}`,
);

// A duplicated auth account would break sign-in, so verify emails stay unique.
const { rows: dupes } = await db.query(`
  select email, count(*)::int as n from auth.users
  where email like '%@irssoftware.test' group by email having count(*) > 1
`);
check("no duplicate demo accounts after re-run", dupes.length === 0, JSON.stringify(dupes));

// The whole point of pinning extensions: they must survive the schema drop.
const { rows: ext } = await db.query(`
  select count(*)::int as n from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'extensions' and p.proname = 'crypt'
`);
check("extensions schema survives the public drop", ext[0].n === 1);

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);

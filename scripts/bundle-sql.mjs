// Concatenates the migrations and seed into supabase/setup.sql — a single file
// you can paste into the Supabase SQL Editor for a hosted project.
//
// Edit the migrations or seed, then re-run: npm run sql:bundle

import { readFileSync, writeFileSync } from "node:fs";

const SOURCES = [
  "supabase/migrations/20260728090000_initial_schema.sql",
  "supabase/migrations/20260728090100_rls_policies.sql",
  "supabase/migrations/20260730120000_requests.sql",
  "supabase/seed.sql",
];

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const header = `-- ===========================================================================
-- IRIS — complete setup for a hosted Supabase project.
--
-- Paste this whole file into the Supabase SQL Editor and press Run. It creates
-- the schema, the RLS policies, and the demo data in one pass.
--
-- GENERATED FILE — do not edit. Edit the sources listed below, then run:
--   npm run sql:bundle
--
-- Re-running is safe: the public schema is dropped and rebuilt, so every run
-- yields a clean demo database. That also DELETES any data you have added.
-- ===========================================================================

drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres;

-- Pinned to the extensions schema so the drop above can never take it with it.
-- Supabase preinstalls pgcrypto, making this a no-op on a fresh project. The
-- seed needs it for crypt() and gen_salt(); nothing needs uuid-ossp any more,
-- because every key in the schema is a generated integer.
create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

-- Storage policies sit in the storage schema, so the drop above leaves them
-- behind. Clear them by naming convention, which keeps working as policies are
-- added, so long as they stay prefixed training_attachments.
do $bundle$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'training_attachments%'
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end
$bundle$;

-- The seed recreates the demo accounts; clear any previous run's first.
-- Identities go first: they hold a foreign key to auth.users. They are matched
-- through that key rather than provider_id, which stores the user's uuid.
delete from auth.identities
where user_id in (select id from auth.users where email like '%@irs.com.my');

delete from auth.users where email like '%@irs.com.my';
`;

const body = SOURCES.map(
  (f) =>
    `\n\n-- ===========================================================================\n` +
    `-- SOURCE: ${f}\n` +
    `-- ===========================================================================\n\n` +
    read(f),
).join("");

writeFileSync(new URL("../supabase/setup.sql", import.meta.url), header + body);
console.log(`supabase/setup.sql written from ${SOURCES.length} sources`);

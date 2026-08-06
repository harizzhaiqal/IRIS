// Concatenates the migrations and seed into supabase/setup.sql — a single file
// you can paste into the Supabase SQL Editor for a hosted project.
//
// Edit the migrations or seed, then re-run: npm run sql:bundle

import { readFileSync, writeFileSync } from "node:fs";

const SOURCES = [
  "supabase/migrations/20260728090000_initial_schema.sql",
  "supabase/migrations/20260728090100_rls_policies.sql",
  "supabase/migrations/20260730120000_requests.sql",
  "supabase/migrations/20260804000000_create_user.sql",
  "supabase/migrations/20260804120000_reminders.sql",
  "supabase/migrations/20260806000000_ai_media_library.sql",
  "supabase/migrations/20260806010000_ai_media_upload_limits.sql",
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

-- Every sign-in account is removed, not just the ones matching a name pattern.
--
-- This file rebuilds the whole public schema, and the seed below is the only
-- thing that creates accounts, so anything already in auth.users is from a
-- previous roster. Filtering by email domain missed accounts from before a
-- rename and left people unable to sign in with the address their profile
-- advertised.
--
-- If you have created an account by hand that the seed does not know about, it
-- goes too. Identities first: they hold a foreign key to auth.users.
delete from auth.identities;
delete from auth.users;
`;

const footer = `

-- ===========================================================================
-- Remove auth accounts left over from an earlier roster.
--
-- The rebuild above dropped public.profiles and the seed has just recreated
-- exactly the accounts that belong, so anything still in auth.users without a
-- profile is from a previous run under a different name or email domain.
--
-- This matters beyond tidiness: auth.users belongs to Supabase Auth and knows
-- nothing about profiles, so an orphan can still sign in. The app then finds no
-- profile, sends the user back to the login page, middleware sends them on to
-- the dashboard, and they loop on a blank screen.
--
-- Matching on a list of old email domains would need editing every time the
-- roster changes. "Has no profile" needs editing never.
-- ===========================================================================

delete from auth.identities
where user_id in (
  select a.id
    from auth.users a
    left join public.profiles u on u.auth_user_id = a.id
   where u.id is null
);

delete from auth.users as a
where not exists (
  select 1 from public.profiles u where u.auth_user_id = a.id
);
`;

const body = SOURCES.map(
  (f) =>
    `\n\n-- ===========================================================================\n` +
    `-- SOURCE: ${f}\n` +
    `-- ===========================================================================\n\n` +
    read(f),
).join("");

writeFileSync(
  new URL("../supabase/setup.sql", import.meta.url),
  header + body + footer,
);
console.log(`supabase/setup.sql written from ${SOURCES.length} sources`);

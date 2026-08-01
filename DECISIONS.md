# Decisions

Ambiguities resolved during the build, with the reasoning behind each choice.

## Scaffold and tooling

**Next.js pinned to 14.2.33 rather than 15.x.** The brief asked for "Next.js 14+ App Router". 14.2.33 is the final 14.x patch and keeps the synchronous `cookies()` / `params` API, which avoids the async-dynamic-API migration that 15 forces. Upgrading later is a contained change.

**shadcn/ui components written directly into `components/ui/` instead of running the `shadcn` CLI.** The CLI defaults to Tailwind v4 conventions and rewrites `globals.css`; the project is on Tailwind v3.4. The generated files are the same source either way, so they are committed directly and `components.json` is present so the CLI can still add components later.

**Two extra semantic colours (`success`, `warning`) added to the Tailwind theme.** The status lifecycle has six states that need visually distinct badges, and the stock shadcn palette only ships `default`/`secondary`/`destructive`/`outline`.

**npm cache redirected to `C:\npm-cache-iris` during setup.** The Windows account name contains an `&`, which breaks the `cmd` shims npx generates under the default cache path. This affects local tooling only, not the app.

**Dev-only npm audit advisories accepted.** All 16 high-severity advisories trace to `brace-expansion` via the ESLint dependency tree. Fixing them requires ESLint 10, which `eslint-config-next@14` does not support. Nothing ships to the runtime bundle.

**Vitest for unit tests.** The brief requires tests for the two pure utility modules only. Vitest needs no extra config to run TypeScript and is faster to boot than Jest for that scope.

**Zod v4 and `lucide-react` v1.** Both are the current majors at install time and are API-compatible with the usage here.

## Database

**`database.types.ts` is hand-written in the generator's output shape rather than generated.** This machine has neither Docker nor a local Postgres, so `supabase start` and `supabase gen types` cannot run here. The file mirrors the migrations exactly, including the `Relationships` metadata that supabase-js needs to type nested selects. Regenerate it with `npm run types:generate` on a machine with Docker to confirm; the checked-in file should be byte-comparable apart from formatting.

**Column-level permissions are enforced by a trigger, not by RLS.** RLS grants access to rows, not columns, and `GRANT UPDATE (col)` applies to a database role — but staff, HODs, and HR all authenticate as `authenticated`, so column grants cannot separate them. `enforce_submission_update_rules` is therefore the component that actually implements "a HOD may update only the HOD verification fields". It also validates the status transitions and requires a comment on return and reject, so those rules hold even if a client bypasses the UI.

**`total_minutes` is recomputed on every submission update, in addition to the required trigger on `training_records`.** The record-level trigger propagates entry changes as specified. The recompute inside the before-update trigger is what makes the column tamper-proof: a client that writes a total directly gets it silently replaced by the true sum.

**Profiles are readable by every signed-in user.** Verification trails and reviewer names need to resolve arbitrary profile ids, and a per-row rule for "profiles you might see the name of" ends up equivalent to open reads. Names, designations, and departments are internal directory data. All writes remain restricted, and a `guard_profile_privileged_fields` trigger stops a user editing their own role, department, reporting line, or active flag through the self-update policy.

**Storage paths are `<employee_id>/<training_record_id>/<filename>`.** Putting the owner's id in the first path segment lets the storage policies authorize on a prefix comparison, with no join back to the training tables. Files are uploaded from the browser directly to Storage after the entry is saved, so the record id is known and file bytes never pass through a server action.

**Overrides require a reason at the database level.** A check constraint rejects any record whose `recorded_minutes` differs from `calculated_minutes` without an `override_reason`. The brief asks for the reason in the UI; making it a constraint means the reviewer is never shown an unexplained discrepancy.

**Signup is disabled in `config.toml`.** HR creates staff accounts; there is no self-registration route in the brief.

**SQL is verified with PGlite (`npm run test:sql`) instead of a local Supabase stack.** With no Docker available, the alternative was shipping unexecuted SQL. `supabase/tests/verify-sql.mjs` applies both migrations and the seed to a real Postgres compiled to WebAssembly, then asserts the trigger behaviour, the constraints, RLS isolation between employees, and the whole submit → return → resubmit → verify → approve lifecycle. It stubs the parts Supabase provides rather than these migrations — the `auth` and `storage` schemas, `auth.uid()`, and pgcrypto — and skips `CREATE EXTENSION`, so it validates the project's own SQL, not the platform's. It found two real defects: an uncast UUID literal in the seed, and confirmed that a HOD acting outside their team is filtered out by RLS rather than raising, which is the intended outcome.

## Seed data

**The two HODs are each other's HOD.** A HOD files their own monthly record as a staff member, and that record still needs a HOD verification stage before HR sees it. Pointing them at HR instead would not work: the verification trigger requires the HOD stage to be performed by someone with the `hod` role.

**Support has no HOD of its own.** The brief specifies three departments but only two HODs, so Sharon heads both Sales and Support. Faizal heads Software Development.

**Two years of data: 2025 in full, 2026 through July.** A single year could not show both a complete annual compliance figure and a realistic in-flight current month. 2025 gives settled year-end totals; 2026 carries the live states — July holds drafts and both pending stages, June is past its 10 July deadline so unfinished months there read as overdue, and two people have not opened July at all.

**Monthly volumes are generated from a per-person base with a deterministic variance**, ranging from roughly 135 to 330 minutes a month. This puts some employees comfortably past the 48-hour standard and others below the 36-hour threshold, so the compliance dashboard shows a real distribution rather than a flat line.

## Workflow gaps found while building

**A nil return can be withdrawn while the month is still editable.** The brief describes declaring a nil return but not undoing one. Without it, a HOD returning a nil return left the employee stuck: they could not add the entries they had just been asked for, and the error message pointed at an action that did not exist. `withdrawNilReturn` closes that loop, and the submit button accepts a nil return so a returned one can be resubmitted as-is.

**A reviewer can never act on their own submission**, checked in the verification panel as well as the database. A HOD's own record is verified by the other HOD; HR's own record is verified by a HOD and then, unavoidably, approved by HR. That last step is a real segregation-of-duties gap in a single-HR-admin company and is flagged here rather than silently accepted — a second HR admin, or an explicit exception, is the fix.

**Overdue on the HR dashboard is measured against the previous month**, not the current one. The current month's deadline is the 10th of the *next* month, so it is almost never overdue yet, and counting it would report zero forever.

## Setup path

**Hosted Supabase is the documented default; the Docker stack is optional.** The local CLI stack boots roughly ten containers — Postgres, GoTrue, PostgREST, Storage, Realtime, Kong, Studio — because Supabase is a platform rather than a database, and IRIS depends on the auth, data-API, and storage layers, so plain Postgres would not substitute. Requiring Docker to see the app run is a heavy prerequisite for a demo machine that does not have it. The hosted free tier provides the same containers on Supabase's hardware, needs no install, and yields a deployable URL.

**`supabase/setup.sql` bundles both migrations and the seed into a single paste.** Running three files in the right order through the SQL Editor is the step most likely to go wrong under demo pressure. `scripts/bundle-sql.mjs` concatenates them behind a header that drops and rebuilds the `public` schema, so the file is re-runnable and a botched run can simply be repeated. The migrations remain the source of truth; `setup.sql` is generated and marked as such.

**The bundle header owns re-runnability, not the migrations.** Migrations stay conventional run-once DDL. The header additionally pins `pgcrypto` to the `extensions` schema so the `public` drop cannot take it — `uuid-ossp` was pinned there too until integer keys removed the need for it — and clears the storage policies, which live in the `storage` schema and so survive that drop. Storage policies are dropped by name prefix in a `DO` block rather than listed individually, so adding one does not silently break the re-run.

**`npm run test:bundle` applies `setup.sql` twice against PGlite.** Writing the file was not evidence it worked: the first run surfaced two real defects. Demo identities were being deleted by `provider_id`, which stores the user's uuid rather than their email, so the delete matched nothing and the follow-up delete of `auth.users` hit a foreign key. The storage policies then collided on recreation. Both were found only by executing it.

**The seed builds its generator table as a real table, not a temporary one.** `seed_people` was originally `create temporary table`, which works under psql and under the PGlite harness because both run the script in a single session. The Supabase SQL Editor makes no such promise, and the table disappeared before the `DO` block that reads it — `relation "seed_people" does not exist`, roughly a thousand lines into the paste. It is now `public.seed_people`, still dropped at the end of the seed, so nothing is left behind on any path.

**`verify-bundle.mjs` carries a static check for temporary tables**, because executing the bundle cannot catch this. PGlite gives one session by construction, so a temp table always resolves there; the bug passed every executed assertion and still failed for a user on the first real paste. Where the harness structurally cannot reproduce the target environment, a textual assertion is the honest substitute.

**Table privileges are granted explicitly by the RLS migration.** The schema originally relied on Supabase's `ALTER DEFAULT PRIVILEGES` for the `public` schema, which is invisible until something removes it — and `supabase/setup.sql` removes it every run, because dropping and recreating the schema is how the file stays re-runnable. The result would have been an app that builds, deploys, authenticates a user, and then fails every query with `permission denied for table profiles`. Grants are now stated in the migration: `authenticated` gets DML on all tables with RLS deciding rows, `service_role` gets everything, `anon` gets nothing, and default privileges are re-established for tables added later.

**The SQL harness no longer grants privileges on the migration's behalf.** `verify-sql.mjs` had `grant select, insert, update, delete ... to authenticated` in its setup block, which meant all 45 assertions ran against permissions the harness supplied rather than the ones the migration issued. Removing that line is what exposed the gap; the harness now asserts the grants exist instead. Test scaffolding that quietly supplies what production is missing is worse than no test, because it reports confidence it has not earned.

## Theme

**Dark turquoise on white, with hue 185 carried through the neutrals.** Borders, muted text and secondary surfaces are desaturated turquoise rather than grey, so the interface reads as one palette instead of a grey app with teal buttons. All colour lives in the CSS variables in `app/globals.css`; no component names a Tailwind palette colour, so the brand can change in one file.

**Status colours stay off the brand hue.** Approved, late and rejected are read on badges no wider than a word, so success sits at 145 and warning at 40 to remain unmistakably green and amber beside turquoise. Harmonising them toward the brand would have cost the glance-value the compliance views depend on.

**The warning badge is the one element carrying dark text.** White on amber reaches 4.17:1, below AA, and the amber dark enough to carry white text reads brown rather than as a warning. Dark text on a true amber keeps the meaning and measures 8.19:1. The inconsistency with the other badges is deliberate and is the standard resolution for amber.

**Contrast was measured in the browser, not estimated.** Every foreground/background pair was computed from resolved `rgb()` values on the running page: body text 16.3:1, muted text 5.6:1, primary button 6.3:1, success 5.1:1, warning 8.2:1, destructive 5.8:1. The warning failure was found this way rather than by eye.

## Schema naming and keys

**Every table keys on `id integer generated always as identity`, counting 1, 2, 3, 4.** Uuids are gone from the application schema: `departments`, `users`, `app_settings`, `training_submissions`, `training_records`, `training_attachments` and `automation_logs` all read as small integers, and so does every foreign key pointing at them. `generated always` rather than `by default` means Postgres rejects a client-supplied key outright, which is what keeps the sequence and the data from drifting apart. `app_settings.id` is the one non-identity integer: it is a pinned singleton constrained to `id = 1`, so counting upward would be wrong.

**`users.auth_user_id` carries the uuid that `users.id` used to be.** This is the boundary the change could not cross. `auth.users` belongs to Supabase Auth, which keys by uuid and mints the value at sign-up, so `public.users.id` could not both be an integer and be that foreign key. Splitting them gives IRIS its own integer key for the staff directory and a `uuid unique not null references auth.users (id)` link for the credential. It is the only uuid left in the schema.

**`public.current_user_id()` is the single place the two key spaces meet.** `auth.uid()` returns the caller's uuid from their JWT; every policy and trigger below works in integers. One `security definer` helper resolves one to the other, and the RLS predicates changed from `= auth.uid()` to `= public.current_user_id()`. The exception is `users_update_own`, which still matches on `auth_user_id = auth.uid()` — comparing the JWT value to the column directly needs no lookup at all.

**Rebinding `auth_user_id` is blocked separately from the HR-owned fields.** `guard_profile_privileged_fields` already stopped a user changing their own role or reporting line. A user who could repoint their profile at another person's auth account would take over that account outright, which is a different failure from privilege escalation and gets its own check and its own message.

**Storage paths are `<employee_id>/<training_record_id>/<file>` with integer segments,** so the ownership check is an integer comparison rather than a uuid cast. It goes through `public.storage_path_owner(name)`, which returns null unless the first path segment is entirely digits. The insert policy is the only route into the bucket and always writes a numeric segment, but a policy that raises instead of returning false takes the whole object listing down, so the cast fails closed rather than erroring.

**`automation_logs.related_id` is an integer again.** It went to text when `training_records` moved to bigint and left the schema with two key types. Now that every table keys on integer, one integer column covers them all, with `related_table` saying which table the id belongs to. `lib/automationLog.ts` no longer stringifies it.

**The seed cannot name an id, so it resolves rows by natural key.** Ids are assigned by the database, so `seed_account` takes the auth uuid and returns the integer id it was given, departments are looked up by `name` and people by `email` — the two columns the schema already declares unique. The auth uuids stay literal: that table is keyed by uuid regardless, and fixed values make a re-run reuse the same accounts instead of accumulating new ones. `seed_people.idx` is stated explicitly rather than read from `users.id`, so the shape of the demo data does not depend on the order the database happened to assign keys in.

**`seq_no` is unchanged and still numbers entries within a single month,** which is what the paper form's "No." column shows and what a reviewer reads down the page. It is a different thing from `id`: `id` is unique across the table, `seq_no` restarts every month.

**Ids reaching the app through a URL are parsed, not passed through.** `?recordId=`, `?department=`, `?employee=` and the `[id]` route segments arrive as strings and are now integer columns, so each is coerced and rejected if it is not a positive integer — a hand-edited path reads as not found rather than reaching the query as a string. `reviewDecisionSchema.submissionId` changed from `z.string().uuid()` to a coerced positive integer for the same reason.

**Both SQL harnesses assert the keys directly.** `verify-sql.mjs` impersonates by auth uuid, because that is what a real JWT carries, and resolves the integer ids from the seed rather than hardcoding them — which means the tests exercise the uuid-to-integer crossing instead of bypassing it. Both files check that every `id` column reports `integer` and that ids run 1..n with no gaps, and `verify-bundle.mjs` checks that after a re-run, so a rebuilt schema is proved to restart its sequences rather than continue them.

**Timestamps are `created_time` and `modified_time` across every table.** `training_attachments.uploaded_at` was folded into `created_time` for consistency, since the request covered all tables. `app_settings.updated_by` keeps its name — it is a person, not a timestamp. The rename deliberately stops at the schema boundary: `auth.users` and `auth.identities` belong to GoTrue and keep `created_at`/`updated_at`, as does the platform-stub code in both test harnesses.

**`profiles` is now `public.users`.** Renamed throughout the schema, the RLS policies, the seed, the generated types, and `lib/queries/users.ts`. It sits alongside `auth.users` rather than replacing it: `public.users` is the staff directory that IRIS owns and `auth.users` is the credential store that Supabase Auth owns. The link between them was `public.users.id`; it is now `public.users.auth_user_id`, per the integer-keys entry above. Every reference to the auth table in the SQL is schema-qualified, so the two never collide. Earlier entries in this file that mention `profiles` describe decisions made before the rename and are left as written.

## Add training

**`openSubmissionForEditing` no longer discards the Postgres error.** It previously destructured only `data` from the read and reported a fixed string, so "Could not open this month for editing" covered every possible cause and named none. The read error is now surfaced, and the insert reports the driver's own message.

**A duplicate-key result on opening a month re-reads instead of failing.** Unique constraints are not filtered by RLS, so a row can block the insert while staying invisible to the select that preceded it — as can a second tab opening the same month. Both now recover by re-reading and using the row that exists. Only a row that is genuinely unreadable produces an error, and that message tells the employee what to do.

**Submit from the entry form sends the whole month, not the entry.** The form's Submit saves the entry and then calls `submitMonth`, moving the month to `submitted_pending_hod` for HOD verification. The two steps report separately: if the entry saves but the submission fails, the message says so rather than implying the typing was lost. Explanatory copy under the buttons states that Submit closes the month to editing, because the button sits on a single-entry form where it would otherwise read as submitting just that entry.

**"Save and add another" was dropped** in favour of the requested Save as draft / Submit / Cancel. Adding several entries now means saving each and returning through "Add training" from the month view.

## Repairing a live database

**`supabase/repair.sql` re-applies functions, policies, triggers and grants without touching a row.** `setup.sql` fixes everything by rebuilding everything, which costs the user all their data — and most breakage does not need it. Renaming a table in the dashboard leaves the tables perfectly intact and strands only the functions, since Postgres stores their bodies as text and never rewrites them. That single failure mode cost this project its entered data once already. Generated from the migrations by `scripts/build-repair-sql.mjs` rather than hand-maintained, so it cannot drift: `create or replace` for functions, an explicit `drop … if exists` ahead of each policy and trigger, and everything that creates a table or writes a row deliberately skipped.

**The generator silently dropped four policies on its first run, and only a test caught it.** Statements were split on every semicolon, including the ones inside prose comments — "Reads are open; writes are not." severed that policy from its own `CREATE`, and three others went the same way. Nothing errored; the policies were simply absent, and a repaired database would have quietly lost its `users` select policy. The splitter now skips line comments and string literals, and `verify-repair.mjs` counts policies, functions and triggers against the migrations so an omission fails loudly rather than passing silently.

**`verify-repair.mjs` breaks the database the way the dashboard does, not the way that is convenient to write.** Postgres validates a `language sql` body when the function is created, so a broken function cannot simply be declared: the helpers have to be written while the old table name still exists and stranded by a subsequent rename. Simulating it any other way would have tested a failure mode that cannot occur.

## Request Management (prototype)

**Backed by the database, not in-memory demo state.** The brief asked for "local state similar to the existing training provider pattern", but there is no provider in this codebase — Training Records is Supabase tables with typed query helpers and RLS. Following that is what "similar to the existing pattern" actually means here, and it avoids the failure this project already hit twice: data that disappears. An in-memory module would reset on every server restart, which is exactly the complaint that took several rounds to diagnose earlier in this build.

**The requests migration only creates things, so it applies to a live database without losing data.** No drops, no schema rebuild. Pasting `supabase/migrations/20260730120000_requests.sql` adds the module to a database that already holds training records. `setup.sql` remains the rebuild path and still erases everything.

**Costs are integer cents.** Same reasoning as integer minutes for durations: a float total eventually reports a figure nobody can reconcile. `lib/utils/money.ts` parses what the user typed by assembling digits rather than multiplying a float, so 8.90 cannot arrive as 889 cents.

**The suggestion engine is deterministic keyword matching, not a model call.** For a prototype that is the better trade: no key to configure, nothing to rate-limit during a demo, and — the part that matters most — it is unit-testable, so its output is pinned by 29 tests rather than re-rolled on each run. It runs as a server action so that swapping in a real model later changes one pure function and never puts a key in the browser bundle. Category rules are ordered rather than scored, because "laptop repair" must file under IT and not Maintenance; the first match wins and the equipment rules are consulted first.

**`ai_suggestion` is stored on the request even after the requester overrules it.** A reviewer can then see both what was proposed and what was actually filed, and the detail page names the differences explicitly. Keeping only the final values would have hidden the one thing that makes an AI suggestion worth auditing.

**Two defences on who may decide, and both are tested.** The RLS policies decide who may write; a `before update` trigger decides what they may write. The trigger stops anyone approving their own request whatever role they hold, stops a requester moving their own request past approval, and blanks any attempt by a reviewer to rewrite the request they are judging. A decision stamps its own reviewer and timestamp so no client can misattribute one.

**A `cancelRequest` action was written and then removed.** Withdrawing is not in the brief, and the requests table has no DELETE policy — the action would have reported success while deleting nothing, since RLS filters a delete to zero rows rather than raising. Shipping a button that silently does nothing is worse than not shipping it.

**`lib/actionResult.ts` was extracted for the shared `ActionResult` type.** Training still declares its own copy. Migrating it is a change to the finished module and is deliberately not bundled with new work.

**The requests migration is re-runnable.** It is the one migration pasted into the SQL Editor by hand — the whole point of it being additive is that it can be applied to a database already holding training data — so a second paste has to be a no-op rather than `type "request_status" already exists` a third of the way down. Tables and indexes use `if not exists`, policies and triggers are dropped before they are created, and the enums are guarded in a `DO` block because Postgres offers no `CREATE TYPE IF NOT EXISTS`. `verify-sql.mjs` applies the file twice on every run, so this cannot regress.

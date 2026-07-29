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

**The bundle header owns re-runnability, not the migrations.** Migrations stay conventional run-once DDL. The header additionally pins `uuid-ossp` and `pgcrypto` to the `extensions` schema so the `public` drop cannot take them, and clears the storage policies, which live in the `storage` schema and so survive that drop. Storage policies are dropped by name prefix in a `DO` block rather than listed individually, so adding one does not silently break the re-run.

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

**`training_records.id` is a bigint identity counting 1, 2, 3.** `seq_no` is unchanged and still numbers entries within a single month, which is what the paper form's "No." column shows and what a reviewer reads down the page. The two are different things: `id` is unique across the table, `seq_no` restarts every month.

**`automation_logs.related_id` became text.** It points at whichever table an action touched, and those no longer share a key type now that `training_records` uses a bigint while everything else uses uuid. A uuid column could no longer hold a training-record reference.

**Timestamps are `created_time` and `modified_time` across every table.** `training_attachments.uploaded_at` was folded into `created_time` for consistency, since the request covered all tables. `app_settings.updated_by` keeps its name — it is a person, not a timestamp. The rename deliberately stops at the schema boundary: `auth.users` and `auth.identities` belong to GoTrue and keep `created_at`/`updated_at`, as does the platform-stub code in both test harnesses.

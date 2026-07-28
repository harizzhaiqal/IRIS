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

**Storage paths are `<employee_id>/<submission_id>/<filename>`.** Putting the owner's id in the first path segment lets the storage policies authorize on a prefix comparison, with no join back to the training tables.

**Overrides require a reason at the database level.** A check constraint rejects any record whose `recorded_minutes` differs from `calculated_minutes` without an `override_reason`. The brief asks for the reason in the UI; making it a constraint means the reviewer is never shown an unexplained discrepancy.

**Signup is disabled in `config.toml`.** HR creates staff accounts; there is no self-registration route in the brief.

**SQL is verified with PGlite (`npm run test:sql`) instead of a local Supabase stack.** With no Docker available, the alternative was shipping unexecuted SQL. `supabase/tests/verify-sql.mjs` applies both migrations and the seed to a real Postgres compiled to WebAssembly, then asserts the trigger behaviour, the constraints, RLS isolation between employees, and the whole submit → return → resubmit → verify → approve lifecycle. It stubs the parts Supabase provides rather than these migrations — the `auth` and `storage` schemas, `auth.uid()`, and pgcrypto — and skips `CREATE EXTENSION`, so it validates the project's own SQL, not the platform's. It found two real defects: an uncast UUID literal in the seed, and confirmed that a HOD acting outside their team is filtered out by RLS rather than raising, which is the intended outcome.

## Seed data

**The two HODs are each other's HOD.** A HOD files their own monthly record as a staff member, and that record still needs a HOD verification stage before HR sees it. Pointing them at HR instead would not work: the verification trigger requires the HOD stage to be performed by someone with the `hod` role.

**Support has no HOD of its own.** The brief specifies three departments but only two HODs, so Sharon heads both Sales and Support. Faizal heads Software Development.

**Two years of data: 2025 in full, 2026 through July.** A single year could not show both a complete annual compliance figure and a realistic in-flight current month. 2025 gives settled year-end totals; 2026 carries the live states — July holds drafts and both pending stages, June is past its 10 July deadline so unfinished months there read as overdue, and two people have not opened July at all.

**Monthly volumes are generated from a per-person base with a deterministic variance**, ranging from roughly 135 to 330 minutes a month. This puts some employees comfortably past the 48-hour standard and others below the 36-hour threshold, so the compliance dashboard shows a real distribution rather than a flat line.

# IRIS — IRS Records and Insight System

Internal staff workflow system for IRS Software Solution. This build covers the
authentication shell, the role-aware dashboard, the **Employee Training Records**
module, and a prototype **Request Management** module.

The module replaces form IRS-HR-F14 (*Employee Training Record & Evaluation*),
which was previously an Excel workbook per employee per year, emailed to a head
of department with HR copied and signed off by both.

## How it works

Each employee records their training one month at a time. A month holds many
training entries and is submitted as a unit.

```
draft ──submit──> submitted_pending_hod ──HOD verify──> hod_verified ──HR approve──> approved
                        │                                    │
                        └── HOD return ──> returned_by_hod ───┘
                        └────────── HR reject ──> rejected
```

`returned_by_hod` and `rejected` reopen the month for editing and resubmission.
**Only `approved` hours count toward compliance.** Approved and pending hours are
reported separately throughout, so an unverified total is never presented as
progress.

Learning-hour targets live in the `app_settings` table, not in code: 4 hours a
month, 48 hours a year as the standard, 36 hours as the minimum threshold, and a
submission deadline on the 10th of the following month.

### Durations

All durations are stored as **integer minutes** and formatted to `HH:MM` only at
the display layer.

Each entry keeps two figures. `calculated_minutes` is derived from the start and
end date-time; `recorded_minutes` is what the employee claims. A multi-day course
counts its daily session window once per day, so a course running 26–27 February,
09:00–17:00, calculates as 16 hours. Employees commonly record less than that —
14 hours in that example, because the two lunch breaks are not learning time.
Overriding the calculated figure requires a reason, enforced by a check
constraint, and reviewers are shown both numbers side by side.

### Roles

| Role | Can do |
| --- | --- |
| `staff` | Record and submit their own training; raise their own requests |
| `hod` | The above, plus verify their team's submissions and requests first |
| `hr_admin` | Verify second and monitor everyone. Keeps no record of their own. |
| `ceo` | Read the whole company. Submits nothing, raises nothing, approves nothing. |

Only `staff` and `hod` see **My training** and can raise a request. HR
administers the process rather than taking part in it, so their menu is the
dashboard, the training review queue, and the request review queue — which also
removes the case where HR approved a training record they had filed themselves.

## Local setup

Requires Node 20+. Docker is **not** needed for the path below.

IRIS needs a Supabase project because it uses Supabase for auth, the data API,
and file storage — a bare Postgres install is not enough. The quickest way to get
one is the hosted free tier.

```bash
npm install
```

### 1. Create a Supabase project

Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) and create a
project. Any region works; note the database password you choose.

### 2. Load the schema and demo data

Open the project's **SQL Editor**, paste the entire contents of
[`supabase/setup.sql`](supabase/setup.sql), and run it. That one file creates the
schema, the RLS policies, and the demo accounts with a full year of submissions.

Re-running it is safe — it rebuilds from scratch, which also discards anything
you have added since.

### 3. Point the app at the project

```bash
cp .env.example .env.local
```

Fill in the three values from the dashboard:

| Variable | Where to find it | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → Data API → Project URL | Supabase API URL. Safe in the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API Keys → publishable | Safe in the browser; RLS constrains it. |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API Keys → secret | Bypasses RLS. **Server-side only — never prefix with `NEXT_PUBLIC_`.** |

The variable names predate Supabase's rename of these keys. A publishable key
(`sb_publishable_…`) is the former anon key and a secret key (`sb_secret_…`) is
the former service-role key; both formats work unchanged, so the names stay as
they are rather than churning every call site.

### 4. Run it

```bash
npm run dev
```

The app runs at http://localhost:3000. Sign in with any account from
[Demo accounts](#demo-accounts) below.

### Optional: the local Supabase stack

Only worth it if you want to develop offline or reset the database freely. It
runs Postgres, GoTrue, PostgREST, Storage, Realtime, and Studio as containers, so
it **does** require [Docker Desktop](https://www.docker.com/products/docker-desktop/):

```bash
npx supabase start
```

This applies `supabase/migrations/` and then `supabase/seed.sql` automatically,
and prints the URL and keys to copy into `.env.local`. Studio is at
http://localhost:54323. To wipe and reseed after changing a migration:

```bash
npx supabase db reset
```

### Changing the schema

The migrations under `supabase/migrations/` are the source of truth;
`supabase/setup.sql` is generated from them. After editing a migration or the
seed, regenerate the bundle:

```bash
npm run sql:bundle
```

To push migrations to a hosted project with the CLI instead of the SQL Editor:

```bash
npx supabase link --project-ref <your-project-ref>
```

Note that `db push` applies migrations but does not run the seed. After any
schema change, regenerate the TypeScript types:

```bash
npm run types:generate
```

## Demo accounts

Every seeded account uses the password **`Password123!`**.

| Email | Name | Role |
| --- | --- | --- |
| `polak@irs.com.my` | Polak | CEO — read only |
| `hr@irs.com.my` | Nurul Aina Binti Rahim | HR admin |
| `ks@irs.com.my` | Chng Kok Sheng | HOD — R&D |
| `joshua@irs.com.my` | Joshua | HOD — Support, Sales, Admin, Support Engineer |
| `chen@irs.com.my` | Ms. Chen | HOD — Finance |
| `lee@irs.com.my` | Ms. Lee | HOD — HR |
| `staff.rnd@irs.com.my` | Demo Staff (R&D) | Staff |
| `staff.support@irs.com.my` | Demo Staff (Support) | Staff |

Departments: Sales, R&D, Support, HR, Finance, Support Engineer, Admin.

The two staff rows are placeholders — the roster above is heads of department
only, and the training module is for staff. Rename them once the real employees
are known.

The HODs are paired — Chng Kok Sheng with Joshua, Ms. Chen with Ms. Lee — so a
HOD's own monthly record still passes a HOD stage before it reaches HR. The CEO
cannot fill that stage, because the CEO approves nothing.

Seeded data covers 2025 in full and 2026 through July, spanning every status
including nil returns and overdue months. Chng Kok Sheng's February 2026 record
contains the multi-day override case described above.

## Testing

```bash
npm test            # unit tests for the duration, target, and suggestion logic
npm run test:sql    # migrations, seed, triggers, and RLS against a real Postgres
npm run test:bundle # supabase/setup.sql applies cleanly and is safe to re-run
npm run test:repair # supabase/repair.sql fixes a broken database without data loss
npm run build       # type check and production build
```

All of these run without Docker or a database, because `test:sql` and
`test:bundle` use Postgres compiled to WebAssembly (PGlite). The pieces Supabase
normally provides — the `auth` and `storage` schemas, `pgcrypto` — are stubbed.

`test:sql` applies both migrations and the seed, then asserts the rules hold: the
total-minutes trigger, the constraints, RLS isolation between employees, and the
whole submit → return → resubmit → verify → approve lifecycle.

`test:bundle` applies `supabase/setup.sql` twice, checking that the demo data
lands correctly the first time and that a second run leaves identical row counts
rather than duplicate accounts.

`test:repair` builds a healthy database, breaks it exactly as a dashboard rename
does, and asserts `supabase/repair.sql` restores it without losing a row.

### Fixing a live database without losing data

`setup.sql` rebuilds: it drops the `public` schema and reseeds, which erases
everything entered since. Most breakage does not need that. Renaming or altering
something through the Supabase dashboard leaves the tables intact but strands the
functions, because Postgres stores function bodies as text and never rewrites
them on rename — which is what produces errors like
`relation "public.profiles" does not exist`.

Paste [`supabase/repair.sql`](supabase/repair.sql) instead. It re-applies every
function, policy, trigger and grant, creates no tables and writes no rows, and is
safe to run repeatedly. Regenerate it after changing a migration:

```bash
npm run sql:repair
```

## Excel export

Staff download their own year as form IRS-HR-F14 from the **Export** button on
`/training`, or directly at `/training/export?year=2026`.

The workbook mirrors the file the Excel process used: twelve monthly sheets and
a yearly total, one file per employee per year, so a printed export still reads
like what people used to sign. Each monthly sheet carries the employee header,
the numbered entries with **both** the calculated and the recorded hours plus the
reason where they differ, the month total against target, and the HOD and HR
sign-off. The yearly sheet separates recorded from approved hours and reports
compliance against the 48-hour standard and the 36-hour threshold.

The route never accepts an employee id — the export is always the caller's own
record, so there is no id to guess at, and RLS would filter another employee's
rows away regardless.

To see the layout without running the app:

```bash
npm run sample:export
```

## Request Management (prototype)

A smaller module alongside Training Records, replacing the informal chat-and-email
route for asking the company for equipment, office items, and support.

Staff raise a request and follow it; a HOD sees their team's, HR sees everything.
Reviewers approve or reject, then move a request through in progress to completed.
A request needing approval opens as **pending approval**; one that does not goes
straight to **submitted** for the handling team.

| | |
| --- | --- |
| Pages | `/requests`, `/requests/new`, `/requests/[id]` |
| Statuses | submitted, pending approval, approved, rejected, in progress, completed |
| Categories | IT equipment, office furniture, software, access card, name card, office equipment, maintenance, other |
| Priorities | low, normal, high, urgent |

Costs are stored as **integer cents** and formatted only at the display layer, for
the same reason durations are integer minutes.

### Suggest with AI

The new-request form reads the description and proposes a category, department,
priority, whether approval is needed, and a short reason.

It is deterministic keyword matching in
[`lib/ai/suggestRequest.ts`](lib/ai/suggestRequest.ts), not a model call — no key
to configure, nothing to rate-limit mid-demo, and the behaviour is pinned by unit
tests rather than re-rolled on every run. It runs as a server action, so swapping
in a real model later means changing one pure function and never puts a key in the
browser bundle.

Whatever it proposes is a suggestion: every field stays editable, and the request
detail page shows what was suggested alongside anything the requester changed.

### Adding it to a database that already has data

The requests migration only creates things, so it is safe to apply on its own:

Paste [`supabase/migrations/20260730120000_requests.sql`](supabase/migrations/20260730120000_requests.sql)
into the SQL Editor. Your existing training data is untouched. Use `setup.sql`
only if you also want the demo requests, and remember it rebuilds everything.

## Project layout

```
app/
  (app)/                 authenticated shell — sidebar, role-aware nav
    dashboard/           one route, three role views
    training/            employee's month view, entry form, review, team, HR list
  login/                 email/password sign-in
  auth/signout/
components/
  ui/                    shadcn/ui primitives
  training/              status badge, target progress, verification trail, entries table
  dashboard/             stat card and the three dashboard views
lib/
  supabase/              browser, server, and service-role clients, plus schema types
  queries/               typed query helpers, one file per entity
  utils/duration.ts      minutesToHHMM, hhmmToMinutes, calculateMinutes
  utils/targets.ts       target and compliance maths
  validation/            Zod schemas shared by client and server
  automationLog.ts       the single writer for the audit trail
supabase/
  migrations/            schema, RLS policies, workflow triggers
  seed.sql               demo data
  setup.sql              generated: migrations + seed as one paste — REBUILDS, erases data
  repair.sql             generated: functions, policies and grants only — keeps data
  tests/verify-sql.mjs   SQL verification harness
  tests/verify-bundle.mjs  checks setup.sql applies and re-applies cleanly
scripts/bundle-sql.mjs   regenerates setup.sql — npm run sql:bundle
```

Components never build Supabase queries inline; they call helpers in
`lib/queries/`. Every state-changing action writes an `automation_logs` row
through `lib/automationLog.ts`.

## Security model

Authorization is split in two, because RLS grants access to rows but not columns,
and staff, HODs, and HR all authenticate as the same database role:

- **RLS policies** decide which rows each role can see and touch.
- **`enforce_submission_update_rules`**, a trigger, decides which *columns* each
  role can write. This is what actually implements two-stage verification: a HOD
  can only write the HOD fields, HR only the HR fields, status transitions must
  follow the lifecycle, and returning or rejecting requires a comment. Those
  rules hold even if a client bypasses the UI.

Role lookups go through `security definer` helper functions so that policies on
`profiles` never select from `profiles` — that recursion is the usual way Supabase
projects break.

`public.profiles` holds the staff directory: name, designation, role, department
and reporting line. It is distinct from `auth.users`, the Supabase Auth table
that owns credentials. No password is stored in `public.profiles`.

Every table in the application schema keys on `id integer generated always as
identity`, so ids read 1, 2, 3, 4. The one exception is the link to Supabase
Auth: `auth.users` is keyed by uuid, so `public.profiles.auth_user_id` is a uuid
referencing `auth.users(id)` while `public.profiles.id` is the integer key the rest
of the schema points at. `public.current_user_id()` resolves the uuid in the
caller's JWT to that integer, and is the only place the two meet.

`total_minutes` is recomputed by the database on every write and cannot be forged
from a client. The service-role key is used only in `lib/automationLog.ts` and
never reaches the browser.

## Out of scope

The Requests and Commission modules, reports and exports, email sending, AI
features, and the automation log page are deliberately not built. `automation_logs`
is populated and ready for a viewer to be added later.

See [DECISIONS.md](DECISIONS.md) for the ambiguities resolved during the build
and the reasoning behind each choice.

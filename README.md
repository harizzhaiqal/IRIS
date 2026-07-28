# IRIS — IRS Records and Insight System

Internal staff workflow system for IRS Software Solution. This build covers the
authentication shell, the role-aware dashboard, and the **Employee Training
Records** module.

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
| `staff` | Record and submit their own training |
| `hod` | Verify their team's submissions first; also submit their own record |
| `hr_admin` | Verify second, and monitor everyone |

## Local setup

Requires Node 20+ and Docker (for the local Supabase stack).

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL. Safe in the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key. Safe in the browser; RLS constrains it. |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS. **Server-side only — never prefix with `NEXT_PUBLIC_`.** |

Start Supabase. This applies everything in `supabase/migrations/` and then runs
`supabase/seed.sql`:

```bash
npx supabase start
```

The command prints the API URL, anon key, and service-role key — copy them into
`.env.local`. Then:

```bash
npm run dev
```

The app runs at http://localhost:3000 and Supabase Studio at
http://localhost:54323.

### Migrations and seeds

```bash
npx supabase db reset
```

Drops the local database, replays every migration in order, and reseeds. Use this
whenever you change a migration.

To apply migrations to a hosted project:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

After any schema change, regenerate the TypeScript types:

```bash
npm run types:generate
```

## Demo accounts

Every seeded account uses the password **`Password123!`**.

| Email | Name | Role |
| --- | --- | --- |
| `hr@irssoftware.test` | Nurul Aina Binti Rahim | HR admin |
| `faizal@irssoftware.test` | Mohd Faizal Bin Osman | HOD — Software Development |
| `sharon@irssoftware.test` | Sharon Lim Wei Ling | HOD — Sales and Support |
| `aiman@irssoftware.test` | Aiman Hakim Bin Zulkifli | Staff — Software Development |
| `preetha@irssoftware.test` | Preetha Devi A/P Ganesan | Staff — Software Development |
| `wenjie@irssoftware.test` | Tan Wen Jie | Staff — Software Development |
| `syafiq@irssoftware.test` | Muhammad Syafiq Bin Ramli | Staff — Software Development |
| `nadia@irssoftware.test` | Nadia Farhana Binti Yusof | Staff — Sales |
| `kumar@irssoftware.test` | Kumaravel A/L Subramaniam | Staff — Sales |
| `jasmine@irssoftware.test` | Jasmine Chong Mei Yee | Staff — Support |
| `hafiz@irssoftware.test` | Ahmad Hafiz Bin Ismail | Staff — Support |

The two HODs are each other's head of department, so a HOD's own monthly record
still passes a HOD stage before it reaches HR.

Seeded data covers 2025 in full and 2026 through July, spanning every status
including nil returns and overdue months. Aiman's February 2026 record contains
the multi-day override case described above.

## Testing

```bash
npm test        # unit tests for the duration and target maths
npm run test:sql # migrations, seed, triggers, and RLS against a real Postgres
npm run build   # type check and production build
```

`npm run test:sql` applies both migrations and the seed to Postgres compiled to
WebAssembly (PGlite), then asserts the rules hold: the total-minutes trigger, the
constraints, RLS isolation between employees, and the whole submit → return →
resubmit → verify → approve lifecycle. It needs no Docker, so it runs anywhere.

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
  tests/verify-sql.mjs   SQL verification harness
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
`profiles` never select from `profiles` — that recursion is the usual way
Supabase projects break.

`total_minutes` is recomputed by the database on every write and cannot be forged
from a client. The service-role key is used only in `lib/automationLog.ts` and
never reaches the browser.

## Out of scope

The Requests and Commission modules, reports and exports, email sending, AI
features, and the automation log page are deliberately not built. `automation_logs`
is populated and ready for a viewer to be added later.

See [DECISIONS.md](DECISIONS.md) for the ambiguities resolved during the build
and the reasoning behind each choice.

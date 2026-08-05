// Applies supabase/setup.sql and then supabase/add-staff-and-training.sql
// against PGlite, twice, to prove the roster file does what it claims.
//
// It is a file the user pastes by hand into the SQL Editor, so the failure mode
// that matters is the one that only shows up on execution: a status the trigger
// refuses, a date in the future, a month that violates the unique constraint on
// a second run. Reading the SQL cannot find any of those.

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

const ROSTER = [
  ["harizhaiqal@irs.com.my", "Hariz Haiqal", "R&D", "Chng Kok Sheng"],
  ["amyra@irs.com.my", "Amyra", "R&D", "Chng Kok Sheng"],
  ["fish@irs.com.my", "Yu Shen Fei", "R&D", "Chng Kok Sheng"],
  ["steve@irs.com.my", "Steve", "R&D", "Chng Kok Sheng"],
  ["isman@irs.com.my", "Isman", "Support", "Joshua"],
  ["akmal@irs.com.my", "Akmal", "Support", "Joshua"],
  ["soopeng@irs.com.my", "Soo Peng", "Sales", "Joshua"],
  ["jeff@irs.com.my", "Jeff", "Sales", "Joshua"],
  ["ina@irs.com.my", "Ina", "Admin", "Joshua"],
  ["yiting@irs.com.my", "Yi Ting", "Finance", "Ms. Chen"],
  ["lui@irs.com.my", "Lui", "Support Engineer", "Joshua"],
  ["qiaohui@irs.com.my", "Qiao Hui", "HR", "Ms. Lee"],
];

const EMAIL_LIST = ROSTER.map(([e]) => `'${e}'`).join(", ");

// CREATE EXTENSION is unavailable in PGlite; the stubs below stand in.
const strip = (sql) => sql.replace(/create extension[^;]*;/gi, "");

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

console.log("\n=== Base database (setup.sql) ===");
await db.exec(strip(read("supabase/setup.sql")));
const baseline = await db.query(`
  select
    (select count(*)::int from public.profiles) as profiles,
    (select count(*)::int from public.training_submissions) as submissions
`);
console.log(`  applied — ${baseline.rows[0].profiles} profiles before the roster`);

const script = strip(read("supabase/add-staff-and-training.sql"));

console.log("\n=== Run the roster script ===");
try {
  await db.exec(script);
} catch (error) {
  // PGlite dumps its whole WASM bundle into the stack; keep this readable.
  console.log(`  FAIL  the script did not apply — ${error.message}`);
  if (error.hint) console.log(`  hint: ${error.hint}`);
  process.exit(1);
}
console.log("  applied without error");

// ---------------------------------------------------------------------------
// The people
// ---------------------------------------------------------------------------
console.log("\n=== The 12 people ===");
{
  const { rows } = await db.query(`
    select p.email, p.full_name, p.designation, p.role, p.is_active,
           d.name as department, h.full_name as reports_to,
           p.auth_user_id,
           (select count(*)::int from auth.users a where a.id = p.auth_user_id) as auth_rows,
           (select count(*)::int from auth.identities i where i.user_id = p.auth_user_id) as identity_rows
      from public.profiles p
      left join public.departments d on d.id = p.department_id
      left join public.profiles h on h.id = p.hod_id
     where p.email in (${EMAIL_LIST})
     order by p.id
  `);

  check("all twelve were created", rows.length === 12, `got ${rows.length}`);

  const byEmail = new Map(rows.map((r) => [r.email, r]));

  for (const [email, fullName, department, reportsTo] of ROSTER) {
    const row = byEmail.get(email);
    check(
      `${fullName} — ${department}, reports to ${reportsTo}`,
      row?.full_name === fullName &&
        row?.department === department &&
        row?.reports_to === reportsTo &&
        row?.role === "staff" &&
        row?.is_active === true,
      JSON.stringify(row),
    );
  }

  // The half-made-account failure: a profile with no credential, or a
  // credential with no provider link, both look fine until someone signs in.
  check(
    "every one has a credential and a provider link",
    rows.every((r) => r.auth_rows === 1 && r.identity_rows === 1),
    JSON.stringify(rows.map((r) => [r.email, r.auth_rows, r.identity_rows])),
  );
}

// ---------------------------------------------------------------------------
// The training data — the point of it is that it is uneven
// ---------------------------------------------------------------------------
console.log("\n=== The training data is genuinely uneven ===");
{
  const { rows: grid } = await db.query(`
    select p.email,
           s.month,
           s.is_nil_return,
           s.status::text as status,
           count(r.id)::int as entries
      from public.profiles p
      join public.training_submissions s on s.employee_id = p.id
      left join public.training_records r on r.submission_id = s.id
     where p.email in (${EMAIL_LIST}) and s.year = 2026
     group by p.email, s.month, s.is_nil_return, s.status
  `);

  check("only January to August was written", grid.every((r) => r.month >= 1 && r.month <= 8));

  const opened = grid.length;
  const neverOpened = 12 * 8 - opened;
  check("some months were never opened at all", neverOpened > 0, `${neverOpened} of 96`);

  const nil = grid.filter((r) => r.is_nil_return).length;
  check("some months are nil returns", nil > 0, `${nil}`);
  check("a nil return holds no entries", grid.every((r) => !r.is_nil_return || r.entries === 0));
  check(
    "a nil return is never left in draft",
    grid.every((r) => !r.is_nil_return || r.status !== "draft"),
  );

  const one = grid.filter((r) => r.entries === 1).length;
  const two = grid.filter((r) => r.entries === 2).length;
  check("some months have exactly one entry", one > 0, `${one}`);
  check("some months have two", two > 0, `${two}`);

  // Per person, not just in aggregate: the mix has to be visible on one
  // person's year, since that is the screen it will be looked at on.
  const perPerson = new Map();
  for (const r of grid) {
    if (!perPerson.has(r.email)) perPerson.set(r.email, []);
    perPerson.get(r.email).push(r);
  }
  check("every one of the twelve has at least one month", perPerson.size === 12, `${perPerson.size}`);

  const varied = [...perPerson.entries()].filter(([, months]) => {
    const counts = new Set(months.map((m) => m.entries));
    return counts.size > 1 || months.length < 8;
  });
  check(
    "nobody has an identical eight months",
    varied.length === 12,
    `${varied.length} of 12 vary`,
  );

  // Totals must span the 4h monthly standard in both directions, or the
  // compliance view has nothing to distinguish.
  const { rows: totals } = await db.query(`
    select p.email, coalesce(sum(r.recorded_minutes), 0)::int as minutes
      from public.profiles p
      left join public.training_submissions s
             on s.employee_id = p.id and s.year = 2026
      left join public.training_records r on r.submission_id = s.id
     where p.email in (${EMAIL_LIST})
     group by p.email order by minutes
  `);
  check(
    "yearly totals spread widely across the roster",
    totals[totals.length - 1].minutes - totals[0].minutes > 600,
    `${totals[0].minutes}–${totals[totals.length - 1].minutes} minutes`,
  );

  const { rows: statuses } = await db.query(`
    select s.status::text as status, count(*)::int as n
      from public.training_submissions s
      join public.profiles p on p.id = s.employee_id
     where p.email in (${EMAIL_LIST}) and s.year = 2026
     group by s.status
  `);
  const seen = Object.fromEntries(statuses.map((r) => [r.status, r.n]));
  check(
    "every workflow status appears",
    ["approved", "rejected", "returned_by_hod", "hod_verified", "submitted_pending_hod", "draft"]
      .every((s) => (seen[s] ?? 0) > 0),
    JSON.stringify(seen),
  );

  const late = await db.query(`
    select count(*)::int as n from public.training_submissions s
      join public.profiles p on p.id = s.employee_id
     where p.email in (${EMAIL_LIST}) and s.year = 2026 and s.is_late
  `);
  check("some months were filed late", late.rows[0].n > 0, `${late.rows[0].n}`);
}

// ---------------------------------------------------------------------------
// Consistency the schema does not enforce on insert
// ---------------------------------------------------------------------------
console.log("\n=== Internally consistent ===");
{
  // August 2026 is the current month, so a record dated later than today would
  // be visible nonsense on the dashboard.
  const future = await db.query(`
    select count(*)::int as n from public.training_records r
      join public.training_submissions s on s.id = r.submission_id
      join public.profiles p on p.id = s.employee_id
     where p.email in (${EMAIL_LIST})
       and (r.end_datetime > now() or s.submitted_at > now())
  `);
  check("nothing is dated in the future", future.rows[0].n === 0, `${future.rows[0].n} rows`);

  const outOfMonth = await db.query(`
    select count(*)::int as n from public.training_records r
      join public.training_submissions s on s.id = r.submission_id
      join public.profiles p on p.id = s.employee_id
     where p.email in (${EMAIL_LIST})
       and (extract(month from r.start_datetime)::int <> s.month
         or extract(year from r.start_datetime)::int <> s.year)
  `);
  check("every entry falls inside the month it is filed against",
    outOfMonth.rows[0].n === 0, `${outOfMonth.rows[0].n} rows`);

  // total_minutes is maintained by a trigger, so this checks the trigger fired
  // for these inserts rather than that the script computed anything.
  const stale = await db.query(`
    select count(*)::int as n from public.training_submissions s
      join public.profiles p on p.id = s.employee_id
     where p.email in (${EMAIL_LIST})
       and s.total_minutes is distinct from coalesce(
         (select sum(r.recorded_minutes) from public.training_records r
           where r.submission_id = s.id), 0)
  `);
  check("every monthly total matches its entries", stale.rows[0].n === 0, `${stale.rows[0].n} rows`);

  const unreviewed = await db.query(`
    select count(*)::int as n from public.training_submissions s
      join public.profiles p on p.id = s.employee_id
     where p.email in (${EMAIL_LIST})
       and s.status in ('approved', 'rejected', 'hod_verified', 'returned_by_hod')
       and (s.hod_verified_by is null or s.submitted_at is null)
  `);
  check("anything past the HOD stage names its verifier and its filing date",
    unreviewed.rows[0].n === 0, `${unreviewed.rows[0].n} rows`);

  const draftFiled = await db.query(`
    select count(*)::int as n from public.training_submissions s
      join public.profiles p on p.id = s.employee_id
     where p.email in (${EMAIL_LIST}) and s.status = 'draft' and s.submitted_at is not null
  `);
  check("a draft has no filing date", draftFiled.rows[0].n === 0, `${draftFiled.rows[0].n} rows`);

  const logged = await db.query(`
    select count(*)::int as n from public.automation_logs l
     where l.related_table = 'training_submissions'
       and l.related_id in (
         select s.id from public.training_submissions s
          join public.profiles p on p.id = s.employee_id
         where p.email in (${EMAIL_LIST}) and s.year = 2026
       )
  `);
  const nonDraft = await db.query(`
    select count(*)::int as n from public.training_submissions s
      join public.profiles p on p.id = s.employee_id
     where p.email in (${EMAIL_LIST}) and s.year = 2026 and s.status <> 'draft'
  `);
  check("every filed month has an audit entry",
    logged.rows[0].n === nonDraft.rows[0].n,
    `${logged.rows[0].n} logs vs ${nonDraft.rows[0].n} filed`);
}

// ---------------------------------------------------------------------------
// The HOD can actually see them — the reason hod_id matters
// ---------------------------------------------------------------------------
console.log("\n=== The reporting line works ===");
{
  await db.exec(`
    select set_config('iris.user_id', '22222222-2222-2222-2222-222222222222', false);
  `);
  const team = await db.query(`
    select count(*)::int as n from public.profiles p
     where p.email in (${EMAIL_LIST}) and public.is_my_team_member(p.id)
  `);
  check("the head of R&D sees the four R&D hires as their team",
    team.rows[0].n === 4, `${team.rows[0].n}`);

  const queue = await db.query(`
    select count(*)::int as n from public.training_submissions s
      join public.profiles p on p.id = s.employee_id
     where p.email in (${EMAIL_LIST})
       and s.status = 'submitted_pending_hod'
       and public.is_my_team_member(s.employee_id)
  `);
  check("and has months waiting in their verification queue",
    queue.rows[0].n > 0, `${queue.rows[0].n}`);
  await db.exec(`select set_config('iris.user_id', '', false);`);
}

// ---------------------------------------------------------------------------
// Re-running it
// ---------------------------------------------------------------------------
console.log("\n=== Run it a second time ===");
{
  const before = await db.query(`
    select
      (select count(*)::int from public.profiles) as profiles,
      (select count(*)::int from auth.users) as auth_users,
      (select count(*)::int from public.training_submissions) as submissions,
      (select count(*)::int from public.training_records) as records,
      (select count(*)::int from public.automation_logs) as logs
  `);

  await db.exec(script);
  console.log("  applied without error");

  const after = await db.query(`
    select
      (select count(*)::int from public.profiles) as profiles,
      (select count(*)::int from auth.users) as auth_users,
      (select count(*)::int from public.training_submissions) as submissions,
      (select count(*)::int from public.training_records) as records,
      (select count(*)::int from public.automation_logs) as logs
  `);

  check("a second run changes no row counts",
    JSON.stringify(before.rows[0]) === JSON.stringify(after.rows[0]),
    `${JSON.stringify(before.rows[0])} vs ${JSON.stringify(after.rows[0])}`);

  const dupes = await db.query(`
    select p.email, count(*)::int as n from public.profiles p
     where p.email in (${EMAIL_LIST}) group by p.email having count(*) > 1
  `);
  check("nobody was duplicated", dupes.rows.length === 0, JSON.stringify(dupes.rows));

  // Only this roster's window may be rewritten. The demo staff seeded by
  // setup.sql must come through both runs untouched.
  const others = await db.query(`
    select count(*)::int as n from public.training_submissions s
      join public.profiles p on p.id = s.employee_id
     where p.email not in (${EMAIL_LIST})
  `);
  check("everyone else's records are left alone",
    others.rows[0].n === baseline.rows[0].submissions,
    `${others.rows[0].n} vs ${baseline.rows[0].submissions} before`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);

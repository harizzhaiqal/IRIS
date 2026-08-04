-- ===========================================================================
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


-- ===========================================================================
-- SOURCE: supabase/migrations/20260728090000_initial_schema.sql
-- ===========================================================================

-- IRIS: Employee Training Records module — core schema.
-- Replaces form IRS-HR-F14 (Employee Training Record & Evaluation).
--
-- Every table in this schema keys on `id integer generated always as identity`,
-- so ids read 1, 2, 3, 4. The one uuid left in the design is
-- users.auth_user_id: it points at auth.users, which Supabase Auth owns and
-- keys by uuid, so that column carries the credential link while public.users
-- keeps its own integer key.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- ceo is declared here rather than added later by ALTER TYPE: Postgres refuses
-- to use a newly added enum value in the same transaction that added it, which
-- would break setup.sql, since that file is a single paste.
create type public.user_role as enum ('staff', 'hod', 'hr_admin', 'ceo');

create type public.submission_status as enum (
  'draft',
  'submitted_pending_hod',
  'hod_verified',
  'approved',
  'returned_by_hod',
  'rejected'
);

create type public.training_effectiveness as enum (
  'effective',
  'average',
  'not_effective'
);

-- ---------------------------------------------------------------------------
-- Departments and users
--
-- departments.hod_id and users.department_id reference each other, so the
-- FKs are added after both tables exist.
-- ---------------------------------------------------------------------------

create table public.departments (
  id integer primary key generated always as identity,
  name text not null unique,
  hod_id integer,
  created_time timestamptz not null default now()
);

create table public.users (
  id integer primary key generated always as identity,
  -- The Supabase Auth account behind this person. auth.users is GoTrue's table
  -- and keys by uuid, so the link is a uuid even though this table is not.
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  designation text,
  date_joined date,
  role public.user_role not null default 'staff',
  department_id integer references public.departments (id) on delete set null,
  hod_id integer references public.users (id) on delete set null,
  is_active boolean not null default true,
  created_time timestamptz not null default now()
);

alter table public.departments
  add constraint departments_hod_id_fkey
  foreign key (hod_id) references public.users (id) on delete set null;

-- Every request resolves auth.uid() to this row, so the lookup is indexed by
-- the unique constraint above; these cover the reporting-line queries.
create index users_department_id_idx on public.users (department_id);
create index users_hod_id_idx on public.users (hod_id);
create index users_role_idx on public.users (role);

-- ---------------------------------------------------------------------------
-- Application settings
--
-- Learning-hour targets live here rather than in application code so HR can
-- change them without a deploy. Constrained to a single row.
-- ---------------------------------------------------------------------------

create table public.app_settings (
  id integer primary key default 1,
  monthly_standard_hours integer not null default 4,
  yearly_standard_hours integer not null default 48,
  yearly_threshold_hours integer not null default 36,
  submission_deadline_day integer not null default 10,
  reminder_enabled boolean not null default true,
  updated_by integer references public.users (id) on delete set null,
  modified_time timestamptz not null default now(),
  -- Not an identity column: the row is a singleton, so the key is pinned to 1
  -- rather than counting upward.
  constraint app_settings_single_row check (id = 1),
  constraint app_settings_deadline_day_valid
    check (submission_deadline_day between 1 and 28)
);

insert into public.app_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Training submissions — one per employee per month.
-- ---------------------------------------------------------------------------

create table public.training_submissions (
  id integer primary key generated always as identity,
  employee_id integer not null references public.users (id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2100),
  status public.submission_status not null default 'draft',
  is_nil_return boolean not null default false,
  submitted_at timestamptz,
  is_late boolean not null default false,
  hod_verified_by integer references public.users (id) on delete set null,
  hod_verified_at timestamptz,
  hod_comment text,
  hr_verified_by integer references public.users (id) on delete set null,
  hr_verified_at timestamptz,
  hr_comment text,
  total_minutes integer not null default 0,
  created_time timestamptz not null default now(),
  modified_time timestamptz not null default now(),
  constraint training_submissions_employee_period_key
    unique (employee_id, month, year)
);

create index training_submissions_employee_idx
  on public.training_submissions (employee_id);
create index training_submissions_period_idx
  on public.training_submissions (year, month);
create index training_submissions_status_idx
  on public.training_submissions (status);

-- ---------------------------------------------------------------------------
-- Training records — the individual entries within a month.
--
-- calculated_minutes is the raw elapsed time between start and end;
-- recorded_minutes is what the employee claims. They differ when breaks are
-- excluded from a multi-day course, and reviewers are shown both.
-- ---------------------------------------------------------------------------

-- id counts 1, 2, 3 across the whole table. seq_no is separate and still
-- numbers the entries within one month, which is what the paper form shows in
-- its "No." column and what reviewers read down the page.
create table public.training_records (
  id integer primary key generated always as identity,
  submission_id integer not null
    references public.training_submissions (id) on delete cascade,
  seq_no integer not null default 1,
  title text not null,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  calculated_minutes integer not null default 0 check (calculated_minutes >= 0),
  recorded_minutes integer not null default 0 check (recorded_minutes >= 0),
  override_reason text,
  location text,
  trainer_provider text,
  effectiveness public.training_effectiveness,
  remarks text,
  created_time timestamptz not null default now(),
  modified_time timestamptz not null default now(),
  constraint training_records_end_after_start check (end_datetime > start_datetime),
  -- An override away from the calculated duration must be explained.
  constraint training_records_override_needs_reason check (
    recorded_minutes = calculated_minutes
    or (override_reason is not null and length(btrim(override_reason)) > 0)
  )
);

create index training_records_submission_idx
  on public.training_records (submission_id);

-- ---------------------------------------------------------------------------
-- Attachments — certificates and attendance sheets, per training entry.
-- ---------------------------------------------------------------------------

create table public.training_attachments (
  id integer primary key generated always as identity,
  training_record_id integer not null
    references public.training_records (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_size integer not null default 0,
  created_time timestamptz not null default now()
);

create index training_attachments_record_idx
  on public.training_attachments (training_record_id);

-- ---------------------------------------------------------------------------
-- Automation log — audit trail for every state-changing action.
-- ---------------------------------------------------------------------------

create table public.automation_logs (
  id integer primary key generated always as identity,
  action_type text not null,
  description text,
  related_table text,
  -- integer, not text: the log points at whichever table the action touched,
  -- and every table in this schema now keys on integer, so one column type
  -- covers them all. related_table says which table the id belongs to.
  related_id integer,
  performed_by integer references public.users (id) on delete set null,
  is_system boolean not null default false,
  created_time timestamptz not null default now()
);

create index automation_logs_related_idx
  on public.automation_logs (related_table, related_id);
create index automation_logs_created_time_idx
  on public.automation_logs (created_time desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.touch_modified_time()
returns trigger
language plpgsql
as $$
begin
  new.modified_time := now();
  return new;
end;
$$;

create trigger training_submissions_touch_modified_time
  before update on public.training_submissions
  for each row execute function public.touch_modified_time();

create trigger training_records_touch_modified_time
  before update on public.training_records
  for each row execute function public.touch_modified_time();

-- Keeps training_submissions.total_minutes in step with its child records.
-- Owned by the database so no application path can leave the total stale.
create or replace function public.recalculate_submission_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_submission integer := coalesce(new.submission_id, old.submission_id);
begin
  update public.training_submissions
     set total_minutes = coalesce(
           (select sum(recorded_minutes)
              from public.training_records
             where submission_id = target_submission),
           0
         )
   where id = target_submission;

  return null;
end;
$$;

create trigger training_records_recalculate_total
  after insert or update or delete on public.training_records
  for each row execute function public.recalculate_submission_total();

-- A nil return has no entries, so its total must stay at zero.
create or replace function public.enforce_nil_return_is_empty()
returns trigger
language plpgsql
as $$
begin
  if new.is_nil_return and exists (
    select 1 from public.training_records where submission_id = new.id
  ) then
    raise exception 'A nil return cannot contain training entries';
  end if;
  return new;
end;
$$;

create trigger training_submissions_nil_return_guard
  before update on public.training_submissions
  for each row when (new.is_nil_return)
  execute function public.enforce_nil_return_is_empty();


-- ===========================================================================
-- SOURCE: supabase/migrations/20260728090100_rls_policies.sql
-- ===========================================================================

-- IRIS: row level security, authorization helpers, and workflow enforcement.

-- ---------------------------------------------------------------------------
-- Helper functions
--
-- These are `security definer` so that a policy on `users` can read the
-- caller's role without re-entering `users` policies. Selecting from
-- users inside a users policy recurses and takes the whole table down.
--
-- auth.uid() returns the caller's uuid from their JWT, because Supabase Auth
-- keys on uuid. Every policy below works in integer ids, so current_user_id()
-- is the single place that crosses between the two.
-- ---------------------------------------------------------------------------

create or replace function public.current_user_id()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users where auth_user_id = auth.uid();
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where auth_user_id = auth.uid();
$$;

create or replace function public.is_hr_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'hr_admin', false);
$$;

-- True when the given employee reports to the caller.
-- The CEO reads everything and writes nothing. Kept as its own helper so the
-- read policies and the write guards below both name the same rule.
create or replace function public.is_ceo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
     where auth_user_id = auth.uid() and role = 'ceo'
  );
$$;

create or replace function public.is_my_team_member(employee integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
     where id = employee and hod_id = public.current_user_id()
  );
$$;

-- Single place defining who may see a submission, reused by the child tables.
create or replace function public.can_view_submission(submission integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.training_submissions s
     where s.id = submission
       and (
         s.employee_id = public.current_user_id()
         or public.is_my_team_member(s.employee_id)
         or public.is_hr_admin()
         or public.is_ceo()
       )
  );
$$;

-- A submission is open for employee edits only in these three states.
create or replace function public.can_edit_submission(submission integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.training_submissions s
     where s.id = submission
       and s.employee_id = public.current_user_id()
       and s.status in ('draft', 'returned_by_hod', 'rejected')
       -- The CEO does not file a training record, so nothing is editable.
       and not public.is_ceo()
  );
$$;

revoke execute on function public.current_user_id() from public;
revoke execute on function public.current_user_role() from public;
revoke execute on function public.is_hr_admin() from public;
revoke execute on function public.is_ceo() from public;
revoke execute on function public.is_my_team_member(integer) from public;
revoke execute on function public.can_view_submission(integer) from public;
revoke execute on function public.can_edit_submission(integer) from public;

grant execute on function public.current_user_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_hr_admin() to authenticated;
grant execute on function public.is_ceo() to authenticated;
grant execute on function public.is_my_team_member(integer) to authenticated;
grant execute on function public.can_view_submission(integer) to authenticated;
grant execute on function public.can_edit_submission(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere.
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.departments enable row level security;
alter table public.app_settings enable row level security;
alter table public.training_submissions enable row level security;
alter table public.training_records enable row level security;
alter table public.training_attachments enable row level security;
alter table public.automation_logs enable row level security;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

-- Staff names, designations, and departments act as an internal directory:
-- every signed-in user needs them to render HOD names in verification trails
-- and reviewer names on submissions. Reads are open; writes are not.
create policy users_select_authenticated on public.users
  for select to authenticated
  using (true);

-- A user may maintain their own profile. Matched on auth_user_id rather than
-- id, so the check reads straight from the JWT with no lookup. Role and
-- reporting line are locked down separately by the
-- users_guard_privileged_fields trigger.
create policy users_update_own on public.users
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- Only HR administers the staff list.
create policy users_all_hr_admin on public.users
  for all to authenticated
  using (public.is_hr_admin())
  with check (public.is_hr_admin());

-- Stops a user escalating their own role or reassigning their reporting line
-- through the users_update_own policy.
create or replace function public.guard_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_hr_admin() then
    return new;
  end if;

  -- The credential link is not a profile field: rebinding it would hand one
  -- person another's account.
  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'The sign-in account behind a user cannot be reassigned';
  end if;

  if new.role is distinct from old.role
     or new.hod_id is distinct from old.hod_id
     or new.department_id is distinct from old.department_id
     or new.is_active is distinct from old.is_active then
    raise exception 'Only HR can change role, department, reporting line, or active status';
  end if;

  return new;
end;
$$;

create trigger users_guard_privileged_fields
  before update on public.users
  for each row execute function public.guard_profile_privileged_fields();

-- ---------------------------------------------------------------------------
-- departments — readable by everyone signed in, maintained by HR.
-- ---------------------------------------------------------------------------

create policy departments_select_authenticated on public.departments
  for select to authenticated
  using (true);

create policy departments_all_hr_admin on public.departments
  for all to authenticated
  using (public.is_hr_admin())
  with check (public.is_hr_admin());

-- ---------------------------------------------------------------------------
-- app_settings — everyone reads the targets, only HR changes them.
-- ---------------------------------------------------------------------------

create policy app_settings_select_authenticated on public.app_settings
  for select to authenticated
  using (true);

create policy app_settings_update_hr_admin on public.app_settings
  for update to authenticated
  using (public.is_hr_admin())
  with check (public.is_hr_admin());

-- ---------------------------------------------------------------------------
-- training_submissions
-- ---------------------------------------------------------------------------

-- An employee sees their own months.
create policy training_submissions_select_own on public.training_submissions
  for select to authenticated
  using (employee_id = public.current_user_id());

-- A HOD sees every month belonging to someone who reports to them.
create policy training_submissions_select_team on public.training_submissions
  for select to authenticated
  using (public.is_my_team_member(employee_id));

-- HR sees everything, company-wide.
create policy training_submissions_select_hr on public.training_submissions
  for select to authenticated
  using (public.is_hr_admin());

-- An employee opens their own month, and only as a draft.
-- The CEO sees the whole company, read only.
create policy training_submissions_select_ceo on public.training_submissions
  for select to authenticated
  using (public.is_ceo());

create policy training_submissions_insert_own on public.training_submissions
  for insert to authenticated
  with check (
    employee_id = public.current_user_id()
    and status = 'draft'
    and not public.is_ceo()
  );

-- An employee edits their own month only while it is open to them. Which
-- columns they may touch is enforced by enforce_submission_update_rules.
create policy training_submissions_update_own on public.training_submissions
  for update to authenticated
  using (
    employee_id = public.current_user_id()
    and status in ('draft', 'returned_by_hod', 'rejected')
    and not public.is_ceo()
  )
  with check (employee_id = public.current_user_id());

-- A HOD acts on their team's submissions; the trigger limits them to the
-- HOD verification columns.
create policy training_submissions_update_team on public.training_submissions
  for update to authenticated
  using (public.is_my_team_member(employee_id))
  with check (public.is_my_team_member(employee_id));

-- HR acts on any submission; the trigger limits them to the HR columns.
create policy training_submissions_update_hr on public.training_submissions
  for update to authenticated
  using (public.is_hr_admin())
  with check (public.is_hr_admin());

-- An employee may discard a month only while it is still a draft.
create policy training_submissions_delete_own_draft on public.training_submissions
  for delete to authenticated
  using (
    employee_id = public.current_user_id()
    and status = 'draft'
    and not public.is_ceo()
  );

-- ---------------------------------------------------------------------------
-- training_records — visibility follows the parent submission, editing is
-- limited to the owner while the month is open.
-- ---------------------------------------------------------------------------

create policy training_records_select on public.training_records
  for select to authenticated
  using (public.can_view_submission(submission_id));

create policy training_records_insert_own on public.training_records
  for insert to authenticated
  with check (public.can_edit_submission(submission_id));

create policy training_records_update_own on public.training_records
  for update to authenticated
  using (public.can_edit_submission(submission_id))
  with check (public.can_edit_submission(submission_id));

create policy training_records_delete_own on public.training_records
  for delete to authenticated
  using (public.can_edit_submission(submission_id));

-- ---------------------------------------------------------------------------
-- training_attachments — same rules, one join further out.
-- ---------------------------------------------------------------------------

create policy training_attachments_select on public.training_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.training_records r
       where r.id = training_record_id
         and public.can_view_submission(r.submission_id)
    )
  );

create policy training_attachments_insert_own on public.training_attachments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.training_records r
       where r.id = training_record_id
         and public.can_edit_submission(r.submission_id)
    )
  );

create policy training_attachments_delete_own on public.training_attachments
  for delete to authenticated
  using (
    exists (
      select 1 from public.training_records r
       where r.id = training_record_id
         and public.can_edit_submission(r.submission_id)
    )
  );

-- ---------------------------------------------------------------------------
-- automation_logs — HR reads the audit trail. No insert, update, or delete
-- policy exists: writes go through the service-role key on the server, which
-- bypasses RLS, so no client can forge or amend an audit entry.
-- ---------------------------------------------------------------------------

create policy automation_logs_select_hr_admin on public.automation_logs
  for select to authenticated
  using (public.is_hr_admin() or public.is_ceo());

-- ---------------------------------------------------------------------------
-- Workflow enforcement
--
-- RLS grants access to rows, not columns, so the two-stage verification rules
-- live in a trigger. This is what actually stops a HOD writing the HR fields
-- or an employee approving their own month.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_submission_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The JWT subject and the profile it resolves to are read separately. A
  -- signed-in caller with no profile row must not fall into the absent-JWT
  -- case below, which is trusted.
  caller uuid := auth.uid();
  actor integer;
  actor_role public.user_role;
  is_owner boolean;
begin
  -- total_minutes is derived. Recomputing it here means no client can write a
  -- total that disagrees with the entries behind it.
  new.total_minutes := coalesce(
    (select sum(recorded_minutes) from public.training_records
      where submission_id = new.id),
    0
  );

  -- Server-side jobs using the service-role key have no JWT and are trusted.
  if caller is null then
    return new;
  end if;

  actor := public.current_user_id();
  actor_role := public.current_user_role();
  is_owner := (new.employee_id = actor);

  -- The period a submission covers, and who it belongs to, never change.
  if new.employee_id is distinct from old.employee_id
     or new.month is distinct from old.month
     or new.year is distinct from old.year then
    raise exception 'The employee and period of a submission cannot be changed';
  end if;

  -- ---- Employee acting on their own month ---------------------------------
  if is_owner and old.status in ('draft', 'returned_by_hod', 'rejected') then
    if new.hod_verified_by is distinct from old.hod_verified_by
       or new.hod_verified_at is distinct from old.hod_verified_at
       or new.hod_comment is distinct from old.hod_comment
       or new.hr_verified_by is distinct from old.hr_verified_by
       or new.hr_verified_at is distinct from old.hr_verified_at
       or new.hr_comment is distinct from old.hr_comment then
      raise exception 'An employee cannot alter verification fields';
    end if;

    if new.status is distinct from old.status
       and new.status <> 'submitted_pending_hod' then
      raise exception 'An employee may only move a submission to submitted_pending_hod';
    end if;

    return new;
  end if;

  -- ---- HOD verifying a team member ----------------------------------------
  if actor_role = 'hod' and public.is_my_team_member(new.employee_id) then
    if new.status not in ('hod_verified', 'returned_by_hod') then
      raise exception 'A HOD may only verify or return a submission';
    end if;

    if old.status <> 'submitted_pending_hod' then
      raise exception 'Only a submission pending HOD verification can be verified or returned';
    end if;

    if new.is_nil_return is distinct from old.is_nil_return
       or new.submitted_at is distinct from old.submitted_at
       or new.is_late is distinct from old.is_late
       or new.hr_verified_by is distinct from old.hr_verified_by
       or new.hr_verified_at is distinct from old.hr_verified_at
       or new.hr_comment is distinct from old.hr_comment then
      raise exception 'A HOD may only write the HOD verification fields';
    end if;

    if new.status = 'returned_by_hod'
       and coalesce(btrim(new.hod_comment), '') = '' then
      raise exception 'Returning a submission requires a comment';
    end if;

    new.hod_verified_by := actor;
    new.hod_verified_at := now();
    return new;
  end if;

  -- ---- HR approving or rejecting ------------------------------------------
  if actor_role = 'hr_admin' then
    if new.status not in ('approved', 'rejected') then
      raise exception 'HR may only approve or reject a submission';
    end if;

    if old.status <> 'hod_verified' then
      raise exception 'Only a HOD-verified submission can be approved or rejected';
    end if;

    if new.is_nil_return is distinct from old.is_nil_return
       or new.submitted_at is distinct from old.submitted_at
       or new.is_late is distinct from old.is_late
       or new.hod_verified_by is distinct from old.hod_verified_by
       or new.hod_verified_at is distinct from old.hod_verified_at
       or new.hod_comment is distinct from old.hod_comment then
      raise exception 'HR may only write the HR verification fields';
    end if;

    if new.status = 'rejected'
       and coalesce(btrim(new.hr_comment), '') = '' then
      raise exception 'Rejecting a submission requires a comment';
    end if;

    new.hr_verified_by := actor;
    new.hr_verified_at := now();
    return new;
  end if;

  raise exception 'Not permitted to update this submission';
end;
$$;

create trigger training_submissions_enforce_update_rules
  before update on public.training_submissions
  for each row execute function public.enforce_submission_update_rules();

-- ---------------------------------------------------------------------------
-- Storage: supporting documents for training entries.
--
-- Paths are laid out as <employee_id>/<training_record_id>/<filename>, both
-- integers now, so the owner check is a comparison on the first path segment.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('training-attachments', 'training-attachments', false)
on conflict (id) do nothing;

-- The insert policy below is the only route by which a path enters this
-- bucket, so the first segment is always a plain integer. The cast is still
-- guarded: an object placed by any other means must fail closed rather than
-- raise, which in a policy would take the whole listing down.
create or replace function public.storage_path_owner(object_name text)
returns integer
language sql
immutable
as $$
  select case
    when (storage.foldername(object_name))[1] ~ '^[0-9]+$'
    then ((storage.foldername(object_name))[1])::integer
  end;
$$;

revoke execute on function public.storage_path_owner(text) from public;
grant execute on function public.storage_path_owner(text) to authenticated;

-- Owners read their own files; HODs and HR read via the same rules that let
-- them see the submission, which for storage reduces to team membership.
create policy training_attachments_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'training-attachments'
    and (
      public.storage_path_owner(name) = public.current_user_id()
      or public.is_hr_admin()
      or public.is_my_team_member(public.storage_path_owner(name))
    )
  );

create policy training_attachments_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'training-attachments'
    and public.storage_path_owner(name) = public.current_user_id()
  );

create policy training_attachments_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'training-attachments'
    and public.storage_path_owner(name) = public.current_user_id()
  );

-- ---------------------------------------------------------------------------
-- Table privileges
--
-- Stated explicitly rather than inherited from Supabase's default privileges
-- for the public schema. Those defaults are a property of the schema, so any
-- workflow that drops and recreates it — supabase/setup.sql does exactly that
-- to stay re-runnable — silently loses them, and every signed-in request then
-- fails with "permission denied for table users".
--
-- This is the coarse layer: it decides which roles may touch a table at all.
-- The policies above are the fine layer, deciding which rows. Both must pass.
-- anon is granted nothing: every page in IRIS requires a session.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- service_role bypasses RLS, but still needs the privilege to reach the table.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Keeps tables added by later migrations working without repeating the above.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;


-- ===========================================================================
-- SOURCE: supabase/migrations/20260730120000_requests.sql
-- ===========================================================================

-- IRIS: Request Management — prototype module.
--
-- Replaces the informal chat/email route for asking the company for equipment,
-- office items, and support. Deliberately smaller than Training Records: one
-- table for the request, one for its comments, and a single review stage.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Guarded rather than bare CREATE TYPE: Postgres offers no IF NOT EXISTS for
-- types, and this file is pasted straight into the SQL Editor to add the module
-- to a database that already has data. A second paste must be a no-op, not an
-- error halfway down the script.
do $enums$
begin
  if not exists (select 1 from pg_type where typname = 'request_status') then
    create type public.request_status as enum (
      'submitted',
      'pending_approval',
      'approved',
      'rejected',
      'in_progress',
      'completed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'request_category') then
    create type public.request_category as enum (
      'it_equipment',
      'office_furniture',
      'software',
      'access_card',
      'name_card',
      'office_equipment',
      'maintenance',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'request_priority') then
    create type public.request_priority as enum ('low', 'normal', 'high', 'urgent');
  end if;
end
$enums$;

-- ---------------------------------------------------------------------------
-- Requests
--
-- estimated_cost_cents is an integer for the same reason durations are integer
-- minutes: money in a float eventually reports a total nobody can reconcile.
-- Formatted to currency only at the display layer.
--
-- ai_suggestion keeps what the assistant proposed even after the requester
-- edits the fields, so a reviewer can see what was suggested and what was
-- actually chosen.
-- ---------------------------------------------------------------------------

create table if not exists public.requests (
  id integer primary key generated always as identity,
  requester_id integer not null references public.users (id) on delete cascade,
  title text not null,
  description text not null,
  category public.request_category not null default 'other',
  estimated_cost_cents integer not null default 0
    check (estimated_cost_cents >= 0),
  attachment_path text,
  attachment_name text,
  priority public.request_priority not null default 'normal',
  assigned_department text,
  approval_required boolean not null default true,
  status public.request_status not null default 'submitted',
  ai_suggestion jsonb,
  reviewed_by integer references public.users (id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  created_time timestamptz not null default now(),
  modified_time timestamptz not null default now(),
  constraint requests_title_not_blank check (length(btrim(title)) > 0),
  constraint requests_description_not_blank check (length(btrim(description)) > 0),
  -- A decision must record who made it, and rejection must be explained.
  constraint requests_decision_has_reviewer check (
    status not in ('approved', 'rejected')
    or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint requests_rejection_needs_comment check (
    status <> 'rejected'
    or (review_comment is not null and length(btrim(review_comment)) > 0)
  )
);

create index if not exists requests_requester_idx on public.requests (requester_id);
create index if not exists requests_status_idx on public.requests (status);
create index if not exists requests_category_idx on public.requests (category);
create index if not exists requests_priority_idx on public.requests (priority);
create index if not exists requests_created_idx on public.requests (created_time desc);

-- ---------------------------------------------------------------------------
-- Comments — the conversation a request accumulates while it is handled.
-- ---------------------------------------------------------------------------

create table if not exists public.request_comments (
  id integer primary key generated always as identity,
  request_id integer not null references public.requests (id) on delete cascade,
  author_id integer not null references public.users (id) on delete cascade,
  body text not null,
  created_time timestamptz not null default now(),
  constraint request_comments_body_not_blank check (length(btrim(body)) > 0)
);

create index if not exists request_comments_request_idx
  on public.request_comments (request_id, created_time);

drop trigger if exists requests_touch_modified_time on public.requests;

create trigger requests_touch_modified_time
  before update on public.requests
  for each row execute function public.touch_modified_time();

-- ---------------------------------------------------------------------------
-- Visibility helper
--
-- Defined once and reused by the comment policies, so the rule for "may I see
-- this request" lives in exactly one place. security definer for the same
-- reason as the training helpers: it must read users without re-entering the
-- policies that call it.
-- ---------------------------------------------------------------------------

create or replace function public.can_view_request(request integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.requests r
     where r.id = request
       and (
         r.requester_id = public.current_user_id()
         or public.is_hr_admin()
         or public.is_ceo()
         or public.is_my_team_member(r.requester_id)
       )
  );
$$;

revoke execute on function public.can_view_request(integer) from public;
grant execute on function public.can_view_request(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.requests enable row level security;
alter table public.request_comments enable row level security;

-- A requester sees their own; a HOD sees their team's; HR sees everything.
drop policy if exists requests_select_own on public.requests;

create policy requests_select_own on public.requests
  for select to authenticated
  using (requester_id = public.current_user_id());

drop policy if exists requests_select_team on public.requests;

create policy requests_select_team on public.requests
  for select to authenticated
  using (public.is_my_team_member(requester_id));

drop policy if exists requests_select_hr on public.requests;

create policy requests_select_hr on public.requests
  for select to authenticated
  using (public.is_hr_admin());

-- Staff raise their own requests, and only in an opening state. Approving your
-- own request by choosing the status on insert is what this forbids.
-- The CEO sees every request, read only.
drop policy if exists requests_select_ceo on public.requests;

create policy requests_select_ceo on public.requests
  for select to authenticated
  using (public.is_ceo());

drop policy if exists requests_insert_own on public.requests;

create policy requests_insert_own on public.requests
  for insert to authenticated
  with check (
    requester_id = public.current_user_id()
    and status in ('submitted', 'pending_approval')
    and not public.is_ceo()
  );

-- The requester may still correct a request nobody has picked up yet. Which
-- columns they may touch is limited by enforce_request_update_rules.
drop policy if exists requests_update_own on public.requests;

create policy requests_update_own on public.requests
  for update to authenticated
  using (
    requester_id = public.current_user_id()
    and status in ('submitted', 'pending_approval')
    and not public.is_ceo()
  )
  with check (requester_id = public.current_user_id());

-- Reviewers act on requests they can see. The trigger below limits them to the
-- review columns and stops anyone reviewing their own request.
drop policy if exists requests_update_reviewer on public.requests;

create policy requests_update_reviewer on public.requests
  for update to authenticated
  using (
    (public.is_hr_admin() or public.is_my_team_member(requester_id))
    and not public.is_ceo()
  )
  with check (
    (public.is_hr_admin() or public.is_my_team_member(requester_id))
    and not public.is_ceo()
  );

-- Comments follow the request: if you can see it, you can read and add them.
drop policy if exists request_comments_select on public.request_comments;

create policy request_comments_select on public.request_comments
  for select to authenticated
  using (public.can_view_request(request_id));

drop policy if exists request_comments_insert on public.request_comments;

create policy request_comments_insert on public.request_comments
  for insert to authenticated
  with check (
    author_id = public.current_user_id()
    and public.can_view_request(request_id)
    and not public.is_ceo()
  );

-- ---------------------------------------------------------------------------
-- Update rules
--
-- The policies above decide who may write. This decides what they may write,
-- which is the part a policy cannot express: a requester editing their own
-- request must not be able to approve it, and a reviewer must not be able to
-- rewrite the request they are judging.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_request_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor integer := public.current_user_id();
  is_owner boolean := old.requester_id = actor;
  is_reviewer boolean := public.is_hr_admin()
    or public.is_my_team_member(old.requester_id);
begin
  -- Nobody decides on their own request, whatever role they hold.
  if is_owner and new.status is distinct from old.status
     and new.status in ('approved', 'rejected') then
    raise exception 'A request cannot be approved or rejected by the person who raised it';
  end if;

  if is_owner and not is_reviewer then
    -- The requester may revise the request itself, never the verdict.
    if new.status is distinct from old.status
       and new.status not in ('submitted', 'pending_approval') then
      raise exception 'A requester may not move their request beyond approval';
    end if;

    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_comment := old.review_comment;
    return new;
  end if;

  if is_reviewer then
    -- Reviewers judge; they do not rewrite what they are judging.
    new.title := old.title;
    new.description := old.description;
    new.requester_id := old.requester_id;
    new.estimated_cost_cents := old.estimated_cost_cents;
    new.attachment_path := old.attachment_path;
    new.attachment_name := old.attachment_name;
    new.ai_suggestion := old.ai_suggestion;

    -- A decision stamps itself, so no client can post-date or misattribute one.
    if new.status is distinct from old.status
       and new.status in ('approved', 'rejected') then
      new.reviewed_by := actor;
      new.reviewed_at := now();
    end if;

    return new;
  end if;

  raise exception 'Not permitted to change this request';
end;
$$;

drop trigger if exists requests_enforce_update_rules on public.requests;

create trigger requests_enforce_update_rules
  before update on public.requests
  for each row execute function public.enforce_request_update_rules();

-- ---------------------------------------------------------------------------
-- Privileges. Stated explicitly for the same reason as the training tables:
-- default privileges are a property of the schema and do not survive a rebuild.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.requests to authenticated;
grant select, insert, update, delete on public.request_comments to authenticated;
grant all on public.requests to service_role;
grant all on public.request_comments to service_role;

-- ---------------------------------------------------------------------------
-- Storage: optional proof attached to a request.
--
-- Same path convention as training attachments — <requester_id>/<file> — so the
-- owner check stays a prefix comparison on the first segment.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('request-attachments', 'request-attachments', false)
on conflict (id) do nothing;

drop policy if exists request_attachments_storage_select on storage.objects;

create policy request_attachments_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'request-attachments'
    and (
      public.storage_path_owner(name) = public.current_user_id()
      or public.is_hr_admin()
      or public.is_my_team_member(public.storage_path_owner(name))
    )
  );

drop policy if exists request_attachments_storage_insert on storage.objects;

create policy request_attachments_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'request-attachments'
    and public.storage_path_owner(name) = public.current_user_id()
  );

drop policy if exists request_attachments_storage_delete on storage.objects;

create policy request_attachments_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'request-attachments'
    and public.storage_path_owner(name) = public.current_user_id()
  );


-- ===========================================================================
-- SOURCE: supabase/seed.sql
-- ===========================================================================

-- IRIS demo data.
--
-- 7 departments, 1 HR admin, 4 HODs, 2 staff, 1 CEO. Every account uses the
-- password
-- Password123! — development only.
--
-- Submissions cover 2025 in full and 2026 up to the current month (July),
-- spanning every status: approved, pending HOD, pending HR, returned,
-- rejected, overdue, and nil return. Monthly hours vary widely enough that the
-- compliance dashboard shows genuine spread rather than a flat line.
--
-- public.users.id, public.departments.id and every other key in this schema is
-- generated by the database, so nothing here can name an id up front. Rows are
-- resolved by email for people and by name for departments — the two natural
-- keys the schema already declares unique. The auth.users uuids stay literal:
-- that table belongs to Supabase Auth and keys on uuid, and fixed values make a
-- re-run reuse the same accounts rather than accumulate new ones.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Account creation helper. Writes the auth.users and auth.identities rows that
-- GoTrue needs for email/password sign-in, then the matching profile, and
-- returns the integer id the database assigned that profile.
-- ---------------------------------------------------------------------------

create or replace function public.seed_account(
  p_auth_id uuid,
  p_email text,
  p_full_name text,
  p_designation text,
  p_role public.user_role,
  p_department_name text,
  p_hod_email text,
  p_date_joined date
)
returns integer
language plpgsql
as $$
declare
  v_user_id integer;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', p_auth_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt('Password123!', extensions.gen_salt('bf')),
    now(), now(), now(),
    '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name)
  )
  on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), p_auth_id,
    jsonb_build_object('sub', p_auth_id::text, 'email', p_email),
    'email', p_auth_id::text,
    now(), now(), now()
  )
  on conflict do nothing;

  insert into public.users (
    auth_user_id, full_name, email, designation, date_joined,
    role, department_id, hod_id, is_active
  ) values (
    p_auth_id, p_full_name, p_email, p_designation, p_date_joined,
    p_role,
    (select id from public.departments where name = p_department_name),
    (select id from public.users where email = p_hod_email),
    true
  )
  on conflict (email) do nothing;

  select id into v_user_id from public.users where email = p_email;
  return v_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Departments and people
-- ---------------------------------------------------------------------------

insert into public.departments (name) values
  ('Sales'),
  ('R&D'),
  ('Support'),
  ('HR'),
  ('Finance'),
  ('Support Engineer'),
  ('Admin')
on conflict (name) do nothing;

-- The four HODs are created without a reporting line because they reference
-- each other; the cross-links are set once every row exists.
select public.seed_account(
  '22222222-2222-2222-2222-222222222222', 'ks@irs.com.my',
  'Chng Kok Sheng', 'Head of R&D', 'hod',
  'R&D', null, date '2016-04-11'
);

select public.seed_account(
  '33333333-3333-3333-3333-333333333333', 'joshua@irs.com.my',
  'Joshua', 'Head of Support', 'hod',
  'Support', null, date '2017-02-06'
);

select public.seed_account(
  '44444444-4444-4444-4444-444444444444', 'chen@irs.com.my',
  'Ms. Chen', 'Head of Finance', 'hod',
  'Finance', null, date '2015-09-14'
);

select public.seed_account(
  '55555555-5555-5555-5555-555555555555', 'lee@irs.com.my',
  'Ms. Lee', 'Head of HR', 'hod',
  'HR', null, date '2016-11-21'
);

-- A HOD files a monthly record too, and that record still needs a HOD stage
-- before it reaches HR. They are paired so each is verified by another HOD:
-- the CEO cannot do it, because the CEO approves nothing.
update public.users
   set hod_id = (select id from public.users where email = 'joshua@irs.com.my')
 where email = 'ks@irs.com.my';

update public.users
   set hod_id = (select id from public.users where email = 'ks@irs.com.my')
 where email = 'joshua@irs.com.my';

update public.users
   set hod_id = (select id from public.users where email = 'lee@irs.com.my')
 where email = 'chen@irs.com.my';

update public.users
   set hod_id = (select id from public.users where email = 'chen@irs.com.my')
 where email = 'lee@irs.com.my';

-- Joshua heads four departments; the others head one each.
update public.departments
   set hod_id = (select id from public.users where email = 'ks@irs.com.my')
 where name = 'R&D';

update public.departments
   set hod_id = (select id from public.users where email = 'joshua@irs.com.my')
 where name in ('Support', 'Sales', 'Admin', 'Support Engineer');

update public.departments
   set hod_id = (select id from public.users where email = 'chen@irs.com.my')
 where name = 'Finance';

update public.departments
   set hod_id = (select id from public.users where email = 'lee@irs.com.my')
 where name = 'HR';

-- HR administers the system and sits in the HR department, so their own
-- monthly record is verified by the head of HR before HR approves it.
select public.seed_account(
  '11111111-1111-1111-1111-111111111111', 'hr@irs.com.my',
  'Nurul Aina Binti Rahim', 'HR Manager', 'hr_admin',
  'HR', 'lee@irs.com.my', date '2019-03-04'
);

-- Two staff placeholders. The roster above is heads of department only, and
-- staff are the people the training module is actually for — without at least
-- one, there is no one to demonstrate the main flow as, and no subject for the
-- tests that check an employee cannot see a colleague's records. Rename these
-- to real employees when the roster is known.
select public.seed_account(
  '77777777-7777-7777-7777-777777777777', 'staff.rnd@irs.com.my',
  'Demo Staff (R&D)', 'Software Engineer', 'staff',
  'R&D', 'ks@irs.com.my', date '2022-05-09'
);

select public.seed_account(
  '88888888-8888-8888-8888-888888888888', 'staff.support@irs.com.my',
  'Demo Staff (Support)', 'Support Specialist', 'staff',
  'Support', 'joshua@irs.com.my', date '2023-01-16'
);

-- The CEO reviews and reports. No department and no reporting line, because
-- the CEO neither submits a record nor approves anyone else's.
select public.seed_account(
  '66666666-6666-6666-6666-666666666666', 'polak@irs.com.my',
  'Polak', 'Chief Executive Officer', 'ceo',
  null, null, date '2014-01-06'
);

-- ---------------------------------------------------------------------------
-- Submission generation
--
-- Each person gets a base monthly volume, so the company shows a spread from
-- comfortably above the 48h standard down to below the 36h threshold.
-- ---------------------------------------------------------------------------

-- A real table rather than a temporary one. Temp tables are session-scoped, and
-- the Supabase SQL Editor does not guarantee a single session across a script,
-- so a temp table can vanish before the generator below reads it. Dropped
-- explicitly at the end of this file.
create table public.seed_people (
  idx int,
  id integer,
  base_minutes int,
  catalogue text
);

-- idx drives the deterministic variance below, so it is stated here rather than
-- taken from users.id: the shape of the demo data must not depend on the order
-- the database happened to assign keys in.
insert into public.seed_people (idx, id, base_minutes, catalogue)
select v.idx, u.id, v.base_minutes, v.catalogue
  from (values
    (0, 'ks@irs.com.my',     315, 'lead'),
    (1, 'joshua@irs.com.my', 260, 'lead'),
    (2, 'chen@irs.com.my',   200, 'lead'),
    (3, 'lee@irs.com.my',    170, 'lead'),
    (4, 'staff.rnd@irs.com.my',     290, 'engineering'),
    (5, 'staff.support@irs.com.my', 165, 'support'),
    -- HR records training of its own too.
    (6, 'hr@irs.com.my',            235, 'lead')
  ) as v (idx, email, base_minutes, catalogue)
  join public.users u on u.email = v.email;

do $$
declare
  person record;
  v_hr integer;
  v_year int;
  v_month int;
  v_status public.submission_status;
  v_nil boolean;
  v_minutes int;
  v_submission integer;
  v_submitted timestamptz;
  v_late boolean;
  v_hod integer;
  v_entry_count int;
  v_entry int;
  v_entry_minutes int;
  v_remaining int;
  v_day int;
  v_start timestamptz;
  v_titles text[];
  v_providers text[];
  v_title text;
  v_provider text;
  v_effectiveness public.training_effectiveness;
  v_variance int;
begin
  select id into v_hr from public.users where email = 'hr@irs.com.my';

  for person in select * from public.seed_people order by idx loop

    select hod_id into v_hod from public.users where id = person.id;

    v_titles := case person.catalogue
      when 'engineering' then array[
        'Secure coding practices workshop',
        'PostgreSQL performance tuning',
        'Automated testing with Playwright',
        'Clean architecture in TypeScript',
        'Incident response drill',
        'Accessibility fundamentals for web apps'
      ]
      when 'sales' then array[
        'Consultative selling techniques',
        'CRM pipeline management refresher',
        'Negotiation skills workshop',
        'Product update briefing',
        'Key account planning',
        'Proposal writing clinic'
      ]
      when 'support' then array[
        'Customer service excellence',
        'Ticket triage and escalation',
        'Troubleshooting methodology',
        'Product update briefing',
        'Handling difficult conversations',
        'Knowledge base authoring'
      ]
      else array[
        'Performance management essentials',
        'Coaching and feedback skills',
        'Employment law update',
        'Budget planning workshop',
        'Leading hybrid teams',
        'Data protection and PDPA briefing'
      ]
    end;

    v_providers := array[
      'Internal — IRS Academy',
      'SIRIM Training Services',
      'Coursera',
      'Malaysian Institute of Management',
      'Vendor-led session',
      'Internal — knowledge sharing'
    ];

    for v_year in 2025..2026 loop
      for v_month in 1..12 loop

        -- 2026 has not happened past July.
        exit when v_year = 2026 and v_month > 7;

        v_nil := false;
        v_late := false;
        v_variance := ((person.idx * 7 + v_month * 13) % 5) * 30;
        v_minutes := person.base_minutes + v_variance - 60;

        -- Default: fully processed history.
        v_status := 'approved';

        -- A quiet month with nothing to report.
        if (person.idx + v_month) % 11 = 0 then
          v_nil := true;
          v_minutes := 0;
        end if;

        -- The current year's recent months are still moving through the flow.
        if v_year = 2026 then
          if v_month = 7 then
            -- July 2026 is the current month: every live state is present.
            v_status := case person.idx % 6
              when 0 then 'submitted_pending_hod'
              when 1 then 'hod_verified'
              when 2 then 'draft'
              when 3 then 'submitted_pending_hod'
              when 4 then 'hod_verified'
              else 'draft'
            end;
          elsif v_month = 6 then
            -- June closed on 10 July, so anything unfinished is now overdue.
            v_status := case person.idx % 7
              when 0 then 'returned_by_hod'
              when 1 then 'rejected'
              when 2 then 'draft'
              when 5 then 'submitted_pending_hod'
              else 'approved'
            end;
          elsif v_month = 5 and person.idx % 4 = 1 then
            v_status := 'hod_verified';
          end if;
        end if;

        -- Two people simply never opened a couple of months.
        if v_year = 2026 and v_month = 7 and person.idx in (7, 9) then
          continue;
        end if;

        if v_status = 'draft' then
          v_submitted := null;
        else
          -- Most people file in the first week of the following month.
          v_day := 2 + ((person.idx * 3 + v_month) % 12);
          v_late := v_day > 10;
          v_submitted := make_timestamptz(
            case when v_month = 12 then v_year + 1 else v_year end,
            case when v_month = 12 then 1 else v_month + 1 end,
            v_day, 9 + (person.idx % 8), 15, 0
          );
        end if;

        insert into public.training_submissions (
          employee_id, month, year, status, is_nil_return,
          submitted_at, is_late,
          hod_verified_by, hod_verified_at, hod_comment,
          hr_verified_by, hr_verified_at, hr_comment
        ) values (
          person.id, v_month, v_year, v_status, v_nil,
          v_submitted, v_late,
          case
            when v_status in ('hod_verified', 'approved', 'rejected', 'returned_by_hod')
            then v_hod
          end,
          case
            when v_status in ('hod_verified', 'approved', 'rejected', 'returned_by_hod')
            then v_submitted + interval '2 days'
          end,
          case
            when v_status = 'returned_by_hod'
            then 'The October conference entry has no certificate attached. Please add it and resubmit.'
            when v_status = 'approved' and v_month % 5 = 0
            then 'Good spread of technical and soft-skill training this month.'
          end,
          case
            when v_status in ('approved', 'rejected')
            then v_hr
          end,
          case
            when v_status in ('approved', 'rejected') then v_submitted + interval '4 days'
          end,
          case
            when v_status = 'rejected'
            then 'Recorded hours do not match the attendance sheet. Please correct the duration and resubmit.'
          end
        )
        returning id into v_submission;

        continue when v_nil;

        -- Split the month across one or two entries.
        v_entry_count := case when v_minutes > 240 then 2 else 1 end;
        v_remaining := v_minutes;

        for v_entry in 1..v_entry_count loop
          if v_entry = v_entry_count then
            v_entry_minutes := v_remaining;
          else
            v_entry_minutes := (v_minutes / 2 / 15) * 15;
            v_remaining := v_remaining - v_entry_minutes;
          end if;

          exit when v_entry_minutes <= 0;

          v_title := v_titles[1 + ((person.idx + v_month + v_entry) % array_length(v_titles, 1))];
          v_provider := v_providers[1 + ((person.idx + v_entry) % array_length(v_providers, 1))];
          v_effectiveness := case (person.idx + v_month + v_entry) % 6
            when 0 then 'average'
            when 3 then 'average'
            when 5 then 'not_effective'
            else 'effective'
          end;

          v_day := 3 + ((person.idx * 2 + v_month * 5 + v_entry * 7) % 22);
          v_start := make_timestamptz(v_year, v_month, v_day, 9, 0, 0);

          insert into public.training_records (
            submission_id, seq_no, title,
            start_datetime, end_datetime,
            calculated_minutes, recorded_minutes, override_reason,
            location, trainer_provider, effectiveness, remarks
          ) values (
            v_submission, v_entry, v_title,
            v_start, v_start + make_interval(mins => v_entry_minutes),
            v_entry_minutes, v_entry_minutes, null,
            case (person.idx + v_entry) % 3
              when 0 then 'IRS Training Room, Cyberjaya'
              when 1 then 'Online — Microsoft Teams'
              else 'Client site, Kuala Lumpur'
            end,
            v_provider, v_effectiveness,
            case when v_entry = 1 and v_month % 4 = 0
              then 'Applied to the current sprint work.'
            end
          );
        end loop;

      end loop;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- The multi-day override case from the source workbook.
--
-- A course running 26-27 February, 09:00-17:00 each day, is 16 hours gross.
-- Chng Kok Sheng recorded 14 because the two lunch breaks are not learning.
-- This is the case reviewers must be able to see and question.
-- ---------------------------------------------------------------------------

do $$
declare
  v_submission integer;
  v_next_seq int;
begin
  select s.id into v_submission
    from public.training_submissions s
    join public.users u on u.id = s.employee_id
   where u.email = 'ks@irs.com.my'
     and s.month = 2 and s.year = 2026;

  if v_submission is null then
    return;
  end if;

  select coalesce(max(seq_no), 0) + 1 into v_next_seq
    from public.training_records
   where submission_id = v_submission;

  insert into public.training_records (
    submission_id, seq_no, title,
    start_datetime, end_datetime,
    calculated_minutes, recorded_minutes, override_reason,
    location, trainer_provider, effectiveness, remarks
  ) values (
    v_submission, v_next_seq,
    'Advanced PostgreSQL administration (2 days)',
    make_timestamptz(2026, 2, 26, 9, 0, 0),
    make_timestamptz(2026, 2, 27, 17, 0, 0),
    960, 840,
    'Excludes the one-hour lunch break on each of the two days.',
    'SIRIM Training Centre, Shah Alam',
    'SIRIM Training Services',
    'effective',
    'Certificate issued on completion.'
  );
end;
$$;

-- A second override, so the reviewer view is exercised for more than one person.
do $$
declare
  v_submission integer;
  v_next_seq int;
begin
  select s.id into v_submission
    from public.training_submissions s
    join public.users u on u.id = s.employee_id
   where u.email = 'ks@irs.com.my'
     and s.month = 4 and s.year = 2026;

  if v_submission is null then
    return;
  end if;

  select coalesce(max(seq_no), 0) + 1 into v_next_seq
    from public.training_records
   where submission_id = v_submission;

  insert into public.training_records (
    submission_id, seq_no, title,
    start_datetime, end_datetime,
    calculated_minutes, recorded_minutes, override_reason,
    location, trainer_provider, effectiveness, remarks
  ) values (
    v_submission, v_next_seq,
    'Regional sales kick-off (3 days)',
    make_timestamptz(2026, 4, 14, 9, 0, 0),
    make_timestamptz(2026, 4, 16, 17, 0, 0),
    1440, 990,
    'Excludes lunch breaks and the social programme on the final afternoon.',
    'Hotel Istana, Kuala Lumpur',
    'Internal — IRS Academy',
    'effective',
    null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed the audit trail so the HR activity feed is not empty on first run.
-- ---------------------------------------------------------------------------

insert into public.automation_logs (
  action_type, description, related_table, related_id, performed_by, is_system, created_time
)
select
  case s.status
    when 'approved' then 'submission.approved'
    when 'rejected' then 'submission.rejected'
    when 'hod_verified' then 'submission.hod_verified'
    when 'returned_by_hod' then 'submission.returned'
    else 'submission.submitted'
  end,
  format(
    '%s — %s %s',
    p.full_name,
    to_char(make_date(s.year, s.month, 1), 'FMMonth'),
    s.year
  ),
  'training_submissions',
  s.id,
  coalesce(s.hr_verified_by, s.hod_verified_by, s.employee_id),
  false,
  coalesce(s.hr_verified_at, s.hod_verified_at, s.submitted_at, s.created_time)
from public.training_submissions s
join public.users p on p.id = s.employee_id
where s.status <> 'draft';

drop table public.seed_people;

drop function public.seed_account(
  uuid, text, text, text, public.user_role, text, text, date
);

-- ---------------------------------------------------------------------------
-- Requests — prototype module demo data.
--
-- Ten requests spanning every status, category and priority, so the list
-- filters and the dashboard tiles have a real spread to show. Costs are stored
-- in cents: RM 890.00 is 89000.
-- ---------------------------------------------------------------------------

insert into public.requests (
  requester_id, title, description, category, estimated_cost_cents,
  attachment_name, priority, assigned_department, approval_required, status,
  ai_suggestion, reviewed_by, reviewed_at, review_comment, created_time
) values
  ((select id from public.users where email = 'ks@irs.com.my'),
   'Second monitor for development work',
   'I need a new monitor because my current monitor is too small for reviewing code side by side.',
   'it_equipment', 89000, null, 'normal', 'IT', true, 'approved',
   '{"category":"it_equipment","department":"IT","priority":"normal","approvalRequired":true,"reason":"Equipment purchase usually requires manager or admin approval."}'::jsonb,
   (select id from public.users where email = 'hr@irs.com.my'),
   now() - interval '26 days', 'Approved. Collect from the IT store room.',
   now() - interval '28 days'),

  ((select id from public.users where email = 'joshua@irs.com.my'),
   'Laptop will not power on',
   'My laptop is broken and will not start, I cannot work until it is repaired.',
   'it_equipment', 0, 'fault-report.pdf', 'urgent', 'IT', true, 'completed',
   '{"category":"it_equipment","department":"IT","priority":"urgent","approvalRequired":true,"reason":"Wording suggests work is blocked, so this is raised as urgent."}'::jsonb,
   (select id from public.users where email = 'hr@irs.com.my'),
   now() - interval '20 days', 'Replacement unit issued while the board is repaired.',
   now() - interval '21 days'),

  ((select id from public.users where email = 'chen@irs.com.my'),
   'Ergonomic chair replacement',
   'My chair is damaged and the back support no longer holds position.',
   'office_furniture', 65000, null, 'high', 'Admin', true, 'in_progress',
   '{"category":"office_furniture","department":"Admin","priority":"high","approvalRequired":true,"reason":"Replacement of damaged furniture is treated as high priority."}'::jsonb,
   (select id from public.users where email = 'hr@irs.com.my'),
   now() - interval '9 days', 'Approved, waiting on the supplier delivery.',
   now() - interval '12 days'),

  ((select id from public.users where email = 'lee@irs.com.my'),
   'JetBrains licence for backend work',
   'Please install and license the JetBrains IDE on my workstation.',
   'software', 74000, null, 'normal', 'IT', true, 'pending_approval',
   '{"category":"software","department":"IT","priority":"normal","approvalRequired":true,"reason":"Software licences are purchased centrally and need approval."}'::jsonb,
   null, null, null, now() - interval '4 days'),

  ((select id from public.users where email = 'ks@irs.com.my'),
   'Name cards for client visits',
   'I need business cards printed with my new designation for upcoming client visits.',
   'name_card', 12000, null, 'normal', 'Admin', true, 'approved',
   '{"category":"name_card","department":"Admin","priority":"normal","approvalRequired":true,"reason":"Printed stationery is ordered by Admin in batches."}'::jsonb,
   (select id from public.users where email = 'hr@irs.com.my'),
   now() - interval '6 days', 'Approved, going out with the next print batch.',
   now() - interval '8 days'),

  ((select id from public.users where email = 'joshua@irs.com.my'),
   'Access card not opening the back door',
   'My access card has stopped working on the rear entrance, I have an access issue every morning.',
   'access_card', 0, null, 'high', 'Admin', false, 'in_progress',
   '{"category":"access_card","department":"Admin","priority":"high","approvalRequired":false,"reason":"Access problems are handled directly by Admin without a purchase approval."}'::jsonb,
   null, null, null, now() - interval '3 days'),

  ((select id from public.users where email = 'chen@irs.com.my'),
   'Air conditioning in the support room',
   'The aircond in the support area is not cooling and needs maintenance.',
   'maintenance', 0, null, 'high', 'Facilities', false, 'submitted',
   '{"category":"maintenance","department":"Facilities","priority":"high","approvalRequired":false,"reason":"Building maintenance is raised directly with Facilities."}'::jsonb,
   null, null, null, now() - interval '1 day'),

  ((select id from public.users where email = 'lee@irs.com.my'),
   'Standing desk converter',
   'A standing desk converter would be nice to have for the afternoons.',
   'office_furniture', 45000, null, 'low', 'Admin', true, 'rejected',
   '{"category":"office_furniture","department":"Admin","priority":"low","approvalRequired":true,"reason":"Described as nice to have, so raised at low priority."}'::jsonb,
   (select id from public.users where email = 'hr@irs.com.my'),
   now() - interval '14 days',
   'Not in this quarter budget. Please raise again in the next cycle.',
   now() - interval '16 days'),

  ((select id from public.users where email = 'ks@irs.com.my'),
   'Stationery for the sprint board',
   'Whiteboard markers, sticky notes and index cards for the team planning wall.',
   'office_equipment', 8500, null, 'low', 'Admin', false, 'completed',
   '{"category":"office_equipment","department":"Admin","priority":"low","approvalRequired":false,"reason":"Low value consumables are handled by Admin without approval."}'::jsonb,
   null, null, null, now() - interval '30 days'),

  ((select id from public.users where email = 'ks@irs.com.my'),
   'Printer in the meeting room jams constantly',
   'The meeting room printer jams on every second job and needs repair.',
   'it_equipment', 0, null, 'high', 'IT', true, 'pending_approval',
   '{"category":"it_equipment","department":"IT","priority":"high","approvalRequired":true,"reason":"Repair work is raised at high priority."}'::jsonb,
   null, null, null, now() - interval '2 days');

-- A short conversation on the requests still being handled.
insert into public.request_comments (request_id, author_id, body, created_time)
select r.id, (select id from public.users where email = 'hr@irs.com.my'),
       'Supplier quoted two weeks. I will update once it ships.',
       now() - interval '8 days'
  from public.requests r where r.title = 'Ergonomic chair replacement';

insert into public.request_comments (request_id, author_id, body, created_time)
select r.id, r.requester_id,
       'Thank you. The current chair is usable in the meantime.',
       now() - interval '7 days'
  from public.requests r where r.title = 'Ergonomic chair replacement';

insert into public.request_comments (request_id, author_id, body, created_time)
select r.id, (select id from public.users where email = 'hr@irs.com.my'),
       'Raised with the building manager, they are attending this week.',
       now() - interval '2 days'
  from public.requests r where r.title = 'Access card not opening the back door';

-- Matching audit trail, so the log is not empty for the requests module.
insert into public.automation_logs (
  action_type, description, related_table, related_id, performed_by,
  is_system, created_time
)
select
  case r.status
    when 'approved' then 'request.approved'
    when 'rejected' then 'request.rejected'
    when 'in_progress' then 'request.in_progress'
    when 'completed' then 'request.completed'
    else 'request.submitted'
  end,
  format('%s — %s', u.full_name, r.title),
  'requests',
  r.id,
  coalesce(r.reviewed_by, r.requester_id),
  false,
  coalesce(r.reviewed_at, r.created_time)
from public.requests r
join public.users u on u.id = r.requester_id;

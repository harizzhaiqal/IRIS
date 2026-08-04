-- IRIS: Employee Training Records module — core schema.
-- Replaces form IRS-HR-F14 (Employee Training Record & Evaluation).
--
-- Every table in this schema keys on `id integer generated always as identity`,
-- so ids read 1, 2, 3, 4. The one uuid left in the design is
-- users.auth_user_id: it points at auth.users, which Supabase Auth owns and
-- keys by uuid, so that column carries the credential link while public.profiles
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

create table public.profiles (
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
  hod_id integer references public.profiles (id) on delete set null,
  is_active boolean not null default true,
  created_time timestamptz not null default now()
);

alter table public.departments
  add constraint departments_hod_id_fkey
  foreign key (hod_id) references public.profiles (id) on delete set null;

-- Every request resolves auth.uid() to this row, so the lookup is indexed by
-- the unique constraint above; these cover the reporting-line queries.
create index profiles_department_id_idx on public.profiles (department_id);
create index profiles_hod_id_idx on public.profiles (hod_id);
create index profiles_role_idx on public.profiles (role);

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
  updated_by integer references public.profiles (id) on delete set null,
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
  employee_id integer not null references public.profiles (id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2100),
  status public.submission_status not null default 'draft',
  is_nil_return boolean not null default false,
  submitted_at timestamptz,
  is_late boolean not null default false,
  hod_verified_by integer references public.profiles (id) on delete set null,
  hod_verified_at timestamptz,
  hod_comment text,
  hr_verified_by integer references public.profiles (id) on delete set null,
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
  performed_by integer references public.profiles (id) on delete set null,
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

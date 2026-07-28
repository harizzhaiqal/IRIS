-- IRIS: Employee Training Records module — core schema.
-- Replaces form IRS-HR-F14 (Employee Training Record & Evaluation).

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('staff', 'hod', 'hr_admin');

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
-- Departments and profiles
--
-- departments.hod_id and profiles.department_id reference each other, so the
-- FKs are added after both tables exist.
-- ---------------------------------------------------------------------------

create table public.departments (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  hod_id uuid,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  designation text,
  date_joined date,
  role public.user_role not null default 'staff',
  department_id uuid references public.departments (id) on delete set null,
  hod_id uuid references public.profiles (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.departments
  add constraint departments_hod_id_fkey
  foreign key (hod_id) references public.profiles (id) on delete set null;

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
  id boolean primary key default true,
  monthly_standard_hours integer not null default 4,
  yearly_standard_hours integer not null default 48,
  yearly_threshold_hours integer not null default 36,
  submission_deadline_day integer not null default 10,
  reminder_enabled boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint app_settings_single_row check (id),
  constraint app_settings_deadline_day_valid
    check (submission_deadline_day between 1 and 28)
);

insert into public.app_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- Training submissions — one per employee per month.
-- ---------------------------------------------------------------------------

create table public.training_submissions (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2100),
  status public.submission_status not null default 'draft',
  is_nil_return boolean not null default false,
  submitted_at timestamptz,
  is_late boolean not null default false,
  hod_verified_by uuid references public.profiles (id) on delete set null,
  hod_verified_at timestamptz,
  hod_comment text,
  hr_verified_by uuid references public.profiles (id) on delete set null,
  hr_verified_at timestamptz,
  hr_comment text,
  total_minutes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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

create table public.training_records (
  id uuid primary key default uuid_generate_v4(),
  submission_id uuid not null
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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
  id uuid primary key default uuid_generate_v4(),
  training_record_id uuid not null
    references public.training_records (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_size integer not null default 0,
  uploaded_at timestamptz not null default now()
);

create index training_attachments_record_idx
  on public.training_attachments (training_record_id);

-- ---------------------------------------------------------------------------
-- Automation log — audit trail for every state-changing action.
-- ---------------------------------------------------------------------------

create table public.automation_logs (
  id uuid primary key default uuid_generate_v4(),
  action_type text not null,
  description text,
  related_table text,
  related_id uuid,
  performed_by uuid references public.profiles (id) on delete set null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create index automation_logs_related_idx
  on public.automation_logs (related_table, related_id);
create index automation_logs_created_at_idx
  on public.automation_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger training_submissions_touch_updated_at
  before update on public.training_submissions
  for each row execute function public.touch_updated_at();

create trigger training_records_touch_updated_at
  before update on public.training_records
  for each row execute function public.touch_updated_at();

-- Keeps training_submissions.total_minutes in step with its child records.
-- Owned by the database so no application path can leave the total stale.
create or replace function public.recalculate_submission_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_submission uuid := coalesce(new.submission_id, old.submission_id);
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

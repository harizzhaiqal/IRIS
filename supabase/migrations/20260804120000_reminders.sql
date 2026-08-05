-- IRIS: HR-managed recurring email reminders.
--
-- Reminder definitions are edited through the application by HR. Delivery is
-- performed by a service-role Edge Function, so runs and recipient history are
-- readable by HR but cannot be forged or amended from a browser.

create type public.reminder_audience as enum (
  'all_active_employees',
  'incomplete_training'
);

create type public.reminder_run_status as enum (
  'pending',
  'processing',
  'completed',
  'partial',
  'failed'
);

create type public.reminder_delivery_status as enum (
  'pending',
  'processing',
  'accepted',
  'delivered',
  'failed',
  'unknown',
  'skipped'
);

create table public.reminder_schedules (
  id integer primary key generated always as identity,
  name text not null,
  is_enabled boolean not null default false,
  day_of_month integer not null default 28,
  send_time time without time zone not null default '09:00',
  timezone text not null default 'Asia/Kuala_Lumpur',
  audience public.reminder_audience not null default 'all_active_employees',
  target_roles public.user_role[] not null
    default array['staff', 'hod']::public.user_role[],
  subject text not null,
  body text not null,
  action_label text,
  action_url text,
  reply_to text,
  created_by integer references public.profiles (id) on delete set null,
  updated_by integer references public.profiles (id) on delete set null,
  created_time timestamptz not null default now(),
  modified_time timestamptz not null default now(),
  constraint reminder_schedules_name_length
    check (length(btrim(name)) between 3 and 100),
  -- Restrict the calendar day to one that exists in every month. A future
  -- "last day" option should be explicit rather than giving 29-31 surprising
  -- behaviour in February.
  constraint reminder_schedules_day_valid check (day_of_month between 1 and 28),
  constraint reminder_schedules_timezone_supported
    check (timezone = 'Asia/Kuala_Lumpur'),
  constraint reminder_schedules_roles_present
    check (
      cardinality(target_roles) > 0
      and target_roles <@ array['staff', 'hod']::public.user_role[]
    ),
  constraint reminder_schedules_subject_length
    check (length(btrim(subject)) between 1 and 200),
  constraint reminder_schedules_body_length
    check (length(btrim(body)) between 1 and 5000),
  constraint reminder_schedules_action_label_length
    check (action_label is null or length(btrim(action_label)) between 1 and 60),
  constraint reminder_schedules_action_url_length
    check (
      action_url is null
      or (
        length(action_url) <= 1000
        and (
          action_url ~ '^/'
          or action_url ~* '^https://'
          or action_url ~* '^http://localhost(:[0-9]+)?(/|$)'
        )
      )
    ),
  constraint reminder_schedules_reply_to_length
    check (
      reply_to is null
      or (
        length(reply_to) <= 320
        and reply_to ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      )
    )
);

create index reminder_schedules_due_idx
  on public.reminder_schedules (is_enabled, day_of_month, send_time);

create table public.reminder_runs (
  id integer primary key generated always as identity,
  schedule_id integer not null
    references public.reminder_schedules (id) on delete restrict,
  -- First day of the reminder's month in its configured local timezone.
  period_start date not null,
  scheduled_for timestamptz not null,
  status public.reminder_run_status not null default 'pending',
  audience_snapshot public.reminder_audience not null,
  target_roles_snapshot public.user_role[] not null,
  subject_snapshot text not null,
  body_snapshot text not null,
  action_label_snapshot text,
  action_url_snapshot text,
  reply_to_snapshot text,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_time timestamptz not null default now(),
  constraint reminder_runs_schedule_period_key unique (schedule_id, period_start)
);

create index reminder_runs_status_idx
  on public.reminder_runs (status, scheduled_for);
create index reminder_runs_schedule_idx
  on public.reminder_runs (schedule_id, period_start desc);

create table public.reminder_deliveries (
  id integer primary key generated always as identity,
  run_id integer not null references public.reminder_runs (id) on delete cascade,
  recipient_profile_id integer references public.profiles (id) on delete set null,
  recipient_name text not null,
  recipient_email text not null,
  status public.reminder_delivery_status not null default 'pending',
  idempotency_key text not null unique,
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_time timestamptz not null default now(),
  modified_time timestamptz not null default now(),
  constraint reminder_deliveries_run_email_key unique (run_id, recipient_email),
  constraint reminder_deliveries_email_present check (length(btrim(recipient_email)) > 3)
);

create index reminder_deliveries_run_status_idx
  on public.reminder_deliveries (run_id, status);

create trigger reminder_deliveries_touch_modified_time
  before update on public.reminder_deliveries
  for each row execute function public.touch_modified_time();

-- Audit ownership fields come from the authenticated caller, never form data.
create or replace function public.prepare_reminder_schedule_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor integer;
begin
  if auth.uid() is not null then
    if not public.is_hr_admin() then
      raise exception 'Only HR can manage reminder schedules';
    end if;

    actor := public.current_user_id();
    new.updated_by := actor;
    if tg_op = 'INSERT' then
      new.created_by := actor;
    else
      new.created_by := old.created_by;
      new.created_time := old.created_time;
    end if;
  end if;

  new.modified_time := now();
  return new;
end;
$$;

create trigger reminder_schedules_prepare_write
  before insert or update on public.reminder_schedules
  for each row execute function public.prepare_reminder_schedule_write();

-- Create a run once for each due schedule and atomically lease work to one
-- worker. Repeated Cron calls therefore catch transient failures without two
-- workers processing the same run concurrently.
create or replace function public.claim_due_reminder_runs(
  p_now timestamptz default now(),
  p_lease_minutes integer default 10
)
returns setof public.reminder_runs
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_lease_minutes < 1 or p_lease_minutes > 30 then
    raise exception 'Lease must be between 1 and 30 minutes';
  end if;

  insert into public.reminder_runs (
    schedule_id, period_start, scheduled_for, status,
    audience_snapshot, target_roles_snapshot,
    subject_snapshot, body_snapshot,
    action_label_snapshot, action_url_snapshot, reply_to_snapshot
  )
  select
    schedule.id,
    due.period_start,
    due.scheduled_for,
    'pending',
    schedule.audience,
    schedule.target_roles,
    schedule.subject,
    schedule.body,
    schedule.action_label,
    schedule.action_url,
    schedule.reply_to
  from public.reminder_schedules schedule
  cross join lateral (
    select
      make_date(
        extract(year from p_now at time zone schedule.timezone)::integer,
        extract(month from p_now at time zone schedule.timezone)::integer,
        1
      ) as period_start
  ) period
  cross join lateral (
    select
      period.period_start,
      (
        (period.period_start + (schedule.day_of_month - 1))::date
        + schedule.send_time
      ) at time zone schedule.timezone as scheduled_for
  ) due
  where schedule.is_enabled
    and due.scheduled_for <= p_now
    and due.scheduled_for > p_now - interval '24 hours'
  on conflict (schedule_id, period_start) do nothing;

  return query
    with candidates as (
      select run.id
      from public.reminder_runs run
      where
        run.status = 'pending'
        or (
          run.status = 'processing'
          and run.lease_expires_at is not null
          and run.lease_expires_at < p_now
          and run.attempt_count < 3
        )
        or (
          run.status in ('partial', 'failed')
          and run.attempt_count < 3
          and run.scheduled_for > p_now - interval '24 hours'
        )
      order by run.scheduled_for, run.id
      for update skip locked
    )
    update public.reminder_runs run
       set status = 'processing',
           attempt_count = run.attempt_count + 1,
           lease_expires_at = p_now + make_interval(mins => p_lease_minutes),
           started_at = coalesce(run.started_at, p_now),
           last_error = null
      from candidates
     where run.id = candidates.id
    returning run.*;
end;
$$;

revoke execute on function public.claim_due_reminder_runs(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_reminder_runs(timestamptz, integer)
  to service_role;

alter table public.reminder_schedules enable row level security;
alter table public.reminder_runs enable row level security;
alter table public.reminder_deliveries enable row level security;

create policy reminder_schedules_select_hr on public.reminder_schedules
  for select to authenticated using (public.is_hr_admin());
create policy reminder_schedules_insert_hr on public.reminder_schedules
  for insert to authenticated with check (public.is_hr_admin());
create policy reminder_schedules_update_hr on public.reminder_schedules
  for update to authenticated
  using (public.is_hr_admin()) with check (public.is_hr_admin());

create policy reminder_runs_select_hr on public.reminder_runs
  for select to authenticated using (public.is_hr_admin());
create policy reminder_deliveries_select_hr on public.reminder_deliveries
  for select to authenticated using (public.is_hr_admin());

-- Tables created after the original default-privilege declarations normally
-- inherit these grants, but explicit grants keep this migration portable.
grant select, insert, update on public.reminder_schedules to authenticated;
grant select on public.reminder_runs, public.reminder_deliveries to authenticated;
grant all on public.reminder_schedules, public.reminder_runs,
  public.reminder_deliveries to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Safe default: HR reviews the content and sends a test before enabling it.
insert into public.reminder_schedules (
  name, is_enabled, day_of_month, send_time, timezone, audience, target_roles,
  subject, body, action_label, action_url
) values (
  'Monthly training record reminder',
  false,
  28,
  '09:00',
  'Asia/Kuala_Lumpur',
  'all_active_employees',
  array['staff', 'hod']::public.user_role[],
  'Monthly reminder: Update your training record for {{month_name}}',
  E'Hi {{full_name}},\n\nThis is a friendly reminder to update and submit your Employee Training Record for {{month_name}} in IRIS.\n\nPlease complete the record before {{deadline_date}}. If you have already submitted it, no further action is required.\n\nThank you,\nHR Department',
  'Open IRIS',
  '/training'
);

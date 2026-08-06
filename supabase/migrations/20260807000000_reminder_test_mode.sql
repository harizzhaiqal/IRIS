-- IRIS reminder Test mode.
--
-- Automatic test runs exercise the same Cron and Edge Function path as a live
-- reminder, but select only the HR administrator who last saved the schedule.
-- Test and live runs have separate monthly uniqueness, so testing does not use
-- up the real company-wide send for that month.

alter table public.reminder_schedules
  add column is_test_mode boolean not null default false,
  add column test_recipient_profile_id integer
    references public.profiles (id) on delete set null;

alter table public.reminder_schedules
  add constraint reminder_schedules_test_recipient_present
    check (not is_test_mode or test_recipient_profile_id is not null);

-- The browser never chooses an arbitrary Test mode recipient. The database
-- pins it to the authenticated HR administrator performing the save.
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
    new.test_recipient_profile_id := case when new.is_test_mode then actor end;
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

alter table public.reminder_runs
  add column is_test_mode_snapshot boolean not null default false,
  add column test_recipient_profile_id_snapshot integer
    references public.profiles (id) on delete set null;

alter table public.reminder_runs
  drop constraint reminder_runs_schedule_period_key;

alter table public.reminder_runs
  add constraint reminder_runs_test_recipient_present
    check (
      not is_test_mode_snapshot
      or test_recipient_profile_id_snapshot is not null
    ),
  add constraint reminder_runs_schedule_period_mode_key
    unique (schedule_id, period_start, is_test_mode_snapshot);

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
    is_test_mode_snapshot, test_recipient_profile_id_snapshot,
    audience_snapshot, target_roles_snapshot,
    subject_snapshot, body_snapshot,
    action_label_snapshot, action_url_snapshot, reply_to_snapshot
  )
  select
    schedule.id,
    due.period_start,
    due.scheduled_for,
    'pending',
    schedule.is_test_mode,
    case when schedule.is_test_mode then schedule.test_recipient_profile_id end,
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
  on conflict (schedule_id, period_start, is_test_mode_snapshot) do nothing;

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

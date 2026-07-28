-- IRIS demo data.
--
-- 3 departments, 1 HR admin, 2 HODs, 8 staff. Every account uses the password
-- Password123! — development only.
--
-- Submissions cover 2025 in full and 2026 up to the current month (July),
-- spanning every status: approved, pending HOD, pending HR, returned,
-- rejected, overdue, and nil return. Monthly hours vary widely enough that the
-- compliance dashboard shows genuine spread rather than a flat line.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Account creation helper. Writes the auth.users and auth.identities rows that
-- GoTrue needs for email/password sign-in, then the matching profile.
-- ---------------------------------------------------------------------------

create or replace function public.seed_account(
  p_id uuid,
  p_email text,
  p_full_name text,
  p_designation text,
  p_role public.user_role,
  p_department_id uuid,
  p_hod_id uuid,
  p_date_joined date
)
returns uuid
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
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
    gen_random_uuid(), p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email),
    'email', p_id::text,
    now(), now(), now()
  )
  on conflict do nothing;

  insert into public.profiles (
    id, full_name, email, designation, date_joined,
    role, department_id, hod_id, is_active
  ) values (
    p_id, p_full_name, p_email, p_designation, p_date_joined,
    p_role, p_department_id, p_hod_id, true
  )
  on conflict (id) do nothing;

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Departments and people
-- ---------------------------------------------------------------------------

insert into public.departments (id, name) values
  ('dddddddd-0000-0000-0000-000000000001', 'Software Development'),
  ('dddddddd-0000-0000-0000-000000000002', 'Sales'),
  ('dddddddd-0000-0000-0000-000000000003', 'Support')
on conflict (id) do nothing;

-- HR first: it has no reporting line of its own.
select public.seed_account(
  '11111111-1111-1111-1111-111111111111', 'hr@irssoftware.test',
  'Nurul Aina Binti Rahim', 'HR Manager', 'hr_admin',
  null, null, date '2019-03-04'
);

-- The HODs are created without a reporting line because they reference each
-- other; the cross-link is set once both rows exist.
select public.seed_account(
  '22222222-2222-2222-2222-222222222222', 'faizal@irssoftware.test',
  'Mohd Faizal Bin Osman', 'Head of Software Development', 'hod',
  'dddddddd-0000-0000-0000-000000000001',
  null, date '2017-06-12'
);

select public.seed_account(
  '33333333-3333-3333-3333-333333333333', 'sharon@irssoftware.test',
  'Sharon Lim Wei Ling', 'Head of Sales and Support', 'hod',
  'dddddddd-0000-0000-0000-000000000002',
  null, date '2018-01-22'
);

-- Each HOD verifies the other's own submissions, so a HOD's personal record
-- still passes a HOD stage before it reaches HR.
update public.profiles
   set hod_id = '33333333-3333-3333-3333-333333333333'
 where id = '22222222-2222-2222-2222-222222222222';

update public.profiles
   set hod_id = '22222222-2222-2222-2222-222222222222'
 where id = '33333333-3333-3333-3333-333333333333';

update public.departments
   set hod_id = '22222222-2222-2222-2222-222222222222'
 where id = 'dddddddd-0000-0000-0000-000000000001';

update public.departments
   set hod_id = '33333333-3333-3333-3333-333333333333'
 where id in (
   'dddddddd-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000003'
 );

-- Software Development reports to Faizal.
select public.seed_account(
  '44444444-4444-4444-4444-444444444444', 'aiman@irssoftware.test',
  'Aiman Hakim Bin Zulkifli', 'Senior Software Engineer', 'staff',
  'dddddddd-0000-0000-0000-000000000001',
  '22222222-2222-2222-2222-222222222222', date '2020-02-17'
);

select public.seed_account(
  '55555555-5555-5555-5555-555555555555', 'preetha@irssoftware.test',
  'Preetha Devi A/P Ganesan', 'Software Engineer', 'staff',
  'dddddddd-0000-0000-0000-000000000001',
  '22222222-2222-2222-2222-222222222222', date '2021-08-02'
);

select public.seed_account(
  '66666666-6666-6666-6666-666666666666', 'wenjie@irssoftware.test',
  'Tan Wen Jie', 'QA Engineer', 'staff',
  'dddddddd-0000-0000-0000-000000000001',
  '22222222-2222-2222-2222-222222222222', date '2022-04-11'
);

select public.seed_account(
  '77777777-7777-7777-7777-777777777777', 'syafiq@irssoftware.test',
  'Muhammad Syafiq Bin Ramli', 'Junior Software Engineer', 'staff',
  'dddddddd-0000-0000-0000-000000000001',
  '22222222-2222-2222-2222-222222222222', date '2024-09-16'
);

-- Sales reports to Sharon.
select public.seed_account(
  '88888888-8888-8888-8888-888888888888', 'nadia@irssoftware.test',
  'Nadia Farhana Binti Yusof', 'Account Executive', 'staff',
  'dddddddd-0000-0000-0000-000000000002',
  '33333333-3333-3333-3333-333333333333', date '2021-11-08'
);

select public.seed_account(
  '99999999-9999-9999-9999-999999999999', 'kumar@irssoftware.test',
  'Kumaravel A/L Subramaniam', 'Sales Consultant', 'staff',
  'dddddddd-0000-0000-0000-000000000002',
  '33333333-3333-3333-3333-333333333333', date '2023-03-20'
);

-- Support also reports to Sharon.
select public.seed_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'jasmine@irssoftware.test',
  'Jasmine Chong Mei Yee', 'Support Specialist', 'staff',
  'dddddddd-0000-0000-0000-000000000003',
  '33333333-3333-3333-3333-333333333333', date '2022-07-04'
);

select public.seed_account(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hafiz@irssoftware.test',
  'Ahmad Hafiz Bin Ismail', 'Support Engineer', 'staff',
  'dddddddd-0000-0000-0000-000000000003',
  '33333333-3333-3333-3333-333333333333', date '2023-10-02'
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
  id uuid,
  base_minutes int,
  catalogue text
);

insert into public.seed_people (idx, id, base_minutes, catalogue) values
  (0, '22222222-2222-2222-2222-222222222222', 300, 'lead'),
  (1, '33333333-3333-3333-3333-333333333333', 285, 'lead'),
  (2, '44444444-4444-4444-4444-444444444444', 330, 'engineering'),
  (3, '55555555-5555-5555-5555-555555555555', 255, 'engineering'),
  (4, '66666666-6666-6666-6666-666666666666', 195, 'engineering'),
  (5, '77777777-7777-7777-7777-777777777777', 150, 'engineering'),
  (6, '88888888-8888-8888-8888-888888888888', 270, 'sales'),
  (7, '99999999-9999-9999-9999-999999999999', 165, 'sales'),
  (8, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 240, 'support'),
  (9, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 135, 'support');

-- HR records training of its own too.
insert into public.seed_people (idx, id, base_minutes, catalogue) values
  (10, '11111111-1111-1111-1111-111111111111', 225, 'lead');

do $$
declare
  person record;
  v_year int;
  v_month int;
  v_status public.submission_status;
  v_nil boolean;
  v_minutes int;
  v_submission uuid;
  v_submitted timestamptz;
  v_late boolean;
  v_hod uuid;
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
  for person in select * from public.seed_people order by idx loop

    select hod_id into v_hod from public.profiles where id = person.id;

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
            then '11111111-1111-1111-1111-111111111111'::uuid
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
-- Aiman recorded 14 because the two lunch breaks do not count as learning.
-- This is the case reviewers must be able to see and question.
-- ---------------------------------------------------------------------------

do $$
declare
  v_submission uuid;
  v_next_seq int;
begin
  select id into v_submission
    from public.training_submissions
   where employee_id = '44444444-4444-4444-4444-444444444444'
     and month = 2 and year = 2026;

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
  v_submission uuid;
  v_next_seq int;
begin
  select id into v_submission
    from public.training_submissions
   where employee_id = '88888888-8888-8888-8888-888888888888'
     and month = 4 and year = 2026;

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
  action_type, description, related_table, related_id, performed_by, is_system, created_at
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
  coalesce(s.hr_verified_at, s.hod_verified_at, s.submitted_at, s.created_at)
from public.training_submissions s
join public.profiles p on p.id = s.employee_id
where s.status <> 'draft';

drop table public.seed_people;

drop function public.seed_account(
  uuid, text, text, text, public.user_role, uuid, uuid, date
);

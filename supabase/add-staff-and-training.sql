-- ===========================================================================
-- IRIS — add the 12-person staff roster, and give each of them a training
-- history for January to August 2026.
--
-- Paste the whole file into the Supabase SQL Editor and press Run.
--
-- Two sections, and they must run in this order:
--   1. the people      — creates the auth account, provider link and profile row
--                        directly, so this file does not depend on helper RPCs
--   2. their training  — one submission per month they opened, with entries
--
-- SAFE TO RE-RUN. Section 1 skips anyone already present rather than failing on
-- a duplicate. Section 2 clears January–August 2026 for these twelve people
-- before regenerating it, so the file is the single source of that data — if
-- you have entered training for them by hand in that window, running this again
-- WILL REPLACE IT. Nobody else's records are touched, and no other month is.
--
-- Every account signs in with the password Password123!
--
-- One placeholder to correct: date_joined was not supplied, so it is set to
-- 2026-01-01 for everyone, which is the earliest month with training against
-- it. Edit the roster below if you have the real dates.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The people
--
-- Department names are matched case-insensitively against public.departments,
-- so 'r&D' and 'support engineer' resolve as written. Each person's reporting
-- line is filled in automatically from whoever heads their department — that
-- matters, because a staff member with no HOD has nobody who can verify their
-- monthly record.
-- ---------------------------------------------------------------------------

do $roster$
declare
  person record;
  v_auth_id uuid;
  v_department_id integer;
  v_hod_id integer;
  v_profile_id integer;
  v_created int := 0;
  v_present int := 0;
begin
  for person in
    select * from (values
      ('Hariz Haiqal', 'harizhaiqal@irs.com.my', 'Software Developer',  'R&D',              date '2026-01-01'),
      ('Amyra',        'amyra@irs.com.my',       'Software Developer',  'R&D',              date '2026-01-01'),
      ('Yu Shen Fei',  'fish@irs.com.my',        'Software Developer',  'R&D',              date '2026-01-01'),
      ('Steve',        'steve@irs.com.my',       'Quality Assurance',   'R&D',              date '2026-01-01'),
      ('Isman',        'isman@irs.com.my',       'Customer Support',    'Support',          date '2026-01-01'),
      ('Akmal',        'akmal@irs.com.my',       'Customer Support',    'Support',          date '2026-01-01'),
      ('Soo Peng',     'soopeng@irs.com.my',     'Sales Executive',     'Sales',            date '2026-01-01'),
      ('Jeff',         'jeff@irs.com.my',        'Sales Executive',     'Sales',            date '2026-01-01'),
      ('Ina',          'ina@irs.com.my',         'Admin Executive',     'Admin',            date '2026-01-01'),
      ('Yi Ting',      'yiting@irs.com.my',      'Finance Executive',   'Finance',          date '2026-01-01'),
      ('Lui',          'lui@irs.com.my',         'Support Engineer',    'Support Engineer', date '2026-01-01'),
      ('Qiao Hui',     'qiaohui@irs.com.my',     'HR Executive',        'HR',               date '2026-01-01')
    ) as t (full_name, email, designation, department, date_joined)
  loop
    -- Existing profiles are left untouched so this roster is safe to rerun.
    if exists (
      select 1 from public.profiles p where lower(p.email) = lower(person.email)
    ) then
      v_present := v_present + 1;
      continue;
    end if;

    v_auth_id := gen_random_uuid();
    v_department_id := null;
    v_hod_id := null;
    v_profile_id := null;

    select d.id, d.hod_id
      into v_department_id, v_hod_id
      from public.departments d
     where lower(d.name) = lower(btrim(person.department));

    if v_department_id is null then
      raise exception 'No department named % for %', person.department, person.email
        using hint = 'Check the names in public.departments before running this roster.';
    end if;

    -- A matching Auth account without a profile indicates a partial account.
    -- Stop instead of silently linking or overwriting credentials.
    if exists (
      select 1 from auth.users u where lower(u.email) = lower(person.email)
    ) then
      raise exception 'An Auth account already exists for %, but its profile is missing', person.email
        using hint = 'Repair or remove that partial account, then rerun this file.';
    end if;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000', v_auth_id,
      'authenticated', 'authenticated', lower(btrim(person.email)),
      extensions.crypt('Password123!', extensions.gen_salt('bf')),
      now(), now(), now(),
      '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', btrim(person.full_name))
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_auth_id,
      jsonb_build_object(
        'sub', v_auth_id::text,
        'email', lower(btrim(person.email))
      ),
      'email', v_auth_id::text,
      null, now(), now()
    );

    insert into public.profiles (
      auth_user_id, full_name, email, designation, date_joined,
      role, department_id, hod_id, is_active
    ) values (
      v_auth_id,
      btrim(person.full_name),
      lower(btrim(person.email)),
      nullif(btrim(person.designation), ''),
      person.date_joined,
      'staff'::public.user_role,
      v_department_id,
      v_hod_id,
      true
    )
    returning id into v_profile_id;

    insert into public.automation_logs (
      action_type, description, related_table, related_id, performed_by, is_system
    ) values (
      'profile.created',
      format('%s (%s) added as staff', btrim(person.full_name), lower(btrim(person.email))),
      'profiles', v_profile_id, null, true
    );

    v_created := v_created + 1;
  end loop;

  raise notice 'Roster: % added, % already present.', v_created, v_present;
end
$roster$;

-- ---------------------------------------------------------------------------
-- 2. Their training records, January to August 2026
--
-- The pattern column is deliberately uneven — one character per month, January
-- on the left through August on the right:
--
--   -   the month was never opened at all
--   0   opened and declared a nil return: no training that month
--   1   one training entry
--   2   two training entries
--
-- So some people are comfortably over target, some are borderline, and Jeff and
-- Akmal are clearly under it. That spread is the point: a compliance dashboard
-- where everyone looks identical tells you nothing about whether it works.
--
-- Statuses follow the calendar rather than being uniform. January to June are
-- settled, so mostly approved, with a few that were rejected, sent back, or are
-- still sitting with HR. July was filed but its deadline (the 10th of August)
-- has not passed, so it is mid-flow. August is the current month and is mostly
-- still in draft.
-- ---------------------------------------------------------------------------

do $training$
declare
  person record;
  v_hr integer;
  v_month int;
  v_slot text;
  v_entries int;
  v_nil boolean;
  v_status public.submission_status;
  v_submission integer;
  v_submitted timestamptz;
  v_late boolean;
  v_day int;
  v_entry int;
  v_minutes int;
  v_start timestamptz;
  v_titles text[];
  v_providers text[];
  v_months int := 0;
  v_records int := 0;
begin
  select p.id into v_hr from public.profiles p where p.email = 'hr@irs.com.my';

  v_providers := array[
    'Internal — IRS Academy',
    'SIRIM Training Services',
    'Coursera',
    'Malaysian Institute of Management',
    'Vendor-led session',
    'Internal — knowledge sharing'
  ];

  for person in
    select p.id, p.full_name, p.hod_id, v.idx, v.pattern, v.catalogue
      from (values
        --                                          Jan..Aug
        ( 1, 'harizhaiqal@irs.com.my', '21-10211', 'engineering'),
        ( 2, 'amyra@irs.com.my',       '1-211-0-', 'engineering'),
        ( 3, 'fish@irs.com.my',        '-110212-', 'engineering'),
        ( 4, 'steve@irs.com.my',       '12--11-1', 'qa'),
        ( 5, 'isman@irs.com.my',       '01-1-11-', 'support'),
        ( 6, 'akmal@irs.com.my',       '1-1--2--', 'support'),
        ( 7, 'soopeng@irs.com.my',     '221-1011', 'sales'),
        ( 8, 'jeff@irs.com.my',        '--11--1-', 'sales'),
        ( 9, 'ina@irs.com.my',         '110-1---', 'business'),
        (10, 'yiting@irs.com.my',      '1--21101', 'business'),
        (11, 'lui@irs.com.my',         '211-01--', 'support'),
        (12, 'qiaohui@irs.com.my',     '-1-11-2-', 'business')
      ) as v (idx, email, pattern, catalogue)
      join public.profiles p on lower(p.email) = v.email
     order by v.idx
  loop

    -- Clear this person's January–August 2026 before rebuilding it, so the file
    -- can be run again. Scoped to one person and one window; the audit entries
    -- go first, because related_id is not a foreign key and would otherwise be
    -- left pointing at rows that no longer exist.
    delete from public.automation_logs l
     where l.related_table = 'training_submissions'
       and l.related_id in (
         select s.id from public.training_submissions s
          where s.employee_id = person.id
            and s.year = 2026 and s.month between 1 and 8
       );

    -- training_records cascades from this.
    delete from public.training_submissions s
     where s.employee_id = person.id
       and s.year = 2026 and s.month between 1 and 8;

    v_titles := case person.catalogue
      when 'engineering' then array[
        'Secure coding practices workshop',
        'PostgreSQL performance tuning',
        'Clean architecture in TypeScript',
        'Git branching and code review',
        'Introduction to CI/CD pipelines',
        'Accessibility fundamentals for web apps'
      ]
      when 'qa' then array[
        'Automated testing with Playwright',
        'Test case design techniques',
        'Regression testing strategy',
        'Defect triage and reporting',
        'API testing with Postman',
        'Exploratory testing workshop'
      ]
      when 'support' then array[
        'Customer service excellence',
        'Ticket triage and escalation',
        'Troubleshooting methodology',
        'Product update briefing',
        'Handling difficult conversations',
        'Knowledge base authoring'
      ]
      when 'sales' then array[
        'Consultative selling techniques',
        'CRM pipeline management refresher',
        'Negotiation skills workshop',
        'Product update briefing',
        'Key account planning',
        'Proposal writing clinic'
      ]
      else array[
        'Microsoft Excel intermediate',
        'Data protection and PDPA briefing',
        'Business writing and email etiquette',
        'Time management essentials',
        'Workplace safety briefing',
        'Record keeping and filing standards'
      ]
    end;

    for v_month in 1..8 loop
      v_slot := substr(person.pattern, v_month, 1);

      -- '-' means the month was never opened, so there is no row at all. That
      -- is a different thing from a nil return, and the dashboards count them
      -- differently: one is missing, the other is a declaration.
      continue when v_slot = '-';

      v_nil := (v_slot = '0');
      v_entries := case when v_nil then 0 else v_slot::int end;

      -- ---- Status -----------------------------------------------------------
      if v_month <= 6 then
        -- Settled months. The modulus values are chosen only to make the
        -- exceptions land on different people in different months.
        v_status := case
          when (person.idx * 3 + v_month) % 17 = 0 then 'rejected'
          when (person.idx * 3 + v_month) % 13 = 0 then 'returned_by_hod'
          when (person.idx * 3 + v_month) % 11 = 0 then 'hod_verified'
          else 'approved'
        end;
      elsif v_month = 7 then
        -- Filed, but the 10 August deadline has not passed, so July is still
        -- moving: some with the HOD, some with HR, some not sent yet.
        v_status := case person.idx % 3
          when 0 then 'submitted_pending_hod'
          when 1 then 'hod_verified'
          else 'draft'
        end;
      else
        -- August is the month we are in. Almost nobody has filed it yet.
        v_status := case
          when person.idx % 4 = 0 then 'submitted_pending_hod'
          else 'draft'
        end;
      end if;

      -- A nil return is a declaration the employee makes, so it cannot sit in
      -- draft: saying "no training this month" is itself the submission.
      if v_nil and v_status = 'draft' then
        v_status := 'submitted_pending_hod';
      end if;

      -- ---- When it was filed -------------------------------------------------
      --
      -- Nothing may be dated in the future. July is filed in early August and
      -- August in the first days of the month, both before today.
      if v_status = 'draft' then
        v_submitted := null;
        v_late := false;
      elsif v_month = 8 then
        v_submitted := make_timestamptz(2026, 8, 3, 9 + (person.idx % 6), 20, 0);
        v_late := false;
      elsif v_month = 7 then
        v_submitted := make_timestamptz(2026, 8, 1 + (person.idx % 3), 10, 15, 0);
        v_late := false;
      else
        -- Filed in the following month. Past the 10th counts as late, which is
        -- what puts the "Late" badge on some rows and not others.
        v_day := 2 + ((person.idx * 5 + v_month * 3) % 12);
        v_late := v_day > 10;
        v_submitted := make_timestamptz(
          2026, v_month + 1, v_day, 9 + (person.idx % 7), 30, 0
        );
      end if;

      insert into public.training_submissions (
        employee_id, month, year, status, is_nil_return,
        submitted_at, is_late,
        hod_verified_by, hod_verified_at, hod_comment,
        hr_verified_by, hr_verified_at, hr_comment
      ) values (
        person.id, v_month, 2026, v_status, v_nil,
        v_submitted, v_late,
        case
          when v_status in ('hod_verified', 'approved', 'rejected', 'returned_by_hod')
          then person.hod_id
        end,
        case
          when v_status in ('hod_verified', 'approved', 'rejected', 'returned_by_hod')
          then v_submitted + interval '1 day'
        end,
        case
          when v_status = 'returned_by_hod'
          then 'No certificate attached for this entry. Please add it and resubmit.'
          when v_status = 'approved' and v_month % 4 = 0
          then 'Good mix of technical and soft-skill training this month.'
        end,
        case when v_status in ('approved', 'rejected') then v_hr end,
        case
          when v_status in ('approved', 'rejected')
          then v_submitted + interval '3 days'
        end,
        case
          when v_status = 'rejected'
          then 'Recorded hours do not match the attendance sheet. Please correct and resubmit.'
        end
      )
      returning id into v_submission;

      v_months := v_months + 1;

      -- The audit trail, so the HR activity feed reflects this data too.
      if v_status <> 'draft' then
        insert into public.automation_logs (
          action_type, description, related_table, related_id,
          performed_by, is_system, created_time
        ) values (
          case v_status
            when 'approved' then 'submission.approved'
            when 'rejected' then 'submission.rejected'
            when 'hod_verified' then 'submission.hod_verified'
            when 'returned_by_hod' then 'submission.returned'
            else 'submission.submitted'
          end,
          format('%s — %s 2026', person.full_name,
                 to_char(make_date(2026, v_month, 1), 'FMMonth')),
          'training_submissions', v_submission,
          coalesce(
            case when v_status in ('approved', 'rejected') then v_hr end,
            case
              when v_status in ('hod_verified', 'returned_by_hod')
              then person.hod_id
            end,
            person.id
          ),
          false,
          coalesce(v_submitted, now())
        );
      end if;

      continue when v_nil;

      -- ---- The entries themselves -------------------------------------------
      for v_entry in 1..v_entries loop
        -- 60 to 270 minutes, in half hours. Varied enough that monthly totals
        -- land on both sides of the 4-hour monthly standard.
        v_minutes := 60 + ((person.idx * 37 + v_month * 53 + v_entry * 91) % 8) * 30;

        v_day := 3 + ((person.idx * 2 + v_month * 5 + v_entry * 7) % 20);
        if v_month = 8 then
          -- Same rule as above: no training dated after today.
          v_day := 1 + ((person.idx + v_entry) % 4);
        end if;

        v_start := make_timestamptz(2026, v_month, v_day, 9, 0, 0);

        -- recorded_minutes equals calculated_minutes, so no override reason is
        -- needed. The schema requires one whenever the two differ.
        insert into public.training_records (
          submission_id, seq_no, title,
          start_datetime, end_datetime,
          calculated_minutes, recorded_minutes, override_reason,
          location, trainer_provider, effectiveness, remarks
        ) values (
          v_submission, v_entry,
          v_titles[1 + ((person.idx + v_month + v_entry) % array_length(v_titles, 1))],
          v_start, v_start + make_interval(mins => v_minutes),
          v_minutes, v_minutes, null,
          case (person.idx + v_entry) % 3
            when 0 then 'IRS Training Room'
            when 1 then 'Online — Microsoft Teams'
            else 'Client site, Kuala Lumpur'
          end,
          v_providers[1 + ((person.idx + v_entry) % array_length(v_providers, 1))],
          -- Cast required: a CASE of string literals is text, and Postgres will
          -- not coerce text to an enum inside a VALUES list.
          (case (person.idx + v_month + v_entry) % 6
            when 0 then 'average'
            when 3 then 'average'
            when 5 then 'not_effective'
            else 'effective'
          end)::public.training_effectiveness,
          case when v_entry = 1 and v_month % 3 = 0
            then 'Applied to current work.'
          end
        );

        v_records := v_records + 1;
      end loop;

    end loop;
  end loop;

  raise notice 'Training: % monthly submissions and % entries written for Jan-Aug 2026.',
    v_months, v_records;
end
$training$;

-- ---------------------------------------------------------------------------
-- What was created. Read down the Jan..Aug columns: blank means the month was
-- never opened, "nil" means no training was declared, a number is hours.
-- ---------------------------------------------------------------------------

select
  p.full_name,
  d.name as department,
  h.full_name as reports_to,
  count(s.id) filter (where s.id is not null) as months_opened,
  count(s.id) filter (where s.is_nil_return) as nil_returns,
  count(r.id) as entries,
  round(coalesce(sum(r.recorded_minutes), 0) / 60.0, 1) as total_hours
from public.profiles p
left join public.departments d on d.id = p.department_id
left join public.profiles h on h.id = p.hod_id
left join public.training_submissions s
       on s.employee_id = p.id and s.year = 2026 and s.month between 1 and 8
left join public.training_records r on r.submission_id = s.id
where p.email in (
  'harizhaiqal@irs.com.my', 'amyra@irs.com.my', 'fish@irs.com.my',
  'steve@irs.com.my', 'isman@irs.com.my', 'akmal@irs.com.my',
  'soopeng@irs.com.my', 'jeff@irs.com.my', 'ina@irs.com.my',
  'yiting@irs.com.my', 'lui@irs.com.my', 'qiaohui@irs.com.my'
)
group by p.id, p.full_name, d.name, h.full_name
order by total_hours desc, p.full_name;

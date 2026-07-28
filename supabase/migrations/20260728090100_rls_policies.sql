-- IRIS: row level security, authorization helpers, and workflow enforcement.

-- ---------------------------------------------------------------------------
-- Helper functions
--
-- These are `security definer` so that a policy on `profiles` can read the
-- caller's role without re-entering `profiles` policies. Selecting from
-- profiles inside a profiles policy recurses and takes the whole table down.
-- ---------------------------------------------------------------------------

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
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
create or replace function public.is_my_team_member(employee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = employee and hod_id = auth.uid()
  );
$$;

-- Single place defining who may see a submission, reused by the child tables.
create or replace function public.can_view_submission(submission uuid)
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
         s.employee_id = auth.uid()
         or public.is_my_team_member(s.employee_id)
         or public.is_hr_admin()
       )
  );
$$;

-- A submission is open for employee edits only in these three states.
create or replace function public.can_edit_submission(submission uuid)
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
       and s.employee_id = auth.uid()
       and s.status in ('draft', 'returned_by_hod', 'rejected')
  );
$$;

revoke execute on function public.current_user_role() from public;
revoke execute on function public.is_hr_admin() from public;
revoke execute on function public.is_my_team_member(uuid) from public;
revoke execute on function public.can_view_submission(uuid) from public;
revoke execute on function public.can_edit_submission(uuid) from public;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_hr_admin() to authenticated;
grant execute on function public.is_my_team_member(uuid) to authenticated;
grant execute on function public.can_view_submission(uuid) to authenticated;
grant execute on function public.can_edit_submission(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.app_settings enable row level security;
alter table public.training_submissions enable row level security;
alter table public.training_records enable row level security;
alter table public.training_attachments enable row level security;
alter table public.automation_logs enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

-- Staff names, designations, and departments act as an internal directory:
-- every signed-in user needs them to render HOD names in verification trails
-- and reviewer names on submissions. Reads are open; writes are not.
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (true);

-- A user may maintain their own profile. Role and reporting line are locked
-- down separately by the profiles_guard_privileged_fields trigger.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Only HR administers the staff list.
create policy profiles_all_hr_admin on public.profiles
  for all to authenticated
  using (public.is_hr_admin())
  with check (public.is_hr_admin());

-- Stops a user escalating their own role or reassigning their reporting line
-- through the profiles_update_own policy.
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

  if new.role is distinct from old.role
     or new.hod_id is distinct from old.hod_id
     or new.department_id is distinct from old.department_id
     or new.is_active is distinct from old.is_active then
    raise exception 'Only HR can change role, department, reporting line, or active status';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileged_fields
  before update on public.profiles
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
  using (employee_id = auth.uid());

-- A HOD sees every month belonging to someone who reports to them.
create policy training_submissions_select_team on public.training_submissions
  for select to authenticated
  using (public.is_my_team_member(employee_id));

-- HR sees everything, company-wide.
create policy training_submissions_select_hr on public.training_submissions
  for select to authenticated
  using (public.is_hr_admin());

-- An employee opens their own month, and only as a draft.
create policy training_submissions_insert_own on public.training_submissions
  for insert to authenticated
  with check (employee_id = auth.uid() and status = 'draft');

-- An employee edits their own month only while it is open to them. Which
-- columns they may touch is enforced by enforce_submission_update_rules.
create policy training_submissions_update_own on public.training_submissions
  for update to authenticated
  using (
    employee_id = auth.uid()
    and status in ('draft', 'returned_by_hod', 'rejected')
  )
  with check (employee_id = auth.uid());

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
  using (employee_id = auth.uid() and status = 'draft');

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
  using (public.is_hr_admin());

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
  actor uuid := auth.uid();
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
  if actor is null then
    return new;
  end if;

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
-- Paths are laid out as <employee_id>/<submission_id>/<filename> so the owner
-- check is a prefix comparison on the first path segment.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('training-attachments', 'training-attachments', false)
on conflict (id) do nothing;

-- Owners read their own files; HODs and HR read via the same rules that let
-- them see the submission, which for storage reduces to team membership.
create policy training_attachments_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'training-attachments'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_hr_admin()
      or public.is_my_team_member(((storage.foldername(name))[1])::uuid)
    )
  );

create policy training_attachments_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'training-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy training_attachments_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'training-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

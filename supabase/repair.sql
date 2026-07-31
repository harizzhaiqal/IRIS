-- ===========================================================================
-- IRIS — repair an existing database in place.
--
-- Re-applies every function, policy, trigger and grant. It creates no tables
-- and writes no rows, so YOUR DATA IS NOT TOUCHED. Run it when the app starts
-- failing with errors like:
--
--   relation "public.profiles" does not exist
--   permission denied for table users
--
-- which is what you get after renaming or altering something in the dashboard:
-- Postgres stores function bodies as text and does not rewrite them when a
-- table is renamed, so the functions keep pointing at a name that is gone.
--
-- Use setup.sql instead only when you want a clean rebuild and accept losing
-- everything you have entered.
--
-- GENERATED FILE — do not edit. Change the migrations, then run:
--   npm run sql:repair
-- ===========================================================================

set search_path = public, extensions;

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

drop trigger if exists training_submissions_touch_modified_time on public.training_submissions;

create trigger training_submissions_touch_modified_time
  before update on public.training_submissions
  for each row execute function public.touch_modified_time();

drop trigger if exists training_records_touch_modified_time on public.training_records;

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

drop trigger if exists training_records_recalculate_total on public.training_records;

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

drop trigger if exists training_submissions_nil_return_guard on public.training_submissions;

create trigger training_submissions_nil_return_guard
  before update on public.training_submissions
  for each row when (new.is_nil_return)
  execute function public.enforce_nil_return_is_empty();

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
  );
$$;

revoke execute on function public.current_user_id() from public;

revoke execute on function public.current_user_role() from public;

revoke execute on function public.is_hr_admin() from public;

revoke execute on function public.is_my_team_member(integer) from public;

revoke execute on function public.can_view_submission(integer) from public;

revoke execute on function public.can_edit_submission(integer) from public;

grant execute on function public.current_user_id() to authenticated;

grant execute on function public.current_user_role() to authenticated;

grant execute on function public.is_hr_admin() to authenticated;

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

drop policy if exists users_select_authenticated on public.users;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

-- Staff names, designations, and departments act as an internal directory:
-- every signed-in user needs them to render HOD names in verification trails
-- and reviewer names on submissions. Reads are open; writes are not.
create policy users_select_authenticated on public.users
  for select to authenticated
  using (true);

drop policy if exists users_update_own on public.users;

-- A user may maintain their own profile. Matched on auth_user_id rather than
-- id, so the check reads straight from the JWT with no lookup. Role and
-- reporting line are locked down separately by the
-- users_guard_privileged_fields trigger.
create policy users_update_own on public.users
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

drop policy if exists users_all_hr_admin on public.users;

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

drop trigger if exists users_guard_privileged_fields on public.users;

create trigger users_guard_privileged_fields
  before update on public.users
  for each row execute function public.guard_profile_privileged_fields();

drop policy if exists departments_select_authenticated on public.departments;

-- ---------------------------------------------------------------------------
-- departments — readable by everyone signed in, maintained by HR.
-- ---------------------------------------------------------------------------

create policy departments_select_authenticated on public.departments
  for select to authenticated
  using (true);

drop policy if exists departments_all_hr_admin on public.departments;

create policy departments_all_hr_admin on public.departments
  for all to authenticated
  using (public.is_hr_admin())
  with check (public.is_hr_admin());

drop policy if exists app_settings_select_authenticated on public.app_settings;

-- ---------------------------------------------------------------------------
-- app_settings — everyone reads the targets, only HR changes them.
-- ---------------------------------------------------------------------------

create policy app_settings_select_authenticated on public.app_settings
  for select to authenticated
  using (true);

drop policy if exists app_settings_update_hr_admin on public.app_settings;

create policy app_settings_update_hr_admin on public.app_settings
  for update to authenticated
  using (public.is_hr_admin())
  with check (public.is_hr_admin());

drop policy if exists training_submissions_select_own on public.training_submissions;

-- ---------------------------------------------------------------------------
-- training_submissions
-- ---------------------------------------------------------------------------

-- An employee sees their own months.
create policy training_submissions_select_own on public.training_submissions
  for select to authenticated
  using (employee_id = public.current_user_id());

drop policy if exists training_submissions_select_team on public.training_submissions;

-- A HOD sees every month belonging to someone who reports to them.
create policy training_submissions_select_team on public.training_submissions
  for select to authenticated
  using (public.is_my_team_member(employee_id));

drop policy if exists training_submissions_select_hr on public.training_submissions;

-- HR sees everything, company-wide.
create policy training_submissions_select_hr on public.training_submissions
  for select to authenticated
  using (public.is_hr_admin());

drop policy if exists training_submissions_insert_own on public.training_submissions;

-- An employee opens their own month, and only as a draft.
create policy training_submissions_insert_own on public.training_submissions
  for insert to authenticated
  with check (employee_id = public.current_user_id() and status = 'draft');

drop policy if exists training_submissions_update_own on public.training_submissions;

-- An employee edits their own month only while it is open to them. Which
-- columns they may touch is enforced by enforce_submission_update_rules.
create policy training_submissions_update_own on public.training_submissions
  for update to authenticated
  using (
    employee_id = public.current_user_id()
    and status in ('draft', 'returned_by_hod', 'rejected')
  )
  with check (employee_id = public.current_user_id());

drop policy if exists training_submissions_update_team on public.training_submissions;

-- A HOD acts on their team's submissions; the trigger limits them to the
-- HOD verification columns.
create policy training_submissions_update_team on public.training_submissions
  for update to authenticated
  using (public.is_my_team_member(employee_id))
  with check (public.is_my_team_member(employee_id));

drop policy if exists training_submissions_update_hr on public.training_submissions;

-- HR acts on any submission; the trigger limits them to the HR columns.
create policy training_submissions_update_hr on public.training_submissions
  for update to authenticated
  using (public.is_hr_admin())
  with check (public.is_hr_admin());

drop policy if exists training_submissions_delete_own_draft on public.training_submissions;

-- An employee may discard a month only while it is still a draft.
create policy training_submissions_delete_own_draft on public.training_submissions
  for delete to authenticated
  using (employee_id = public.current_user_id() and status = 'draft');

drop policy if exists training_records_select on public.training_records;

-- ---------------------------------------------------------------------------
-- training_records — visibility follows the parent submission, editing is
-- limited to the owner while the month is open.
-- ---------------------------------------------------------------------------

create policy training_records_select on public.training_records
  for select to authenticated
  using (public.can_view_submission(submission_id));

drop policy if exists training_records_insert_own on public.training_records;

create policy training_records_insert_own on public.training_records
  for insert to authenticated
  with check (public.can_edit_submission(submission_id));

drop policy if exists training_records_update_own on public.training_records;

create policy training_records_update_own on public.training_records
  for update to authenticated
  using (public.can_edit_submission(submission_id))
  with check (public.can_edit_submission(submission_id));

drop policy if exists training_records_delete_own on public.training_records;

create policy training_records_delete_own on public.training_records
  for delete to authenticated
  using (public.can_edit_submission(submission_id));

drop policy if exists training_attachments_select on public.training_attachments;

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

drop policy if exists training_attachments_insert_own on public.training_attachments;

create policy training_attachments_insert_own on public.training_attachments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.training_records r
       where r.id = training_record_id
         and public.can_edit_submission(r.submission_id)
    )
  );

drop policy if exists training_attachments_delete_own on public.training_attachments;

create policy training_attachments_delete_own on public.training_attachments
  for delete to authenticated
  using (
    exists (
      select 1 from public.training_records r
       where r.id = training_record_id
         and public.can_edit_submission(r.submission_id)
    )
  );

drop policy if exists automation_logs_select_hr_admin on public.automation_logs;

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

drop trigger if exists training_submissions_enforce_update_rules on public.training_submissions;

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

drop policy if exists training_attachments_storage_select on storage.objects;

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

drop policy if exists training_attachments_storage_insert on storage.objects;

create policy training_attachments_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'training-attachments'
    and public.storage_path_owner(name) = public.current_user_id()
  );

drop policy if exists training_attachments_storage_delete on storage.objects;

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

drop policy if exists requests_select_own on public.requests;

-- A requester sees their own; a HOD sees their team's; HR sees everything.
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

drop policy if exists requests_insert_own on public.requests;

-- Staff raise their own requests, and only in an opening state. Approving your
-- own request by choosing the status on insert is what this forbids.
create policy requests_insert_own on public.requests
  for insert to authenticated
  with check (
    requester_id = public.current_user_id()
    and status in ('submitted', 'pending_approval')
  );

drop policy if exists requests_update_own on public.requests;

-- The requester may still correct a request nobody has picked up yet. Which
-- columns they may touch is limited by enforce_request_update_rules.
create policy requests_update_own on public.requests
  for update to authenticated
  using (
    requester_id = public.current_user_id()
    and status in ('submitted', 'pending_approval')
  )
  with check (requester_id = public.current_user_id());

drop policy if exists requests_update_reviewer on public.requests;

-- Reviewers act on requests they can see. The trigger below limits them to the
-- review columns and stops anyone reviewing their own request.
create policy requests_update_reviewer on public.requests
  for update to authenticated
  using (public.is_hr_admin() or public.is_my_team_member(requester_id))
  with check (public.is_hr_admin() or public.is_my_team_member(requester_id));

drop policy if exists request_comments_select on public.request_comments;

-- Comments follow the request: if you can see it, you can read and add them.
create policy request_comments_select on public.request_comments
  for select to authenticated
  using (public.can_view_request(request_id));

drop policy if exists request_comments_insert on public.request_comments;

create policy request_comments_insert on public.request_comments
  for insert to authenticated
  with check (
    author_id = public.current_user_id()
    and public.can_view_request(request_id)
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

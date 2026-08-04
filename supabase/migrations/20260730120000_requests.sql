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

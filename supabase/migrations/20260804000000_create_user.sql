-- IRIS: add one person to the system.
--
--   select * from public.create_user('Aiman Hakim', 'aiman@irs.com.my');
--
-- A person is three rows, not one, and getting any of them wrong produces a
-- half-made account that fails in a different place each time:
--
--   auth.users        the credential Supabase Auth signs them in against
--   auth.identities   the email/password provider link GoTrue looks up first;
--                     without it sign-in fails even though the user exists
--   public.profiles   the staff directory row the whole app reads
--
-- Nothing else needs writing. Every other table that references profiles holds
-- activity — submissions, requests, comments — and those rows appear when the
-- person actually does something. An automation_logs entry is written, because
-- the schema records every state-changing action and this is one.
--
-- Run it in the Supabase SQL Editor. It is not granted to `authenticated`:
-- writing auth.users is an administrative act, and this is deliberately not a
-- `security definer` function that any signed-in user could call to mint an
-- account.

-- ---------------------------------------------------------------------------
-- Guard: the seed defines an overlapping helper of its own (seed_account),
-- which takes a fixed uuid so a re-seed reuses the same demo accounts. This one
-- generates the uuid, because a real person has no predetermined key.
-- ---------------------------------------------------------------------------

create or replace function public.create_user(
  p_full_name text,
  p_email text,
  -- Everything below has a working default, so name and email are enough.
  p_role public.user_role default 'staff',
  p_department_name text default null,
  p_designation text default null,
  p_date_joined date default current_date,
  p_password text default 'Password123!',
  -- The reporting line defaults to whoever heads p_department_name. Pass an
  -- email here to override that, or when the person has no department.
  p_hod_email text default null
)
returns table (
  profile_id integer,
  email text,
  full_name text,
  role public.user_role,
  department text,
  reports_to text,
  sign_in_password text
)
language plpgsql
as $$
-- Note on the aliases below: the OUT columns declared above (email, full_name,
-- role, department) are in scope as variables inside this body, so a bare
-- `where email = ...` is ambiguous and Postgres refuses it. Every table in a
-- query here is aliased and every column qualified.
declare
  v_email text := lower(btrim(p_email));
  v_name text := btrim(p_full_name);
  v_auth_id uuid := gen_random_uuid();
  v_department_id integer;
  v_hod_id integer;
  v_profile_id integer;
begin
  -- ---- Validate before writing anything ------------------------------------
  --
  -- All three inserts run in one statement's transaction, so a failure here
  -- leaves nothing behind. Checking up front means the error names the actual
  -- problem rather than surfacing as a constraint violation three tables in.

  if v_name is null or v_name = '' then
    raise exception 'A full name is required';
  end if;

  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid email address is required, got %', coalesce(p_email, '(null)');
  end if;

  if coalesce(btrim(p_password), '') = '' then
    raise exception 'The password cannot be blank';
  end if;

  -- Refused rather than updated. This function is for adding someone; a
  -- duplicate email means either a typo or a person who is already here, and
  -- silently overwriting their profile would be the wrong answer to both.
  if exists (select 1 from public.profiles p where lower(p.email) = v_email) then
    raise exception 'A profile already exists for %', v_email
      using hint = 'Update that profile instead, or use a different address.';
  end if;

  if exists (select 1 from auth.users a where lower(a.email) = v_email) then
    raise exception 'A sign-in account already exists for % but has no profile', v_email
      using hint = 'Delete the orphaned auth.users row, or link it by inserting the profile yourself.';
  end if;

  -- A department named but not found is a typo. Resolving it to null would
  -- quietly create the person outside every department instead.
  if p_department_name is not null then
    select d.id into v_department_id
      from public.departments d
     where lower(d.name) = lower(btrim(p_department_name));

    if v_department_id is null then
      raise exception 'No department named %', p_department_name
        using hint = 'select name from public.departments;';
    end if;
  end if;

  -- The reporting line: an explicit HOD wins, otherwise inherit the head of the
  -- department. This matters more than it looks — verification is matched on
  -- profiles.hod_id, so a staff member with none has nobody who can verify
  -- their monthly record, and it would sit at submitted_pending_hod forever.
  if p_hod_email is not null then
    select h.id into v_hod_id
      from public.profiles h
     where lower(h.email) = lower(btrim(p_hod_email));

    if v_hod_id is null then
      raise exception 'No profile found for the head of department %', p_hod_email;
    end if;
  elsif v_department_id is not null then
    select d.hod_id into v_hod_id
      from public.departments d
     where d.id = v_department_id;
  end if;

  -- ---- 1. The credential ---------------------------------------------------
  --
  -- email_confirmed_at is stamped now: these accounts are created by an
  -- administrator, so there is no confirmation email to wait on, and leaving it
  -- null blocks sign-in with a message that does not explain itself.

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', v_auth_id,
    'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_name)
  );

  -- ---- 2. The provider link ------------------------------------------------
  --
  -- GoTrue resolves an email/password sign-in through auth.identities, not by
  -- scanning auth.users. Omitting this row is the classic half-made account:
  -- the user is visibly there in the dashboard and cannot log in.

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_auth_id,
    jsonb_build_object('sub', v_auth_id::text, 'email', v_email),
    'email', v_auth_id::text,
    null, now(), now()
  );

  -- ---- 3. The staff directory row ------------------------------------------
  --
  -- id is `generated always as identity`, so it is not supplied here: the
  -- database assigns the next integer and returns it.

  insert into public.profiles (
    auth_user_id, full_name, email, designation, date_joined,
    role, department_id, hod_id, is_active
  ) values (
    v_auth_id, v_name, v_email, nullif(btrim(coalesce(p_designation, '')), ''),
    p_date_joined, p_role, v_department_id, v_hod_id, true
  )
  returning id into v_profile_id;

  -- ---- 4. The audit trail --------------------------------------------------
  --
  -- is_system, because this ran against the database rather than through the
  -- UI. current_user_id() is null in the SQL Editor and names the actor if this
  -- is ever called with a session attached.

  insert into public.automation_logs (
    action_type, description, related_table, related_id, performed_by, is_system
  ) values (
    'profile.created',
    format('%s (%s) added as %s', v_name, v_email, p_role),
    'profiles', v_profile_id, public.current_user_id(), true
  );

  if v_hod_id is null and p_role = 'staff' then
    raise notice 'Heads up: % has no head of department, so nobody can verify their monthly training record. Set profiles.hod_id, or pass p_department_name.', v_email;
  end if;

  return query
    select v_profile_id,
           v_email,
           v_name,
           p_role,
           (select d.name from public.departments d where d.id = v_department_id),
           (select h.full_name from public.profiles h where h.id = v_hod_id),
           p_password;
end;
$$;

-- Administrative, and not `security definer`: a signed-in user must not be able
-- to call this and create an account.
revoke execute on function public.create_user(
  text, text, public.user_role, text, text, date, text, text
) from public;

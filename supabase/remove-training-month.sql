-- ===========================================================================
-- IRIS — remove one person's training record for one month.
--
-- Set for: harizhaiqal@irs.com.my, August 2026.
-- Edit the three values at the top of the DO block to use it for anyone else.
--
-- Paste into the Supabase SQL Editor and Run. It reports what it removed in the
-- Notices panel and ends with the person's remaining 2026 months, so you can
-- confirm the right one went.
--
-- THIS DELETES DATA AND CANNOT BE UNDONE. To look before you leap, highlight
-- just the preview query below and run that on its own first.
--
-- The whole month goes: the submission row, its entries, and their attachment
-- records — so the month reads as never opened rather than as an empty draft.
-- If you want to keep the month and empty it instead, see the note at the
-- bottom of this file.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- PREVIEW — highlight from here to the semicolon and run it alone to see what
-- the block below will delete, without deleting anything.
-- ---------------------------------------------------------------------------

select
  s.id            as submission_id,
  s.status,
  s.is_nil_return,
  s.total_minutes,
  r.seq_no,
  r.title,
  r.recorded_minutes,
  a.file_name     as attachment
from public.profiles p
join public.training_submissions s on s.employee_id = p.id
left join public.training_records r on r.submission_id = s.id
left join public.training_attachments a on a.training_record_id = r.id
where lower(p.email) = 'harizhaiqal@irs.com.my'
  and s.month = 8
  and s.year = 2026
order by r.seq_no, a.id;

-- ---------------------------------------------------------------------------
-- THE DELETE
-- ---------------------------------------------------------------------------

do $purge$
declare
  -- Edit these three to target someone or something else.
  v_email text := 'harizhaiqal@irs.com.my';
  v_month int  := 8;
  v_year  int  := 2026;

  v_profile_id integer;
  v_full_name text;
  v_submission_id integer;
  v_record_ids integer[];
  v_attachment_ids integer[];
  v_paths text[];
  v_logs int;
begin
  select p.id, p.full_name
    into v_profile_id, v_full_name
    from public.profiles p
   where lower(p.email) = lower(btrim(v_email));

  -- Named rather than silently matching nothing: a typo in the address would
  -- otherwise look exactly like a month that was already clean.
  if v_profile_id is null then
    raise exception 'No profile found for %', v_email
      using hint = 'select email from public.profiles order by email;';
  end if;

  select s.id
    into v_submission_id
    from public.training_submissions s
   where s.employee_id = v_profile_id
     and s.month = v_month
     and s.year = v_year;

  if v_submission_id is null then
    raise notice 'Nothing to remove — % has no record for % %.',
      v_email, to_char(make_date(v_year, v_month, 1), 'FMMonth'), v_year;
    return;
  end if;

  -- Collected before anything is deleted. The cascade below removes the entries
  -- and attachments for us, but their ids are needed first to find the audit
  -- rows that point at them.
  select coalesce(array_agg(r.id), '{}')
    into v_record_ids
    from public.training_records r
   where r.submission_id = v_submission_id;

  select coalesce(array_agg(a.id), '{}'), coalesce(array_agg(a.file_path), '{}')
    into v_attachment_ids, v_paths
    from public.training_attachments a
   where a.training_record_id = any (v_record_ids);

  -- Audit rows first. automation_logs.related_id is deliberately not a foreign
  -- key — it points at whichever table the action touched — so nothing cleans
  -- these up on its own, and leaving them would strand the HR activity feed on
  -- rows that no longer exist.
  delete from public.automation_logs l
   where (l.related_table = 'training_submissions' and l.related_id = v_submission_id)
      or (l.related_table = 'training_records'     and l.related_id = any (v_record_ids))
      or (l.related_table = 'training_attachments' and l.related_id = any (v_attachment_ids));

  get diagnostics v_logs = row_count;

  -- One delete does the rest: training_records cascades from the submission,
  -- and training_attachments cascades from the records.
  delete from public.training_submissions s where s.id = v_submission_id;

  raise notice 'Removed % % for % (%): 1 submission, % entries, % attachments, % audit rows.',
    to_char(make_date(v_year, v_month, 1), 'FMMonth'), v_year,
    v_full_name, v_email,
    coalesce(array_length(v_record_ids, 1), 0),
    coalesce(array_length(v_attachment_ids, 1), 0),
    v_logs;

  -- The one thing this cannot reach. Storage objects live outside the database,
  -- so deleting the attachment rows leaves the uploaded files behind in the
  -- bucket. Nothing links to them any more, but they still occupy space.
  if coalesce(array_length(v_paths, 1), 0) > 0 then
    raise notice 'Still in the training-attachments bucket, delete there if you want them gone: %',
      array_to_string(v_paths, ', ');
  end if;
end
$purge$;

-- ---------------------------------------------------------------------------
-- CONFIRM — what is left for this person in 2026. August should be absent.
-- ---------------------------------------------------------------------------

select
  s.month,
  to_char(make_date(s.year, s.month, 1), 'FMMonth') as month_name,
  s.status,
  s.is_nil_return,
  count(r.id)                as entries,
  round(s.total_minutes / 60.0, 1) as hours
from public.profiles p
join public.training_submissions s on s.employee_id = p.id
left join public.training_records r on r.submission_id = s.id
where lower(p.email) = 'harizhaiqal@irs.com.my'
  and s.year = 2026
group by s.id, s.month, s.status, s.is_nil_return, s.total_minutes
order by s.month;

-- ---------------------------------------------------------------------------
-- Variant: empty the month but keep it
--
-- Use this instead of the block above if the month should stay open as a draft
-- the employee can add to, rather than disappearing. total_minutes is
-- maintained by a trigger and drops to 0 on its own once the entries go.
--
--   delete from public.training_records r
--    where r.submission_id = (
--      select s.id from public.training_submissions s
--      join public.profiles p on p.id = s.employee_id
--      where lower(p.email) = 'harizhaiqal@irs.com.my'
--        and s.month = 8 and s.year = 2026
--    );
--
--   update public.training_submissions s
--      set status = 'draft', submitted_at = null, is_late = false,
--          is_nil_return = false,
--          hod_verified_by = null, hod_verified_at = null, hod_comment = null,
--          hr_verified_by = null, hr_verified_at = null, hr_comment = null
--     from public.profiles p
--    where p.id = s.employee_id
--      and lower(p.email) = 'harizhaiqal@irs.com.my'
--      and s.month = 8 and s.year = 2026;
-- ---------------------------------------------------------------------------

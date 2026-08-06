-- AI Media Library: searchable metadata in Postgres, video bytes in the
-- existing private Supabase Storage bucket named exactly "AI videos".

create table if not exists public.ai_media_assets (
  id integer generated always as identity primary key,
  uploader_id integer not null references public.profiles(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 160),
  category text not null check (
    category in ('Marketing', 'Internal', 'Sales', 'Training', 'Product', 'Other')
  ),
  description text,
  ai_tags text[] not null default '{}',
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null check (
    mime_type in ('video/mp4', 'video/webm', 'video/quicktime')
  ),
  file_size_bytes bigint not null check (
    file_size_bytes > 0 and file_size_bytes <= 52428800
  ),
  created_time timestamptz not null default now()
);

create index if not exists ai_media_assets_created_time_idx
  on public.ai_media_assets (created_time desc);

create index if not exists ai_media_assets_uploader_id_idx
  on public.ai_media_assets (uploader_id);

alter table public.ai_media_assets enable row level security;

grant select, insert, update, delete on public.ai_media_assets to authenticated;
grant usage, select on sequence public.ai_media_assets_id_seq to authenticated;

drop policy if exists ai_media_assets_select on public.ai_media_assets;
create policy ai_media_assets_select on public.ai_media_assets
  for select to authenticated
  using (true);

drop policy if exists ai_media_assets_insert on public.ai_media_assets;
create policy ai_media_assets_insert on public.ai_media_assets
  for insert to authenticated
  with check (uploader_id = public.current_user_id());

drop policy if exists ai_media_assets_update on public.ai_media_assets;
create policy ai_media_assets_update on public.ai_media_assets
  for update to authenticated
  using (
    uploader_id = public.current_user_id()
    or public.is_hr_admin()
  )
  with check (
    uploader_id = public.current_user_id()
    or public.is_hr_admin()
  );

drop policy if exists ai_media_assets_delete on public.ai_media_assets;
create policy ai_media_assets_delete on public.ai_media_assets
  for delete to authenticated
  using (
    uploader_id = public.current_user_id()
    or public.is_hr_admin()
  );

-- The dashboard may already have created this bucket. ON CONFLICT keeps the
-- migration safe while ensuring the bucket remains private.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'AI videos',
  'AI videos',
  false,
  52428800,
  array['video/mp4', 'video/webm', 'video/quicktime']::text[]
)
on conflict (id) do update
  set name = excluded.name,
      public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ai_videos_storage_select on storage.objects;
create policy ai_videos_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'AI videos');

drop policy if exists ai_videos_storage_insert on storage.objects;
create policy ai_videos_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'AI videos'
    and public.storage_path_owner(name) = public.current_user_id()
  );

drop policy if exists ai_videos_storage_delete on storage.objects;
create policy ai_videos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'AI videos'
    and (
      public.storage_path_owner(name) = public.current_user_id()
      or public.is_hr_admin()
    )
  );

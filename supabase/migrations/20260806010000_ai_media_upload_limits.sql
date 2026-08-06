-- Enforce the limits shown by the Media Library upload dialog on projects
-- where the original AI media migration was already applied.

update storage.buckets
   set public = false,
       file_size_limit = 52428800,
       allowed_mime_types = array[
         'video/mp4',
         'video/webm',
         'video/quicktime'
       ]::text[]
 where id = 'AI videos';

alter table public.ai_media_assets
  drop constraint if exists ai_media_assets_mime_type_check;

alter table public.ai_media_assets
  add constraint ai_media_assets_mime_type_check check (
    mime_type in ('video/mp4', 'video/webm', 'video/quicktime')
  );

alter table public.ai_media_assets
  drop constraint if exists ai_media_assets_file_size_bytes_check;

alter table public.ai_media_assets
  add constraint ai_media_assets_file_size_bytes_check check (
    file_size_bytes > 0 and file_size_bytes <= 52428800
  );

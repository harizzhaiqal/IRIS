-- Run this once in the hosted Supabase SQL Editor after deploying the
-- send-reminders Edge Function. It does not belong in setup.sql because the
-- project URL and random Cron secret are deployment-specific.
--
-- Before running:
--   1. Replace the two values below.
--   2. Add the same random secret to Edge Function Secrets as
--      REMINDER_CRON_SECRET.
--   3. Configure RESEND_API_KEY, REMINDER_FROM_EMAIL, and IRIS_APP_URL in Edge
--      Function Secrets.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

select vault.create_secret(
  'https://f25118bbf665283688986cd5cc018eaf5108a22a568f6cf968c4dd05cdbbf844.supabase.co',
  'reminder_project_url',
  'IRIS project URL used by the reminder Cron job'
);

select vault.create_secret(
  'REPLACE_WITH_A_LONG_RANDOM_SECRET',
  'reminder_cron_secret',
  'Shared secret for the reminder Edge Function'
);

select cron.unschedule('iris-send-reminders')
where exists (select 1 from cron.job where jobname = 'iris-send-reminders');

select cron.schedule(
  'iris-send-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'reminder_project_url'
    ) || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'reminder_cron_secret'
      )
    ),
    body := jsonb_build_object('invoked_at', now())
  );
  $$
);

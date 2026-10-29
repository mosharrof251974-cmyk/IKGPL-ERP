-- Run ONCE in the Supabase SQL editor after deploying the daily-alerts function.
-- Replace <PROJECT-REF>, <ANON-KEY> and <CRON-SECRET> (same value as the CRON_SECRET function secret).
-- 02:00 UTC = 08:00 Asia/Dhaka.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'daily-commercial-alerts',
  '0 2 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/daily-alerts',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer <ANON-KEY>',
                 'x-cron-secret', '<CRON-SECRET>',
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  $$
);

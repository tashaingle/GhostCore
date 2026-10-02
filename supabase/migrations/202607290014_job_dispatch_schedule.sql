-- Phase 19 follow-up: call POST /api/jobs/dispatch every five minutes from Supabase.
-- Vercel Hobby only allows daily crons, and GitHub Actions schedules are best-effort.
--
-- Requires two Vault secrets (set once per environment, never committed):
--   select vault.create_secret('https://your-app.vercel.app', 'ghost_app_url');
--   select vault.create_secret('<BACKGROUND_JOB_SECRET value>', 'ghost_background_job_secret');
-- Without them the scheduled call is a no-op, so local/dev databases are unaffected.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Not in public: functions there are exposed through the PostgREST API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.dispatch_background_jobs()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  job_secret text;
begin
  select decrypted_secret into app_url
    from vault.decrypted_secrets where name = 'ghost_app_url';
  select decrypted_secret into job_secret
    from vault.decrypted_secrets where name = 'ghost_background_job_secret';
  if app_url is null or job_secret is null then
    return null;
  end if;
  -- The dispatcher holds its own distributed locks, so an overlapping call is safe.
  return net.http_post(
    url := rtrim(app_url, '/') || '/api/jobs/dispatch',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || job_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 295000
  );
end;
$$;

revoke all on function private.dispatch_background_jobs() from public, anon, authenticated;

select cron.schedule(
  'ghost-dispatch-jobs',
  '*/5 * * * *',
  $$select private.dispatch_background_jobs()$$
);

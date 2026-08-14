create table if not exists public.automation_jobs (
  job_name text primary key,
  last_started timestamptz,
  last_finished timestamptz,
  status text not null default 'unknown',
  duration_ms integer,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint automation_jobs_status_check
    check (status in ('unknown', 'running', 'success', 'failed'))
);

insert into public.automation_jobs (job_name, status)
values
  ('opportunity_scanner', 'unknown'),
  ('dealer5_sync', 'unknown')
on conflict (job_name) do nothing;

insert into public.automation_jobs (
  job_name,
  last_finished,
  status,
  duration_ms,
  last_error,
  updated_at
)
select
  'opportunity_scanner',
  last_run,
  'success',
  null,
  null,
  now()
from public.scanner_status
where id = 1
on conflict (job_name) do update
set
  last_finished = coalesce(public.automation_jobs.last_finished, excluded.last_finished),
  status = case
    when public.automation_jobs.status = 'unknown' then excluded.status
    else public.automation_jobs.status
  end,
  updated_at = now();

alter table public.automation_jobs enable row level security;
revoke all on table public.automation_jobs from public, anon, authenticated;
grant all on table public.automation_jobs to service_role;

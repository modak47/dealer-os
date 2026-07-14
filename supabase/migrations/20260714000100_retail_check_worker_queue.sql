alter table public.retail_checks
  add column if not exists "Progress Stage" text,
  add column if not exists "Progress Message" text,
  add column if not exists "Progress Percent" integer,
  add column if not exists "Queued At" timestamptz,
  add column if not exists "Processing Started At" timestamptz,
  add column if not exists "Processing Heartbeat At" timestamptz,
  add column if not exists "Completed At" timestamptz,
  add column if not exists "Failed At" timestamptz,
  add column if not exists "Attempt Count" integer not null default 0,
  add column if not exists "Last Error" text,
  add column if not exists "Worker ID" text,
  add column if not exists "Request ID" uuid;

alter table public.retail_checks
  add constraint retail_checks_status_allowed
  check ("Status" in ('Pending','Processing','Checked','Manual Review','Failed','Cancelled'))
  not valid;

alter table public.retail_checks
  validate constraint retail_checks_status_allowed;

alter table public.retail_checks
  add constraint retail_checks_progress_percent_range
  check ("Progress Percent" is null or ("Progress Percent" >= 0 and "Progress Percent" <= 100))
  not valid;

alter table public.retail_checks
  validate constraint retail_checks_progress_percent_range;

update public.retail_checks
set
  "Queued At" = coalesce("Queued At", created_at),
  "Progress Stage" = coalesce("Progress Stage", case when "Status" = 'Checked' then 'Checked' else "Status" end),
  "Progress Percent" = coalesce("Progress Percent", case when "Status" = 'Checked' then 100 when "Status" = 'Pending' then 0 else null end)
where "Queued At" is null
   or "Progress Stage" is null
   or "Progress Percent" is null;

create unique index if not exists retail_checks_request_id_unique
  on public.retail_checks ("Request ID")
  where "Request ID" is not null;

create index if not exists retail_checks_pending_claim_idx
  on public.retail_checks ("Status", "Queued At", created_at, id)
  where "Status" = 'Pending';

create index if not exists retail_checks_processing_heartbeat_idx
  on public.retail_checks ("Status", "Processing Heartbeat At")
  where "Status" = 'Processing';

create or replace function public.touch_retail_checks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists retail_checks_touch_updated_at on public.retail_checks;
create trigger retail_checks_touch_updated_at
before update on public.retail_checks
for each row
execute function public.touch_retail_checks_updated_at();

create or replace function public.claim_next_retail_check(worker_identifier text)
returns public.retail_checks
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.retail_checks;
begin
  update public.retail_checks r
  set
    "Status" = 'Processing',
    "Processing Started At" = coalesce(r."Processing Started At", now()),
    "Processing Heartbeat At" = now(),
    "Worker ID" = worker_identifier,
    "Attempt Count" = coalesce(r."Attempt Count", 0) + 1,
    "Progress Stage" = 'Starting',
    "Progress Message" = 'Retail check worker has started.',
    "Progress Percent" = 5,
    "Last Error" = null,
    "Failed At" = null
  where r.id = (
    select q.id
    from public.retail_checks q
    where q."Status" = 'Pending'
    order by coalesce(q."Queued At", q.created_at), q.created_at, q.id
    for update skip locked
    limit 1
  )
  returning * into claimed;

  return claimed;
end;
$$;

create or replace function public.recover_stale_retail_checks(
  stale_after interval default interval '10 minutes',
  max_attempts integer default 3
)
returns table(recovered_count integer, failed_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  recovered integer := 0;
  failed integer := 0;
begin
  update public.retail_checks r
  set
    "Status" = 'Pending',
    "Progress Stage" = 'Queued',
    "Progress Message" = 'Previous worker stopped before completion. Retrying.',
    "Progress Percent" = 0,
    "Worker ID" = null,
    "Last Error" = left(coalesce(r."Last Error" || E'\n', '') || 'Recovered stale Processing job at ' || now()::text, 1000)
  where r."Status" = 'Processing'
    and coalesce(r."Processing Heartbeat At", r."Processing Started At", r.updated_at, r.created_at) < now() - stale_after
    and coalesce(r."Attempt Count", 0) < max_attempts;

  get diagnostics recovered = row_count;

  update public.retail_checks r
  set
    "Status" = 'Failed',
    "Progress Stage" = 'Failed',
    "Progress Message" = 'Retail check failed after repeated worker interruptions.',
    "Progress Percent" = 100,
    "Failed At" = now(),
    "Worker ID" = null,
    "Last Error" = left(coalesce(r."Last Error" || E'\n', '') || 'Marked failed by stale recovery at ' || now()::text, 1000)
  where r."Status" = 'Processing'
    and coalesce(r."Processing Heartbeat At", r."Processing Started At", r.updated_at, r.created_at) < now() - stale_after
    and coalesce(r."Attempt Count", 0) >= max_attempts;

  get diagnostics failed = row_count;

  return query select recovered, failed;
end;
$$;

revoke all on function public.claim_next_retail_check(text) from public, anon, authenticated;
revoke all on function public.recover_stale_retail_checks(interval, integer) from public, anon, authenticated;
grant execute on function public.claim_next_retail_check(text) to service_role;
grant execute on function public.recover_stale_retail_checks(interval, integer) to service_role;

grant select on table public.retail_checks to authenticated;

drop policy if exists "Authenticated staff can read retail checks" on public.retail_checks;
create policy "Authenticated staff can read retail checks"
on public.retail_checks
for select
to authenticated
using (true);

do $$
begin
  begin
    alter publication supabase_realtime add table public.retail_checks;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end;
$$;

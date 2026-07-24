-- Repair Supabase Advisor RLS warnings caused by live database drift.
-- These tables are accessed by server-side service-role code, except retail_checks
-- which also has an authenticated read policy for realtime progress updates.

alter table if exists public.retail_checks enable row level security;
alter table if exists public.scanner_status enable row level security;
alter table if exists public.buying_opportunities enable row level security;
alter table if exists public.opportunity_activity enable row level security;
alter table if exists public.opportunity_comparables enable row level security;

revoke all on table public.retail_checks from public, anon;
revoke all on table public.scanner_status from public, anon, authenticated;
revoke all on table public.buying_opportunities from public, anon, authenticated;
revoke all on table public.opportunity_activity from public, anon, authenticated;
revoke all on table public.opportunity_comparables from public, anon, authenticated;

grant all on table public.retail_checks to service_role;
grant all on table public.scanner_status to service_role;
grant all on table public.buying_opportunities to service_role;
grant all on table public.opportunity_activity to service_role;
grant all on table public.opportunity_comparables to service_role;

grant select on table public.retail_checks to authenticated;

drop policy if exists "Authenticated staff can read retail checks" on public.retail_checks;
create policy "Authenticated staff can read retail checks"
on public.retail_checks
for select
to authenticated
using (true);

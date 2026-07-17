-- Lightweight count used by opportunity_scanner.py to confirm that all source
-- rows were loaded before destructive stale-opportunity cleanup is allowed.

create or replace function public.get_autotrader_listing_count()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::bigint
  from public.autotrader_listings;
$$;

revoke all on function public.get_autotrader_listing_count() from public;
grant execute on function public.get_autotrader_listing_count() to anon, authenticated, service_role;

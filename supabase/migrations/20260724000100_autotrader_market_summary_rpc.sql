-- Fast top-level figures for the AutoTrader Market Intelligence landing state.
-- Keeps the initial page load from scanning every listing in the Next.js API.

create or replace function public.get_autotrader_market_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with source_rows as (
    select
      lower(nullif(trim(coalesce("Listing Status"::text, '')), '')) as listing_status,
      lower(nullif(trim(coalesce("Dealer or Private"::text, '')), '')) as seller_type,
      nullif(trim(coalesce("Dealer Name"::text, '')), '') as dealer_name,
      nullif(regexp_replace(coalesce("Listed Price"::text, ''), '[^0-9.]', '', 'g'), '') as price_text,
      nullif(regexp_replace(coalesce("Days Live"::text, ''), '[^0-9.]', '', 'g'), '') as days_live_text
    from public.autotrader_listings
  ),
  normalised as (
    select
      listing_status,
      seller_type,
      dealer_name,
      case when price_text ~ '^[0-9]+(\.[0-9]+)?$' then price_text::numeric end as listed_price,
      case when days_live_text ~ '^[0-9]+(\.[0-9]+)?$' then days_live_text::numeric end as days_live
    from source_rows
  )
  select jsonb_build_object(
    'totalRows', count(*)::bigint,
    'activeCount', count(*) filter (where listing_status = 'active')::bigint,
    'removedCount', count(*) filter (where listing_status = 'removed')::bigint,
    'dealerCount', count(distinct dealer_name) filter (where seller_type = 'dealer' and dealer_name is not null)::bigint,
    'averageAskingPrice', avg(listed_price) filter (where listed_price > 0),
    'medianAskingPrice', percentile_cont(0.5) within group (order by listed_price) filter (where listed_price > 0),
    'averageDaysLive', avg(days_live) filter (where days_live is not null)
  )
  from normalised;
$$;

revoke all on function public.get_autotrader_market_summary() from public;
grant execute on function public.get_autotrader_market_summary() to anon, authenticated, service_role;

create or replace function public.get_autotrader_filter_options()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with normalised as (
    select
      lower(nullif(trim(coalesce("Dealer or Private"::text, '')), '')) as seller_type,
      nullif(trim(coalesce("Dealer Name"::text, '')), '') as dealer_name,
      nullif(trim(coalesce("Make"::text, '')), '') as make,
      nullif(trim(coalesce("Model"::text, '')), '') as model,
      nullif(trim(coalesce("Year"::text, '')), '') as listing_year
    from public.autotrader_listings
  )
  select jsonb_build_object(
    'dealerNames',
      coalesce((
        select jsonb_agg(value order by lower(value))
        from (
          select distinct dealer_name as value
          from normalised
          where seller_type = 'dealer' and dealer_name is not null
        ) dealer_values
      ), '[]'::jsonb),
    'makes',
      coalesce((
        select jsonb_agg(value order by lower(value))
        from (
          select distinct make as value
          from normalised
          where make is not null
        ) make_values
      ), '[]'::jsonb),
    'models',
      coalesce((
        select jsonb_agg(value order by lower(value))
        from (
          select distinct model as value
          from normalised
          where model is not null
        ) model_values
      ), '[]'::jsonb),
    'years',
      coalesce((
        select jsonb_agg(value order by value::integer desc)
        from (
          select distinct listing_year as value
          from normalised
          where listing_year ~ '^[0-9]+$'
        ) year_values
      ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_autotrader_filter_options() from public;
grant execute on function public.get_autotrader_filter_options() to anon, authenticated, service_role;

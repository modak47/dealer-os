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

create or replace function public.get_autotrader_filtered_analytics(filters jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with filter_values as (
    select
      nullif(trim(coalesce(filters ->> 'from', '')), '') as date_from,
      nullif(trim(coalesce(filters ->> 'to', '')), '') as date_to,
      lower(nullif(trim(coalesce(filters ->> 'listingStatus', '')), '')) as listing_status_filter,
      lower(nullif(trim(coalesce(filters ->> 'dealerPrivate', '')), '')) as seller_type_filter,
      lower(nullif(trim(coalesce(filters ->> 'dealerName', '')), '')) as dealer_filter,
      lower(nullif(trim(coalesce(filters ->> 'make', '')), '')) as make_filter,
      lower(nullif(trim(coalesce(filters ->> 'model', '')), '')) as model_filter,
      lower(nullif(trim(coalesce(filters ->> 'derivative', '')), '')) as derivative_filter,
      nullif(trim(coalesce(filters ->> 'year', '')), '') as year_filter,
      nullif(regexp_replace(coalesce(filters ->> 'minPrice', ''), '[^0-9.]', '', 'g'), '')::numeric as min_price,
      nullif(regexp_replace(coalesce(filters ->> 'maxPrice', ''), '[^0-9.]', '', 'g'), '')::numeric as max_price,
      nullif(regexp_replace(coalesce(filters ->> 'minMileage', ''), '[^0-9.]', '', 'g'), '')::numeric as min_mileage,
      nullif(regexp_replace(coalesce(filters ->> 'maxMileage', ''), '[^0-9.]', '', 'g'), '')::numeric as max_mileage,
      lower(nullif(trim(coalesce(filters ->> 'location', '')), '')) as location_filter
  ),
  source_rows as (
    select
      lower(nullif(trim(coalesce("Listing Status"::text, '')), '')) as listing_status,
      lower(nullif(trim(coalesce("Dealer or Private"::text, '')), '')) as seller_type,
      nullif(trim(coalesce("Dealer Name"::text, '')), '') as dealer_name,
      lower(nullif(trim(coalesce("Dealer Name"::text, '')), '')) as dealer_name_search,
      nullif(trim(coalesce("Make"::text, '')), '') as make,
      lower(nullif(trim(coalesce("Make"::text, '')), '')) as make_search,
      nullif(trim(coalesce("Model"::text, '')), '') as model,
      lower(nullif(trim(coalesce("Model"::text, '')), '')) as model_search,
      lower(nullif(trim(coalesce("Derivative ID"::text, '')), '')) as derivative_search,
      nullif(trim(coalesce("Year"::text, '')), '') as listing_year,
      lower(nullif(trim(coalesce("Location"::text, '')), '')) as location_search,
      case when nullif(regexp_replace(coalesce("Listed Price"::text, ''), '[^0-9.]', '', 'g'), '') ~ '^[0-9]+(\.[0-9]+)?$'
        then nullif(regexp_replace(coalesce("Listed Price"::text, ''), '[^0-9.]', '', 'g'), '')::numeric
      end as listed_price,
      case when nullif(regexp_replace(coalesce("Mileage"::text, ''), '[^0-9.]', '', 'g'), '') ~ '^[0-9]+(\.[0-9]+)?$'
        then nullif(regexp_replace(coalesce("Mileage"::text, ''), '[^0-9.]', '', 'g'), '')::numeric
      end as mileage,
      case when nullif(regexp_replace(coalesce("Days Live"::text, ''), '[^0-9.]', '', 'g'), '') ~ '^[0-9]+(\.[0-9]+)?$'
        then nullif(regexp_replace(coalesce("Days Live"::text, ''), '[^0-9.]', '', 'g'), '')::numeric
      end as days_live,
      case when nullif(trim(coalesce("Last Seen Date"::text, '')), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        then left(nullif(trim(coalesce("Last Seen Date"::text, '')), ''), 10)::date
      end as last_seen_date
    from public.autotrader_listings
  ),
  filtered as (
    select source_rows.*
    from source_rows
    cross join filter_values
    where (listing_status_filter is null or listing_status = listing_status_filter)
      and (seller_type_filter is null or seller_type = seller_type_filter)
      and (dealer_filter is null or dealer_name_search like '%' || dealer_filter || '%')
      and (make_filter is null or make_search like '%' || make_filter || '%')
      and (model_filter is null or model_search like '%' || model_filter || '%')
      and (derivative_filter is null or derivative_search like '%' || derivative_filter || '%')
      and (year_filter is null or listing_year = year_filter)
      and (min_price is null or listed_price >= min_price)
      and (max_price is null or listed_price <= max_price)
      and (min_mileage is null or mileage >= min_mileage)
      and (max_mileage is null or mileage <= max_mileage)
      and (location_filter is null or location_search like '%' || location_filter || '%')
      and (date_from is null or last_seen_date >= date_from::date)
      and (date_to is null or last_seen_date <= date_to::date)
  ),
  removed_trend as (
    select last_seen_date::text as date, count(*)::bigint as removed
    from filtered
    where listing_status = 'removed' and last_seen_date is not null
    group by last_seen_date
    order by last_seen_date
  ),
  dealer_leaderboard as (
    select dealer_name as name, count(*)::bigint as row_count
    from filtered
    where listing_status = 'removed' and seller_type = 'dealer' and dealer_name is not null
    group by dealer_name
    order by count(*) desc, dealer_name
    limit 20
  ),
  make_model_sold_counts as (
    select trim(concat_ws(' ', make, model)) as name, count(*)::bigint as row_count
    from filtered
    where listing_status = 'removed' and trim(concat_ws(' ', make, model)) <> ''
    group by trim(concat_ws(' ', make, model))
    order by count(*) desc, trim(concat_ws(' ', make, model))
    limit 20
  ),
  active_stock_by_dealer as (
    select dealer_name as name, count(*)::bigint as row_count
    from filtered
    where listing_status = 'active' and seller_type = 'dealer' and dealer_name is not null
    group by dealer_name
    order by count(*) desc, dealer_name
    limit 20
  )
  select jsonb_build_object(
    'totalRows', count(*)::bigint,
    'filteredRows', count(*)::bigint,
    'activeCount', count(*) filter (where listing_status = 'active')::bigint,
    'removedCount', count(*) filter (where listing_status = 'removed')::bigint,
    'dealerCount', count(distinct dealer_name) filter (where seller_type = 'dealer' and dealer_name is not null)::bigint,
    'averageAskingPrice', avg(listed_price) filter (where listed_price > 0),
    'medianAskingPrice', percentile_cont(0.5) within group (order by listed_price) filter (where listed_price > 0),
    'averageDaysLive', avg(days_live) filter (where days_live is not null),
    'dealerLeaderboard', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', row_count) order by row_count desc, name) from dealer_leaderboard), '[]'::jsonb),
    'makeModelSoldCounts', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', row_count) order by row_count desc, name) from make_model_sold_counts), '[]'::jsonb),
    'activeStockByDealer', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', row_count) order by row_count desc, name) from active_stock_by_dealer), '[]'::jsonb),
    'removedTrend', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'removed', removed) order by date) from removed_trend), '[]'::jsonb),
    'sampleLimited', false
  )
  from filtered;
$$;

revoke all on function public.get_autotrader_filtered_analytics(jsonb) from public;
grant execute on function public.get_autotrader_filtered_analytics(jsonb) to anon, authenticated, service_role;

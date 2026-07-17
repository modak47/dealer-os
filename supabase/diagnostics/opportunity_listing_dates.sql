-- Safe diagnostics for Buying Opportunities listing-age mismatches.
-- This query does not modify data.

with joined as (
  select
    bo."Listing ID",
    bo."Days Live" as opportunity_days_live,
    bo.last_seen as opportunity_last_seen,
    coalesce(bo.status, 'New') as workflow_status,
    al."First Seen Date"::timestamptz as listing_first_seen,
    al."Last Seen Date"::timestamptz as listing_last_seen,
    al."Days Live" as listing_days_live,
    al."Listing Status" as listing_status,
    al."Dealer or Private" as seller_type
  from public.buying_opportunities bo
  left join public.autotrader_listings al
    on al."Listing ID" = bo."Listing ID"
)
select
  count(*) as opportunity_rows,
  count(*) filter (where listing_first_seen is null) as missing_source_listing_or_first_seen,
  count(*) filter (
    where listing_status = 'Active'
      and seller_type = 'Private'
  ) as active_private_joined_rows,
  count(*) filter (
    where listing_status is not null
      and (listing_status <> 'Active' or seller_type <> 'Private')
  ) as source_not_active_private_rows,
  count(*) filter (
    where coalesce(workflow_status, 'New') = 'New'
      and listing_first_seen < now() - interval '24 hours'
  ) as workflow_new_but_listing_older_than_24h,
  count(*) filter (
    where opportunity_days_live = 0
      and opportunity_last_seen < now() - interval '24 hours'
  ) as current_ui_days_live_zero_and_opportunity_last_seen_older_than_24h,
  count(*) filter (
    where listing_first_seen > listing_last_seen
  ) as listing_first_seen_after_last_seen
from joined;

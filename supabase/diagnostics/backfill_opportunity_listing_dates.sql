-- Optional compatibility backfill for copied opportunity date fields.
-- The application reads autotrader_listings directly, so this is not required
-- for the UI fix. Run only after reviewing the diagnostic counts.

begin;

update public.buying_opportunities bo
set
  "First Seen Date" = al."First Seen Date"::timestamptz,
  "Days Live" = greatest(
    0,
    (current_date - al."First Seen Date"::date)
  ),
  last_seen = al."Last Seen Date"::timestamptz
from public.autotrader_listings al
where al."Listing ID" = bo."Listing ID"
  and al."Listing Status" = 'Active'
  and al."Dealer or Private" = 'Private'
  and al."First Seen Date" is not null
  and al."Last Seen Date" is not null
  and (
    bo."First Seen Date" is distinct from al."First Seen Date"::timestamptz
    or bo.last_seen is distinct from al."Last Seen Date"::timestamptz
    or bo."Days Live" is distinct from greatest(
      0,
      (current_date - al."First Seen Date"::date)
    )
  );

commit;

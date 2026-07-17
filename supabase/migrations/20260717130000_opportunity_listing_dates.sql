-- Buying Opportunity listing-age semantics:
-- autotrader_listings is the source of truth for advert first/last seen dates.
-- Scanner upserts may still copy those dates onto buying_opportunities for
-- compatibility, but the trigger must not replace advert confirmation with
-- opportunity scanner run time.

comment on column public.buying_opportunities.last_seen is
  'Compatibility copy of autotrader_listings."Last Seen Date" when supplied by the scanner. Do not use as scanner updated_at.';

create or replace function public.protect_opportunity_user_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if current_setting('yesmoto.allow_user_field_update', true) is distinct from 'on' then
    new.seen := old.seen;
    new.notes := old.notes;
    new.status := old.status;
    new.favourite := old.favourite;
    new.hidden := old.hidden;
    new.updated_at := old.updated_at;
    new.last_seen := coalesce(new.last_seen, old.last_seen);
  end if;

  return new;
end;
$$;

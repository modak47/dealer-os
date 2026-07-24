-- Buying Opportunities live-check timestamp:
-- when the scanner upserts an opportunity, last_seen should represent the
-- scanner's latest confirmation that the advert URL is still live.
-- User-managed edits still preserve last_seen.

comment on column public.buying_opportunities.last_seen is
  'Latest time the opportunity scanner confirmed the advert URL was still live.';

create or replace function public.protect_opportunity_user_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.last_seen := now();
    return new;
  end if;

  if current_setting('yesmoto.allow_user_field_update', true) is distinct from 'on' then
    new.seen := old.seen;
    new.notes := old.notes;
    new.status := old.status;
    new.favourite := old.favourite;
    new.hidden := old.hidden;
    new.updated_at := old.updated_at;
    new.last_seen := now();
  else
    new.last_seen := old.last_seen;
  end if;

  return new;
end;
$$;

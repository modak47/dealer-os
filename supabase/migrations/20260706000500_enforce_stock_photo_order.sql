create or replace function public.stock_bikes_enforce_primary_image()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.image_urls is null or jsonb_typeof(new.image_urls) <> 'array' then
    new.image_urls := '[]'::jsonb;
  end if;
  new.primary_image_url := nullif(new.image_urls ->> 0, '');
  return new;
end $$;

drop trigger if exists enforce_stock_bikes_primary_image on public.stock_bikes;
create trigger enforce_stock_bikes_primary_image
before insert or update of image_urls, primary_image_url on public.stock_bikes
for each row execute function public.stock_bikes_enforce_primary_image();

update public.stock_bikes
set primary_image_url = nullif(image_urls ->> 0, '')
where primary_image_url is distinct from nullif(image_urls ->> 0, '');

create table if not exists public.dealer_advert_templates (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique check(section_key in ('advert_overview','vehicle_details','fitted_extras','workshop_preparation','handover','warranty','finance','delivery')),
  enabled_by_default boolean not null default true,
  title text not null,
  default_text text not null default '',
  display_order integer not null default 0,
  editable_per_bike boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.dealer_advert_templates(section_key,title,display_order) values
 ('advert_overview','Advert Overview',10),('vehicle_details','Vehicle Details',20),('fitted_extras','Fitted Extras',30),
 ('workshop_preparation','Workshop Preparation',40),('handover','Handover',50),('warranty','Warranty',60),
 ('finance','Finance',70),('delivery','Delivery',80)
on conflict(section_key) do nothing;

create table if not exists public.dealer_placeholder_images (
  id uuid primary key default gen_random_uuid(), image_url text not null unique,
  enabled boolean not null default true, display_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

do $$ declare table_name text; begin foreach table_name in array array['dealer_advert_templates','dealer_placeholder_images'] loop
 execute format('alter table public.%I enable row level security',table_name);
 execute format('drop policy if exists "Authenticated staff manage settings" on public.%I',table_name);
 execute format('create policy "Authenticated staff manage settings" on public.%I for all to authenticated using(public.crm_staff_can_access()) with check(public.crm_staff_can_access())',table_name);
 execute format('drop trigger if exists %I on public.%I','set_'||table_name||'_updated_at',table_name);
 execute format('create trigger %I before update on public.%I for each row execute function public.crm_set_updated_at()','set_'||table_name||'_updated_at',table_name);
end loop; end $$;

create or replace function public.stock_apply_default_placeholders() returns trigger language plpgsql security definer set search_path='' as $$
declare placeholders jsonb;
begin
 if new.image_urls is null or jsonb_typeof(new.image_urls)<>'array' or jsonb_array_length(new.image_urls)=0 then
   select coalesce(jsonb_agg(image_url order by display_order,id),'[]'::jsonb) into placeholders from public.dealer_placeholder_images where enabled=true and nullif(trim(image_url),'') is not null;
   new.image_urls:=coalesce(placeholders,'[]'::jsonb);
 end if;
 return new;
end $$;
drop trigger if exists apply_stock_placeholder_images on public.stock_bikes;
create trigger apply_stock_placeholder_images before insert or update of image_urls on public.stock_bikes for each row execute function public.stock_apply_default_placeholders();

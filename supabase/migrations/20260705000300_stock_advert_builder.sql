alter table public.stock_bikes
  add column if not exists plate text,
  add column if not exists engine_number text,
  add column if not exists number_of_gears integer,
  add column if not exists previous_owners integer,
  add column if not exists registration_date date,
  add column if not exists display_status text,
  add column if not exists show_on_website boolean not null default false,
  add column if not exists reserve_enabled boolean not null default true,
  add column if not exists reservation_amount numeric(10,2) not null default 99,
  add column if not exists advert_sections jsonb not null default '{}'::jsonb,
  add column if not exists bhp numeric(10,2),
  add column if not exists torque text,
  add column if not exists co2 text,
  add column if not exists road_tax text,
  add column if not exists top_speed text,
  add column if not exists length_mm numeric(10,2),
  add column if not exists width_mm numeric(10,2),
  add column if not exists weight_kg numeric(10,2),
  add column if not exists euro_emissions text,
  add column if not exists hpi_category text;

alter table public.stock_bikes
  drop constraint if exists stock_bikes_advert_sections_is_object,
  add constraint stock_bikes_advert_sections_is_object check (jsonb_typeof(advert_sections) = 'object');

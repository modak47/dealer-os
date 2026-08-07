alter table public.stock_bikes
  add column if not exists autotrader_vehicle_id text,
  add column if not exists autotrader_taxonomy_data jsonb not null default '{}'::jsonb;

alter table public.stock_bikes
  drop constraint if exists stock_bikes_autotrader_taxonomy_data_is_object,
  add constraint stock_bikes_autotrader_taxonomy_data_is_object check (jsonb_typeof(autotrader_taxonomy_data) = 'object');

create index if not exists stock_bikes_autotrader_vehicle_id_idx on public.stock_bikes (autotrader_vehicle_id);
create index if not exists stock_bikes_derivative_id_idx on public.stock_bikes (derivative_id);

alter table public.retail_checks
  add column if not exists "Derivative" text,
  add column if not exists "Derivative ID" text,
  add column if not exists "Auto Trader Vehicle ID" text,
  add column if not exists "Auto Trader Taxonomy Data" jsonb not null default '{}'::jsonb;

alter table public.retail_checks
  drop constraint if exists retail_checks_autotrader_taxonomy_data_is_object,
  add constraint retail_checks_autotrader_taxonomy_data_is_object check (jsonb_typeof("Auto Trader Taxonomy Data") = 'object');

create index if not exists retail_checks_derivative_id_idx on public.retail_checks ("Derivative ID");

alter table public.stock_bikes
  add column if not exists advert_title text,
  add column if not exists stock_number text,
  add column if not exists category text,
  add column if not exists body_style text,
  add column if not exists fuel text,
  add column if not exists transmission text,
  add column if not exists description text,
  add column if not exists service_history text,
  add column if not exists vat_status text,
  add column if not exists specifications jsonb not null default '{}'::jsonb,
  add column if not exists features jsonb not null default '[]'::jsonb,
  add column if not exists pricing jsonb not null default '{}'::jsonb,
  add column if not exists dealer5_data jsonb not null default '{}'::jsonb,
  add column if not exists dealer5_updated_at timestamptz;

alter table public.stock_bikes
  drop constraint if exists stock_bikes_specifications_is_object,
  add constraint stock_bikes_specifications_is_object check (jsonb_typeof(specifications) = 'object'),
  drop constraint if exists stock_bikes_features_is_array,
  add constraint stock_bikes_features_is_array check (jsonb_typeof(features) = 'array'),
  drop constraint if exists stock_bikes_pricing_is_object,
  add constraint stock_bikes_pricing_is_object check (jsonb_typeof(pricing) = 'object'),
  drop constraint if exists stock_bikes_dealer5_data_is_object,
  add constraint stock_bikes_dealer5_data_is_object check (jsonb_typeof(dealer5_data) = 'object');

create index if not exists stock_bikes_stock_number_idx on public.stock_bikes (stock_number);

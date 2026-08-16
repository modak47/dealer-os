alter table public.website_leads
  add column if not exists autotrader_vehicle_id text,
  add column if not exists autotrader_vehicle_lookup_data jsonb not null default '{}'::jsonb,
  add column if not exists autotrader_vehicle_check_data jsonb not null default '{}'::jsonb,
  add column if not exists vehicle_check_status text,
  add column if not exists vehicle_check_checked_at timestamptz,
  add column if not exists vehicle_check_error text;

alter table public.website_leads
  drop constraint if exists website_leads_autotrader_vehicle_lookup_data_is_object,
  add constraint website_leads_autotrader_vehicle_lookup_data_is_object check (jsonb_typeof(autotrader_vehicle_lookup_data) = 'object'),
  drop constraint if exists website_leads_autotrader_vehicle_check_data_is_object,
  add constraint website_leads_autotrader_vehicle_check_data_is_object check (jsonb_typeof(autotrader_vehicle_check_data) = 'object');

create index if not exists website_leads_vehicle_check_status_idx
  on public.website_leads (vehicle_check_status);

create index if not exists website_leads_autotrader_vehicle_id_idx
  on public.website_leads (autotrader_vehicle_id)
  where autotrader_vehicle_id is not null;

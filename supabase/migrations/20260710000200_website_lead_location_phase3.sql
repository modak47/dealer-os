alter table public.website_leads
  add column if not exists normalised_postcode text,
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7),
  add column if not exists location_display_name text,
  add column if not exists location_town text,
  add column if not exists geocoding_status text,
  add column if not exists geocoding_provider text,
  add column if not exists location_checked_at timestamptz,
  add column if not exists location_lookup_error text,
  add column if not exists distance_from_yesmoto_miles numeric(8,2),
  add column if not exists driving_distance_miles numeric(8,2),
  add column if not exists estimated_drive_minutes integer;

alter table public.stock_bikes
  add column if not exists collection_address text,
  add column if not exists collection_postcode text,
  add column if not exists collection_latitude numeric(10,7),
  add column if not exists collection_longitude numeric(10,7),
  add column if not exists collection_location_display_name text,
  add column if not exists collection_location_checked_at timestamptz,
  add column if not exists collection_location_error text,
  add column if not exists distance_from_yesmoto_miles numeric(8,2),
  add column if not exists driving_distance_miles numeric(8,2),
  add column if not exists estimated_drive_minutes integer,
  add column if not exists collection_notes text;

create index if not exists website_leads_geocoding_status_idx
  on public.website_leads (geocoding_status);

create index if not exists website_leads_normalised_postcode_idx
  on public.website_leads (normalised_postcode);

create index if not exists stock_bikes_collection_postcode_idx
  on public.stock_bikes (collection_postcode);

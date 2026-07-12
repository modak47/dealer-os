create table if not exists public.stock_collections (
  id uuid primary key default gen_random_uuid(),
  stock_bike_id bigint not null references public.stock_bikes(id) on delete cascade,
  website_lead_id bigint,
  collection_type text not null default 'customer_collection',
  collection_status text not null default 'not_scheduled',
  scheduled_date date,
  scheduled_start_time time,
  scheduled_end_time time,
  time_window_text text,
  assigned_user_id uuid references public.dealer_users(id) on delete set null,
  external_transporter_name text,
  external_transporter_reference text,
  assigned_driver_name text,
  assigned_driver_phone text,
  collection_address text,
  collection_postcode text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  approximate_distance_miles numeric(8,2),
  driving_distance_miles numeric(8,2),
  estimated_drive_minutes integer,
  actual_journey_miles numeric(8,2),
  actual_journey_minutes integer,
  estimated_fuel_cost numeric(12,2) not null default 0,
  actual_fuel_cost numeric(12,2) not null default 0,
  transporter_quote numeric(12,2) not null default 0,
  transporter_invoice numeric(12,2) not null default 0,
  tolls_cost numeric(12,2) not null default 0,
  parking_cost numeric(12,2) not null default 0,
  train_fare_cost numeric(12,2) not null default 0,
  other_transport_cost numeric(12,2) not null default 0,
  estimated_collection_cost numeric(12,2) not null default 0,
  actual_collection_cost numeric(12,2) not null default 0,
  payment_method text not null default 'no_payment_due',
  payment_status text not null default 'pending',
  deposit_paid numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  balance_paid numeric(12,2) not null default 0,
  final_purchase_price numeric(12,2),
  final_purchase_price_note text,
  financial_override boolean not null default false,
  customer_confirmed boolean not null default false,
  confirmation_method text,
  confirmation_message text,
  confirmation_prepared_at timestamptz,
  confirmation_opened_at timestamptz,
  confirmation_sent_at timestamptz,
  confirmation_received_at timestamptz,
  collection_notes text,
  driver_notes text,
  customer_instructions text,
  parking_access_notes text,
  documents_required jsonb not null default '["v5c","photo_id","service_history"]'::jsonb,
  documents_received jsonb not null default '{}'::jsonb,
  custom_checklist jsonb not null default '[]'::jsonb,
  keys_expected integer,
  keys_received integer,
  photos_required boolean not null default false,
  condition_photos jsonb not null default '[]'::jsonb,
  actual_mileage integer,
  bike_starts boolean,
  warning_lights boolean,
  visible_damage text,
  tyre_condition text,
  chain_condition text,
  missing_parts text,
  modifications text,
  accessories text,
  condition_notes text,
  customer_agreed_discrepancies text,
  failure_reason text,
  cancellation_reason text,
  collected_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.dealer_users(id) on delete set null,
  updated_by uuid references public.dealer_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_collections_type check (collection_type in ('customer_collection','customer_dropoff','transporter_collection','dealer_collection','other')),
  constraint stock_collections_status check (collection_status in ('not_scheduled','scheduled','confirmed','en_route','arrived','collected','received','cancelled','failed','reschedule_required')),
  constraint stock_collections_payment_method check (payment_method in ('no_payment_due','bank_transfer','cash','finance_settlement','part_payment','other')),
  constraint stock_collections_payment_status check (payment_status in ('not_required','pending','part_paid','paid','failed','on_hold','finance_settlement_required')),
  constraint stock_collections_money_non_negative check (
    estimated_fuel_cost >= 0 and actual_fuel_cost >= 0 and transporter_quote >= 0 and transporter_invoice >= 0 and
    tolls_cost >= 0 and parking_cost >= 0 and train_fare_cost >= 0 and other_transport_cost >= 0 and
    estimated_collection_cost >= 0 and actual_collection_cost >= 0 and deposit_paid >= 0 and balance_due >= 0 and balance_paid >= 0 and
    coalesce(final_purchase_price,0) >= 0
  ),
  constraint stock_collections_coordinates check (
    (latitude is null or latitude between -90 and 90) and (longitude is null or longitude between -180 and 180)
  ),
  constraint stock_collections_time_order check (
    scheduled_start_time is null or scheduled_end_time is null or scheduled_end_time > scheduled_start_time
  )
);

create unique index if not exists stock_collections_one_active_per_bike
  on public.stock_collections(stock_bike_id)
  where collection_status not in ('received','cancelled','failed');

create index if not exists stock_collections_date_idx on public.stock_collections(scheduled_date, scheduled_start_time);
create index if not exists stock_collections_status_idx on public.stock_collections(collection_status);
create index if not exists stock_collections_assigned_user_idx on public.stock_collections(assigned_user_id, scheduled_date);
create index if not exists stock_collections_stock_idx on public.stock_collections(stock_bike_id, created_at desc);

create table if not exists public.stock_collection_events (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.stock_collections(id) on delete cascade,
  stock_bike_id bigint not null references public.stock_bikes(id) on delete cascade,
  event_type text not null,
  message text,
  previous_status text,
  new_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.dealer_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists stock_collection_events_collection_idx on public.stock_collection_events(collection_id, created_at desc);
create index if not exists stock_collection_events_stock_idx on public.stock_collection_events(stock_bike_id, created_at desc);

create or replace function public.stock_collection_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_stock_collections_updated_at on public.stock_collections;
create trigger set_stock_collections_updated_at
before update on public.stock_collections
for each row execute function public.stock_collection_set_updated_at();

alter table public.stock_collections enable row level security;
alter table public.stock_collection_events enable row level security;

drop policy if exists "Authenticated staff manage stock collections" on public.stock_collections;
create policy "Authenticated staff manage stock collections" on public.stock_collections
for all to authenticated using (public.crm_staff_can_access()) with check (public.crm_staff_can_access());

drop policy if exists "Authenticated staff read stock collection events" on public.stock_collection_events;
create policy "Authenticated staff read stock collection events" on public.stock_collection_events
for select to authenticated using (public.crm_staff_can_access());

drop policy if exists "Authenticated staff insert stock collection events" on public.stock_collection_events;
create policy "Authenticated staff insert stock collection events" on public.stock_collection_events
for insert to authenticated with check (public.crm_staff_can_access());

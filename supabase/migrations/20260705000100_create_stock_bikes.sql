create extension if not exists pgcrypto;

create table if not exists public.stock_bikes (
  id uuid primary key default gen_random_uuid(),
  dealer5_id text unique,
  registration text,
  vin text,
  make text,
  model text,
  variant text,
  year integer,
  mileage integer,
  colour text,
  engine_cc integer,
  price numeric(12, 2),
  status text not null default 'In Stock',
  source_url text,
  image_urls jsonb not null default '[]'::jsonb,
  primary_image_url text,
  date_in_stock date,
  sold_date date,
  mot_expiry date,
  mot_status text,
  workshop_status text,
  valeting_status text,
  photo_status text,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_bikes_image_urls_is_array check (jsonb_typeof(image_urls) = 'array')
);

create index if not exists stock_bikes_created_at_idx on public.stock_bikes (created_at desc);
create index if not exists stock_bikes_status_idx on public.stock_bikes (status);
create index if not exists stock_bikes_registration_idx on public.stock_bikes (registration);

create or replace function public.set_stock_bikes_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_stock_bikes_updated_at on public.stock_bikes;
create trigger set_stock_bikes_updated_at
before update on public.stock_bikes
for each row execute function public.set_stock_bikes_updated_at();

alter table public.stock_bikes enable row level security;

drop policy if exists "Public can read stock bikes" on public.stock_bikes;
create policy "Public can read stock bikes"
on public.stock_bikes for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated staff can insert stock bikes" on public.stock_bikes;
create policy "Authenticated staff can insert stock bikes"
on public.stock_bikes for insert
to authenticated
with check (true);

drop policy if exists "Authenticated staff can update stock bikes" on public.stock_bikes;
create policy "Authenticated staff can update stock bikes"
on public.stock_bikes for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated staff can delete stock bikes" on public.stock_bikes;
create policy "Authenticated staff can delete stock bikes"
on public.stock_bikes for delete
to authenticated
using (true);

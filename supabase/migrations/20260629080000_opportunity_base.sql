create table if not exists public.buying_opportunities (
  "Listing ID" bigint primary key,
  "Score" numeric not null default 0,
  "Potential Margin" text,
  "Asking Price" text,
  "Dealer Median" text,
  "Comparable Count" integer not null default 0,
  "Make" text,
  "Model" text,
  "Year" integer,
  "Mileage" integer,
  "Seller Type" text,
  "Advert URL" text,
  "First Seen Date" timestamptz,
  "Days Live" integer not null default 0,
  "Derivative ID" text,
  "HPI Category" text,
  "Margin %" text,
  primary_image_url text
);

create table if not exists public.scanner_status (
  id integer primary key,
  last_run timestamptz not null default now(),
  opportunity_count integer not null default 0
);

insert into public.scanner_status (id, opportunity_count)
values (1, 0)
on conflict (id) do nothing;

alter table public.buying_opportunities enable row level security;
alter table public.scanner_status enable row level security;
revoke all on table public.buying_opportunities from public, anon, authenticated;
revoke all on table public.scanner_status from public, anon, authenticated;
grant all on table public.buying_opportunities to service_role;
grant all on table public.scanner_status to service_role;

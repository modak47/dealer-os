create sequence if not exists public.stock_number_seq start with 1000 increment by 1;

do $$
declare max_existing bigint;
begin
  select max(nullif(regexp_replace(stock_number, '\D', '', 'g'), '')::bigint)
  into max_existing
  from public.stock_bikes
  where stock_number ~ '\d';
  if max_existing is not null then
    perform setval('public.stock_number_seq', greatest(max_existing, 999), true);
  end if;
end $$;

create or replace function public.reserve_next_stock_number()
returns text
language sql
security definer
set search_path = public
as $$
  select 'YM' || lpad(nextval('public.stock_number_seq')::text, 5, '0');
$$;

alter table public.stock_bikes
  add column if not exists website_lead_id bigint,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_email text,
  add column if not exists customer_postcode text,
  add column if not exists customer_address text,
  add column if not exists purchase_price numeric(12,2),
  add column if not exists target_retail_price numeric(12,2),
  add column if not exists minimum_retail_price numeric(12,2),
  add column if not exists estimated_preparation_cost numeric(12,2),
  add column if not exists actual_preparation_cost numeric(12,2),
  add column if not exists estimated_transport_cost numeric(12,2),
  add column if not exists actual_transport_cost numeric(12,2),
  add column if not exists other_estimated_costs numeric(12,2),
  add column if not exists other_actual_costs numeric(12,2),
  add column if not exists total_stock_cost numeric(12,2),
  add column if not exists expected_gross_profit numeric(12,2),
  add column if not exists expected_net_profit numeric(12,2),
  add column if not exists actual_sale_price numeric(12,2),
  add column if not exists actual_profit numeric(12,2),
  add column if not exists deposit_paid numeric(12,2),
  add column if not exists balance_outstanding numeric(12,2),
  add column if not exists payment_status text,
  add column if not exists purchase_notes text,
  add column if not exists purchase_agreed_at timestamptz,
  add column if not exists expected_arrival_date date,
  add column if not exists actual_arrival_date date,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists keys_received integer,
  add column if not exists v5_received boolean not null default false,
  add column if not exists service_history_received boolean not null default false,
  add column if not exists hpi_completed boolean not null default false,
  add column if not exists condition_notes text,
  add column if not exists parts_required text,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

alter table public.website_leads
  add column if not exists stock_bike_id uuid,
  add column if not exists purchase_agreed_at timestamptz;

create unique index if not exists stock_bikes_stock_number_unique_idx
  on public.stock_bikes (stock_number)
  where stock_number is not null;

create unique index if not exists stock_bikes_active_website_lead_unique_idx
  on public.stock_bikes (website_lead_id)
  where website_lead_id is not null and status <> 'Purchase Cancelled';

create index if not exists stock_bikes_purchase_pending_idx
  on public.stock_bikes (status, expected_arrival_date)
  where status in ('Purchase Pending', 'Purchase Cancelled');

create index if not exists stock_bikes_website_lead_id_idx
  on public.stock_bikes (website_lead_id);

create index if not exists website_leads_stock_bike_id_idx
  on public.website_leads (stock_bike_id);

alter table public.stock_bikes
  drop constraint if exists stock_bikes_purchase_money_non_negative,
  add constraint stock_bikes_purchase_money_non_negative check (
    coalesce(purchase_price,0) >= 0 and
    coalesce(target_retail_price,0) >= 0 and
    coalesce(minimum_retail_price,0) >= 0 and
    coalesce(estimated_preparation_cost,0) >= 0 and
    coalesce(actual_preparation_cost,0) >= 0 and
    coalesce(estimated_transport_cost,0) >= 0 and
    coalesce(actual_transport_cost,0) >= 0 and
    coalesce(other_estimated_costs,0) >= 0 and
    coalesce(other_actual_costs,0) >= 0 and
    coalesce(deposit_paid,0) >= 0 and
    coalesce(balance_outstanding,0) >= 0
  );

create or replace function public.recalculate_stock_purchase_finance()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  estimated_total numeric;
  actual_total numeric;
begin
  estimated_total := coalesce(new.purchase_price,0) + coalesce(new.estimated_preparation_cost,0) + coalesce(new.estimated_transport_cost,0) + coalesce(new.other_estimated_costs,0);
  actual_total := coalesce(new.purchase_price,0) + coalesce(new.actual_preparation_cost,0) + coalesce(new.actual_transport_cost,0) + coalesce(new.other_actual_costs,0);
  new.total_stock_cost := case when new.status = 'Purchase Pending' then estimated_total else actual_total end;
  new.expected_gross_profit := coalesce(new.target_retail_price,0) - estimated_total;
  new.expected_net_profit := new.expected_gross_profit;
  if new.actual_sale_price is not null then
    new.actual_profit := coalesce(new.actual_sale_price,0) - actual_total;
  end if;
  return new;
end;
$$;

drop trigger if exists recalculate_stock_purchase_finance on public.stock_bikes;
create trigger recalculate_stock_purchase_finance
before insert or update on public.stock_bikes
for each row execute function public.recalculate_stock_purchase_finance();

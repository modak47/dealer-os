alter table public.stock_bikes
  add column if not exists purchase_date date,
  add column if not exists seller_name text,
  add column if not exists purchase_source text,
  add column if not exists workshop_cost numeric(12,2),
  add column if not exists parts_cost numeric(12,2),
  add column if not exists labour_cost numeric(12,2),
  add column if not exists valeting_cost numeric(12,2),
  add column if not exists photography_cost numeric(12,2),
  add column if not exists hpi_cost numeric(12,2),
  add column if not exists miscellaneous_cost numeric(12,2),
  add column if not exists discount_given numeric(12,2),
  add column if not exists sold_finance_snapshot_at timestamptz,
  add column if not exists sold_purchase_price numeric(12,2),
  add column if not exists sold_total_cost numeric(12,2),
  add column if not exists sold_sale_price numeric(12,2),
  add column if not exists sold_gross_profit numeric(12,2),
  add column if not exists sold_net_profit numeric(12,2),
  add column if not exists sold_profit_percent numeric(8,2),
  add column if not exists sold_days_held integer;

alter table public.stock_bikes
  drop constraint if exists stock_bikes_ledger_money_non_negative,
  add constraint stock_bikes_ledger_money_non_negative check (
    coalesce(workshop_cost,0) >= 0 and
    coalesce(parts_cost,0) >= 0 and
    coalesce(labour_cost,0) >= 0 and
    coalesce(valeting_cost,0) >= 0 and
    coalesce(photography_cost,0) >= 0 and
    coalesce(hpi_cost,0) >= 0 and
    coalesce(miscellaneous_cost,0) >= 0 and
    coalesce(discount_given,0) >= 0
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
  retail_value numeric;
  sale_value numeric;
  held_days integer;
begin
  estimated_total :=
    coalesce(new.purchase_price,0)
    + coalesce(new.estimated_preparation_cost,0)
    + coalesce(new.estimated_transport_cost,0)
    + coalesce(new.other_estimated_costs,0)
    + coalesce(new.workshop_cost,0)
    + coalesce(new.parts_cost,0)
    + coalesce(new.labour_cost,0)
    + coalesce(new.valeting_cost,0)
    + coalesce(new.photography_cost,0)
    + coalesce(new.hpi_cost,0)
    + coalesce(new.miscellaneous_cost,0);

  actual_total :=
    coalesce(new.purchase_price,0)
    + coalesce(new.actual_preparation_cost,0)
    + coalesce(new.actual_transport_cost,0)
    + coalesce(new.other_actual_costs,0)
    + coalesce(new.workshop_cost,0)
    + coalesce(new.parts_cost,0)
    + coalesce(new.labour_cost,0)
    + coalesce(new.valeting_cost,0)
    + coalesce(new.photography_cost,0)
    + coalesce(new.hpi_cost,0)
    + coalesce(new.miscellaneous_cost,0);

  retail_value := coalesce(new.target_retail_price, new.price, 0);
  sale_value := coalesce(new.actual_sale_price, new.price, new.target_retail_price, 0);

  if new.status in ('Sold','Sale Completed') and new.sold_finance_snapshot_at is not null then
    return new;
  end if;

  new.total_stock_cost := case when new.status = 'Purchase Pending' then estimated_total else actual_total end;
  new.expected_gross_profit := retail_value - estimated_total;
  new.expected_net_profit := new.expected_gross_profit;

  if new.actual_sale_price is not null then
    new.actual_profit := coalesce(new.actual_sale_price,0) - actual_total;
  end if;

  if new.status in ('Sold','Sale Completed') and new.sold_finance_snapshot_at is null then
    held_days := greatest(0, coalesce(new.sold_date, current_date) - coalesce(new.date_in_stock, new.purchase_date, new.purchase_agreed_at::date, new.created_at::date, current_date));
    new.sold_finance_snapshot_at := now();
    new.sold_purchase_price := coalesce(new.purchase_price,0);
    new.sold_total_cost := actual_total;
    new.sold_sale_price := sale_value;
    new.sold_gross_profit := sale_value - actual_total;
    new.sold_net_profit := sale_value - actual_total;
    new.sold_profit_percent := case when actual_total > 0 then round(((sale_value - actual_total) / actual_total) * 100, 2) else null end;
    new.sold_days_held := held_days;
    new.actual_sale_price := coalesce(new.actual_sale_price, sale_value);
    new.actual_profit := sale_value - actual_total;
  end if;

  return new;
end;
$$;

create index if not exists stock_bikes_finance_status_idx on public.stock_bikes(status, date_in_stock, sold_date);
create index if not exists stock_bikes_purchase_date_idx on public.stock_bikes(purchase_date);
create index if not exists stock_bikes_sold_snapshot_idx on public.stock_bikes(sold_finance_snapshot_at) where sold_finance_snapshot_at is not null;

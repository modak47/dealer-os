alter table public.crm_sales
  add column if not exists agreed_price numeric(12,2),
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists finance_status text not null default 'Not required',
  add column if not exists finance_provider text,
  add column if not exists finance_reference text,
  add column if not exists source text,
  add column if not exists delivery_address text,
  add column if not exists collection_date date,
  add column if not exists handover_status text not null default 'Not started',
  add column if not exists handover_checklist jsonb not null default '{}'::jsonb,
  add column if not exists deal_summary jsonb not null default '{}'::jsonb,
  add column if not exists reserved_at timestamptz,
  add column if not exists sale_agreed_at timestamptz,
  add column if not exists delivery_started_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

alter table public.crm_reservations
  add column if not exists converted_sale_id uuid references public.crm_sales(id) on delete set null;

alter table public.crm_sales
  drop constraint if exists crm_sales_pipeline_money_non_negative,
  add constraint crm_sales_pipeline_money_non_negative check (
    coalesce(agreed_price,0) >= 0 and
    coalesce(discount_amount,0) >= 0
  );

create index if not exists crm_sales_status_created_idx on public.crm_sales(status, created_at desc);
create index if not exists crm_sales_finance_status_idx on public.crm_sales(finance_status);
create index if not exists crm_sales_stock_bike_idx on public.crm_sales(stock_bike_id);
create index if not exists crm_reservations_converted_sale_idx on public.crm_reservations(converted_sale_id);

create or replace function public.crm_mark_sale_pipeline_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.reserved_at is null and new.reservation_id is not null then
    new.reserved_at := coalesce((select reserved_at from public.crm_reservations where id = new.reservation_id), new.created_at, now());
  end if;

  if new.status in ('Sale Agreed','Awaiting Payment','Finance','Delivery','Completed') and new.sale_agreed_at is null then
    new.sale_agreed_at := now();
  end if;

  if new.status = 'Delivery' and new.delivery_started_at is null then
    new.delivery_started_at := now();
  end if;

  if new.status = 'Cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists mark_sale_pipeline_timestamps on public.crm_sales;
create trigger mark_sale_pipeline_timestamps
before insert or update of status, reservation_id on public.crm_sales
for each row execute function public.crm_mark_sale_pipeline_timestamps();

create or replace function public.crm_link_converted_reservation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.reservation_id is not null then
    update public.crm_reservations
      set converted_sale_id = new.id
      where id = new.reservation_id and converted_sale_id is distinct from new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists link_converted_reservation on public.crm_sales;
create trigger link_converted_reservation
after insert or update of reservation_id on public.crm_sales
for each row execute function public.crm_link_converted_reservation();

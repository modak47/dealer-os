-- Stage 1 accounts foundation. Existing CRM customer/payment/invoice tables are extended,
-- rather than creating duplicate sources of truth.
alter table public.crm_invoices alter column sale_id drop not null;
alter table public.crm_invoices alter column status set default 'draft';
alter table public.crm_invoices add column if not exists reservation_id uuid references public.crm_reservations(id) on delete restrict;
alter table public.crm_invoices add column if not exists delivery_charge numeric(12,2) not null default 0;
alter table public.crm_invoices add column if not exists customer_snapshot jsonb not null default '{}'::jsonb;
alter table public.crm_invoices add column if not exists bike_snapshot jsonb not null default '{}'::jsonb;
alter table public.crm_invoices add column if not exists notes text;
alter table public.crm_invoices add column if not exists sent_at timestamptz;
alter table public.crm_invoices add column if not exists cancelled_at timestamptz;
update public.crm_invoices set status=case lower(status) when 'open' then case when paid>0 then 'partially_paid' else 'sent' end when 'paid' then 'paid' else lower(replace(status,' ','_')) end;
alter table public.crm_invoices drop constraint if exists crm_invoices_status_check;
alter table public.crm_invoices add constraint crm_invoices_status_check check(status in ('draft','sent','partially_paid','paid','overdue','cancelled'));
create unique index if not exists crm_invoices_reservation_unique on public.crm_invoices(reservation_id) where reservation_id is not null and deleted_at is null;
create index if not exists crm_invoices_status_due_idx on public.crm_invoices(status,due_at);

create table if not exists public.crm_invoice_items (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.crm_invoices(id) on delete cascade,
  description text not null, quantity numeric(10,2) not null default 1 check(quantity>0), unit_price numeric(12,2) not null,
  line_total numeric(12,2) generated always as (round(quantity*unit_price,2)) stored,
  item_type text not null default 'other' check(item_type in ('motorcycle','delivery','accessory','fee','discount','other')),
  sort_order integer not null default 0, metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists crm_invoice_items_invoice_idx on public.crm_invoice_items(invoice_id,sort_order);

alter table public.crm_payments add column if not exists invoice_id uuid references public.crm_invoices(id) on delete restrict;
alter table public.crm_payments drop constraint if exists crm_payment_parent;
alter table public.crm_payments add constraint crm_payment_parent check(num_nonnulls(sale_id,reservation_id,invoice_id)>=1);
alter table public.crm_payments drop constraint if exists crm_payment_method;
alter table public.crm_payments add constraint crm_payment_method check(method in ('Cash','Card','Card Terminal','Bank','Bank Transfer','Finance','Finance Deposit','Part Exchange','Mixed','Stripe'));
create index if not exists crm_payments_invoice_idx on public.crm_payments(invoice_id,paid_at);

alter table public.crm_reservations add column if not exists delivery_option text not null default 'Collection' check(delivery_option in ('Collection','Delivery'));
alter table public.crm_reservations add column if not exists delivery_charge numeric(12,2);
alter table public.crm_reservations add column if not exists delivery_notes text;

create table if not exists public.crm_delivery_jobs (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.crm_customers(id) on delete restrict,
  invoice_id uuid references public.crm_invoices(id) on delete set null, stock_bike_id bigint not null references public.stock_bikes(id) on delete restrict,
  reservation_id uuid references public.crm_reservations(id) on delete set null,
  pickup_address jsonb not null default '{}'::jsonb, delivery_address jsonb not null default '{}'::jsonb,
  status text not null default 'quote_needed' check(status in ('not_required','quote_needed','booked','collection_scheduled','collected','delivered','cancelled')),
  requested_date date, collection_date date, delivery_date date, provider_name text, provider_reference text,
  provider_payload jsonb not null default '{}'::jsonb, notes text, created_by uuid references public.dealer_users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists crm_delivery_jobs_status_idx on public.crm_delivery_jobs(status,requested_date);

create table if not exists public.crm_email_logs (
  id uuid primary key default gen_random_uuid(), customer_id uuid references public.crm_customers(id) on delete set null,
  invoice_id uuid references public.crm_invoices(id) on delete set null, to_email text not null, subject text not null,
  status text not null default 'draft' check(status in ('draft','queued','sent','failed')),
  provider text, provider_response jsonb not null default '{}'::jsonb, sent_at timestamptz,
  created_by uuid references public.dealer_users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists crm_email_logs_invoice_idx on public.crm_email_logs(invoice_id,created_at desc);

create sequence if not exists public.crm_invoice_number_seq start 1001;
create or replace function public.crm_next_invoice_number() returns text language sql security definer set search_path='' as $$
  select 'YM-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.crm_invoice_number_seq')::text,5,'0')
$$;

create or replace function public.crm_refresh_invoice(p_invoice_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare item_total numeric; payment_total numeric;
begin
  select coalesce(sum(line_total),0) into item_total from public.crm_invoice_items where invoice_id=p_invoice_id;
  select coalesce(sum(amount),0) into payment_total from public.crm_payments where invoice_id=p_invoice_id and status='Completed' and deleted_at is null;
  update public.crm_invoices set subtotal=item_total,total=item_total,paid=payment_total,balance=greatest(item_total-payment_total,0),
    status=case when status='cancelled' then status when payment_total>=item_total and item_total>0 then 'paid' when payment_total>0 then 'partially_paid' when status in ('sent','overdue') and due_at<now() then 'overdue' else status end
  where id=p_invoice_id;
end $$;
create or replace function public.crm_refresh_sale_balance(p_sale_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare total_paid numeric; begin
  select coalesce(sum(amount),0) into total_paid from public.crm_payments where sale_id=p_sale_id and status='Completed' and deleted_at is null;
  update public.crm_sales set balance_due=greatest(coalesce(sale_price,0)-coalesce(part_exchange_amount,0)-total_paid,0),payment_status=case when total_paid+coalesce(part_exchange_amount,0)>=coalesce(sale_price,0) then 'Paid' when total_paid>0 then 'Part Paid' else 'Unpaid' end where id=p_sale_id;
  update public.crm_invoices set paid=total_paid,balance=greatest(total-coalesce((select part_exchange_amount from public.crm_sales where id=p_sale_id),0)-total_paid,0),status=case when status='cancelled' then status when total_paid+coalesce((select part_exchange_amount from public.crm_sales where id=p_sale_id),0)>=total then 'paid' when total_paid>0 then 'partially_paid' else status end where sale_id=p_sale_id;
end $$;
create or replace function public.crm_invoice_item_changed() returns trigger language plpgsql security definer set search_path='' as $$ begin perform public.crm_refresh_invoice(coalesce(new.invoice_id,old.invoice_id));return coalesce(new,old);end $$;
drop trigger if exists refresh_invoice_from_item on public.crm_invoice_items;
create trigger refresh_invoice_from_item after insert or update or delete on public.crm_invoice_items for each row execute function public.crm_invoice_item_changed();
create or replace function public.crm_invoice_payment_changed() returns trigger language plpgsql security definer set search_path='' as $$ begin if coalesce(new.invoice_id,old.invoice_id) is not null then perform public.crm_refresh_invoice(coalesce(new.invoice_id,old.invoice_id));end if;return coalesce(new,old);end $$;
drop trigger if exists refresh_invoice_from_payment on public.crm_payments;
create trigger refresh_invoice_from_payment after insert or update or delete on public.crm_payments for each row execute function public.crm_invoice_payment_changed();

do $$ declare t text; begin foreach t in array array['crm_invoice_items','crm_delivery_jobs','crm_email_logs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists "Authenticated staff full access" on public.%I',t);
  execute format('create policy "Authenticated staff full access" on public.%I for all to authenticated using (public.crm_staff_can_access()) with check (public.crm_staff_can_access())',t);
  execute format('drop trigger if exists %I on public.%I','set_'||t||'_updated_at',t);
  execute format('create trigger %I before update on public.%I for each row execute function public.crm_set_updated_at()','set_'||t||'_updated_at',t);
  execute format('drop trigger if exists %I on public.%I','audit_'||t,t);
  execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.crm_audit_change()','audit_'||t,t);
end loop; end $$;

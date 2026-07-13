create extension if not exists pgcrypto;

alter table public.crm_sales
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.dealer_users(id) on delete set null,
  add column if not exists cancellation_reason text,
  add column if not exists sold_at timestamptz,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references public.dealer_users(id) on delete set null;

alter table public.crm_reservations
  add column if not exists cancelled_by uuid references public.dealer_users(id) on delete set null;

alter table public.crm_invoices
  add column if not exists cancelled_at timestamptz;

alter table public.crm_sales
  drop constraint if exists crm_sale_status,
  add constraint crm_sale_status check (
    status in (
      'Negotiation','Reserved','Sale Pending','Finance','Awaiting Payment','Sale Agreed',
      'Delivery','Sold','Sale Completed','Completed','Cancelled'
    )
  );

create table if not exists public.stock_activity_events (
  id uuid primary key default gen_random_uuid(),
  stock_bike_id bigint references public.stock_bikes(id) on delete set null,
  customer_id uuid references public.crm_customers(id) on delete set null,
  reservation_id uuid references public.crm_reservations(id) on delete set null,
  sale_id uuid references public.crm_sales(id) on delete set null,
  invoice_id uuid references public.crm_invoices(id) on delete set null,
  payment_id uuid references public.crm_payments(id) on delete set null,
  event_type text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.dealer_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists stock_activity_events_stock_idx on public.stock_activity_events(stock_bike_id, created_at desc);
create index if not exists stock_activity_events_sale_idx on public.stock_activity_events(sale_id, created_at desc);
create index if not exists stock_activity_events_reservation_idx on public.stock_activity_events(reservation_id, created_at desc);

alter table public.stock_activity_events enable row level security;
drop policy if exists "Authenticated staff full access" on public.stock_activity_events;
create policy "Authenticated staff full access" on public.stock_activity_events
  for all to authenticated using (public.crm_staff_can_access()) with check (public.crm_staff_can_access());

create or replace function public.stock_log_activity(
  p_stock_bike_id bigint,
  p_event_type text,
  p_description text,
  p_customer_id uuid default null,
  p_reservation_id uuid default null,
  p_sale_id uuid default null,
  p_invoice_id uuid default null,
  p_payment_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.stock_activity_events(
    stock_bike_id,event_type,description,customer_id,reservation_id,sale_id,invoice_id,payment_id,metadata,created_by
  )
  values(
    p_stock_bike_id,p_event_type,p_description,p_customer_id,p_reservation_id,p_sale_id,p_invoice_id,p_payment_id,coalesce(p_metadata,'{}'::jsonb),p_user_id
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.crm_reserve_stock_bike(
  p_customer_id uuid,
  p_bike_id bigint,
  p_deposit numeric default 0,
  p_expiry timestamptz default null,
  p_method text default 'Card',
  p_receipt text default null,
  p_notes text default null,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  bike public.stock_bikes%rowtype;
  v_reservation_id uuid;
  v_payment_id uuid;
begin
  select * into bike from public.stock_bikes where id = p_bike_id for update;
  if not found then raise exception 'Motorcycle not found'; end if;
  if coalesce(bike.status,'') not in ('In Stock','On Forecourt','Available','Prep') then
    raise exception 'This motorcycle is not available to reserve';
  end if;
  if exists(select 1 from public.crm_reservations where stock_bike_id = p_bike_id and status in ('Active','Deposit Taken')) then
    raise exception 'This motorcycle already has an active reservation';
  end if;
  if exists(select 1 from public.crm_sales where stock_bike_id = p_bike_id and status not in ('Completed','Sale Completed','Cancelled')) then
    raise exception 'This motorcycle already has an active sale';
  end if;

  insert into public.crm_reservations(customer_id,stock_bike_id,status,deposit_amount,expires_at,notes,assigned_user_id,created_by)
  values(p_customer_id,p_bike_id,case when coalesce(p_deposit,0)>0 then 'Deposit Taken' else 'Active' end,coalesce(p_deposit,0),p_expiry,p_notes,p_user_id,p_user_id)
  returning id into v_reservation_id;

  if coalesce(p_deposit,0) > 0 then
    insert into public.crm_payments(reservation_id,customer_id,stock_bike_id,payment_type,method,amount,receipt_number,notes,status,created_by)
    values(v_reservation_id,p_customer_id,p_bike_id,'Deposit',coalesce(p_method,'Card'),p_deposit,p_receipt,p_notes,'Completed',p_user_id)
    returning id into v_payment_id;
  end if;

  update public.stock_bikes set status = 'Reserved' where id = p_bike_id;
  perform public.stock_log_activity(p_bike_id,'reserved','Motorcycle reserved',p_customer_id,v_reservation_id,null,null,v_payment_id,jsonb_build_object('deposit',coalesce(p_deposit,0)),p_user_id);
  return v_reservation_id;
end;
$$;

create or replace function public.crm_cancel_reservation(
  p_reservation_id uuid,
  p_reason text default null,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.crm_reservations%rowtype;
begin
  select * into r from public.crm_reservations where id = p_reservation_id for update;
  if not found then raise exception 'Reservation not found'; end if;
  if r.status = 'Cancelled' then return; end if;

  update public.crm_reservations
    set status='Cancelled', cancelled_at=now(), cancelled_by=p_user_id, cancellation_reason=coalesce(p_reason,'Reservation cancelled')
    where id=r.id;

  if not exists(select 1 from public.crm_sales where stock_bike_id=r.stock_bike_id and status not in ('Completed','Sale Completed','Cancelled'))
     and not exists(select 1 from public.crm_reservations where stock_bike_id=r.stock_bike_id and id<>r.id and status in ('Active','Deposit Taken')) then
    update public.stock_bikes set status='In Stock' where id=r.stock_bike_id;
  end if;

  perform public.stock_log_activity(r.stock_bike_id,'reservation_cancelled',coalesce(p_reason,'Reservation cancelled'),r.customer_id,r.id,null,null,null,'{}'::jsonb,p_user_id);
end;
$$;

create or replace function public.crm_convert_reservation_to_sale(p_reservation_id uuid,p_finance boolean default false,p_user_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.crm_reservations%rowtype;
  bike public.stock_bikes%rowtype;
  v_sale_id uuid;
  v_invoice_number text;
  v_invoice_id uuid;
  deposit_paid numeric;
begin
  select * into r from public.crm_reservations where id=p_reservation_id for update;
  if not found or r.status not in ('Active','Deposit Taken') then raise exception 'Active reservation not found'; end if;
  select * into bike from public.stock_bikes where id=r.stock_bike_id for update;
  if exists(select 1 from public.crm_sales where stock_bike_id=r.stock_bike_id and status not in ('Completed','Sale Completed','Cancelled')) then
    raise exception 'Motorcycle already has an active sale';
  end if;

  select coalesce(sum(amount),0) into deposit_paid from public.crm_payments where reservation_id=r.id and status='Completed' and deleted_at is null;
  select public.crm_next_invoice_number() into v_invoice_number;

  insert into public.crm_sales(customer_id,stock_bike_id,lead_id,reservation_id,assigned_user_id,status,sale_price,deposit_amount,balance_due,payment_status,invoice_number,created_by)
  values(r.customer_id,r.stock_bike_id,r.lead_id,r.id,coalesce(r.assigned_user_id,p_user_id),'Sale Pending',coalesce(bike.price,0),deposit_paid,greatest(coalesce(bike.price,0)-deposit_paid,0),case when deposit_paid>0 then 'Part Paid' else 'Unpaid' end,v_invoice_number,p_user_id)
  returning id into v_sale_id;

  update public.crm_payments set sale_id=v_sale_id where reservation_id=r.id;
  update public.crm_reservations set status='Converted' where id=r.id;
  update public.crm_leads set status='Negotiation' where id=r.lead_id;
  update public.stock_bikes set status='Sale Pending' where id=r.stock_bike_id;

  insert into public.crm_invoices(invoice_number,sale_id,customer_id,stock_bike_id,subtotal,total,paid,balance,status,reservation_id)
  values(v_invoice_number,v_sale_id,r.customer_id,r.stock_bike_id,coalesce(bike.price,0),coalesce(bike.price,0),deposit_paid,greatest(coalesce(bike.price,0)-deposit_paid,0),'draft',r.id)
  returning id into v_invoice_id;

  insert into public.crm_invoice_items(invoice_id,description,quantity,unit_price,item_type,sort_order)
  values(v_invoice_id,trim(concat_ws(' ',bike.year,bike.make,bike.model,bike.variant,case when bike.registration is not null then '('||bike.registration||')' end)),1,coalesce(bike.price,0),'motorcycle',0);

  update public.crm_payments set invoice_id=v_invoice_id where reservation_id=r.id;
  insert into public.crm_deliveries(sale_id,customer_id,stock_bike_id,assigned_user_id) values(v_sale_id,r.customer_id,r.stock_bike_id,coalesce(r.assigned_user_id,p_user_id));
  insert into public.crm_activities(activity_type,subject,status,customer_id,lead_id,reservation_id,stock_bike_id,sale_id,created_by)
  values('Note','Sale pending','Completed',r.customer_id,r.lead_id,r.id,r.stock_bike_id,v_sale_id,p_user_id);
  perform public.stock_log_activity(r.stock_bike_id,'sale_pending','Reservation converted to sale pending',r.customer_id,r.id,v_sale_id,v_invoice_id,null,'{}'::jsonb,p_user_id);
  return v_sale_id;
end;
$$;

create or replace function public.crm_start_sale(
  p_customer_id uuid,
  p_bike_id bigint,
  p_sale_price numeric default null,
  p_deposit numeric default 0,
  p_method text default 'Card',
  p_receipt text default null,
  p_notes text default null,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  bike public.stock_bikes%rowtype;
  v_sale_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_sale_price numeric;
begin
  select * into bike from public.stock_bikes where id=p_bike_id for update;
  if not found then raise exception 'Motorcycle not found'; end if;
  if coalesce(bike.status,'') not in ('In Stock','On Forecourt','Available','Prep') then
    raise exception 'This motorcycle is not available for sale';
  end if;
  if exists(select 1 from public.crm_reservations where stock_bike_id=p_bike_id and status in ('Active','Deposit Taken')) then
    raise exception 'Convert the active reservation instead of starting a separate sale';
  end if;
  if exists(select 1 from public.crm_sales where stock_bike_id=p_bike_id and status not in ('Completed','Sale Completed','Cancelled')) then
    raise exception 'Motorcycle already has an active sale';
  end if;

  v_sale_price := coalesce(p_sale_price,bike.price,0);
  select public.crm_next_invoice_number() into v_invoice_number;

  insert into public.crm_sales(customer_id,stock_bike_id,assigned_user_id,status,sale_price,deposit_amount,balance_due,payment_status,invoice_number,notes,created_by)
  values(p_customer_id,p_bike_id,p_user_id,'Sale Pending',v_sale_price,coalesce(p_deposit,0),greatest(v_sale_price-coalesce(p_deposit,0),0),case when coalesce(p_deposit,0)>0 then 'Part Paid' else 'Unpaid' end,v_invoice_number,p_notes,p_user_id)
  returning id into v_sale_id;

  insert into public.crm_invoices(invoice_number,sale_id,customer_id,stock_bike_id,subtotal,total,paid,balance,status)
  values(v_invoice_number,v_sale_id,p_customer_id,p_bike_id,v_sale_price,v_sale_price,coalesce(p_deposit,0),greatest(v_sale_price-coalesce(p_deposit,0),0),'draft')
  returning id into v_invoice_id;

  insert into public.crm_invoice_items(invoice_id,description,quantity,unit_price,item_type,sort_order)
  values(v_invoice_id,trim(concat_ws(' ',bike.year,bike.make,bike.model,bike.variant,case when bike.registration is not null then '('||bike.registration||')' end)),1,v_sale_price,'motorcycle',0);

  if coalesce(p_deposit,0)>0 then
    insert into public.crm_payments(sale_id,invoice_id,customer_id,stock_bike_id,payment_type,method,amount,receipt_number,notes,status,created_by)
    values(v_sale_id,v_invoice_id,p_customer_id,p_bike_id,'Deposit',coalesce(p_method,'Card'),p_deposit,p_receipt,p_notes,'Completed',p_user_id);
  end if;

  insert into public.crm_deliveries(sale_id,customer_id,stock_bike_id,assigned_user_id) values(v_sale_id,p_customer_id,p_bike_id,p_user_id);
  update public.stock_bikes set status='Sale Pending' where id=p_bike_id;
  perform public.stock_log_activity(p_bike_id,'sale_pending','Sale started',p_customer_id,null,v_sale_id,v_invoice_id,null,jsonb_build_object('sale_price',v_sale_price),p_user_id);
  return v_sale_id;
end;
$$;

create or replace function public.crm_cancel_sale(p_sale_id uuid,p_reason text default null,p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.crm_sales%rowtype;
begin
  select * into s from public.crm_sales where id=p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if s.status='Cancelled' then return; end if;
  if s.status in ('Sale Completed','Completed') then raise exception 'Completed sales must be reopened before cancellation'; end if;

  update public.crm_sales set status='Cancelled',cancelled_at=now(),cancelled_by=p_user_id,cancellation_reason=coalesce(p_reason,'Sale cancelled'),completed_at=null where id=s.id;
  update public.crm_deliveries set status='Cancelled',completed_at=null where sale_id=s.id;
  update public.crm_invoices set status='cancelled',cancelled_at=now() where sale_id=s.id and deleted_at is null;

  if s.reservation_id is not null then
    update public.crm_reservations set status='Cancelled',cancelled_at=now(),cancelled_by=p_user_id,cancellation_reason=coalesce(p_reason,'Sale cancelled') where id=s.reservation_id;
  end if;

  if exists(select 1 from public.crm_reservations where stock_bike_id=s.stock_bike_id and status in ('Active','Deposit Taken')) then
    update public.stock_bikes set status='Reserved',sold_date=null where id=s.stock_bike_id;
  else
    update public.stock_bikes set status='In Stock',sold_date=null where id=s.stock_bike_id;
  end if;

  perform public.stock_log_activity(s.stock_bike_id,'sale_cancelled',coalesce(p_reason,'Sale cancelled'),s.customer_id,s.reservation_id,s.id,null,null,'{}'::jsonb,p_user_id);
end;
$$;

create or replace function public.crm_mark_sale_sold(p_sale_id uuid,p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.crm_sales%rowtype;
begin
  select * into s from public.crm_sales where id=p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if s.status in ('Cancelled','Sale Completed','Completed') then raise exception 'This sale cannot be marked sold'; end if;
  update public.crm_sales set status='Sold',sold_at=now() where id=s.id;
  update public.stock_bikes set status='Sold',sold_date=current_date,actual_sale_price=coalesce(s.sale_price,actual_sale_price) where id=s.stock_bike_id;
  perform public.stock_log_activity(s.stock_bike_id,'sold','Motorcycle marked sold',s.customer_id,s.reservation_id,s.id,null,null,'{}'::jsonb,p_user_id);
end;
$$;

create or replace function public.crm_reopen_sale(p_sale_id uuid,p_reason text default null,p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.crm_sales%rowtype;
begin
  select * into s from public.crm_sales where id=p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if s.status not in ('Sold','Sale Completed','Completed') then raise exception 'Only sold or completed sales can be reopened'; end if;
  update public.crm_sales set status='Sale Pending',completed_at=null,reopened_at=now(),reopened_by=p_user_id,notes=concat_ws(E'\n',notes,'Reopened: '||coalesce(p_reason,'Sale reopened')) where id=s.id;
  update public.crm_deliveries set status='Pending',completed_at=null where sale_id=s.id;
  update public.stock_bikes set status='Sale Pending',sold_date=null where id=s.stock_bike_id;
  perform public.stock_log_activity(s.stock_bike_id,'sale_reopened',coalesce(p_reason,'Sale reopened'),s.customer_id,s.reservation_id,s.id,null,null,'{}'::jsonb,p_user_id);
end;
$$;

create or replace function public.crm_complete_sale(p_sale_id uuid,p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.crm_sales%rowtype;
  d public.crm_deliveries%rowtype;
  inv public.crm_invoices%rowtype;
  sale_amount_pence bigint;
  cost_basis_pence bigint;
begin
  perform public.crm_refresh_sale_balance(p_sale_id);
  select * into s from public.crm_sales where id=p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  select * into d from public.crm_deliveries where sale_id=p_sale_id for update;
  select * into inv from public.crm_invoices where sale_id=p_sale_id and deleted_at is null order by created_at desc limit 1;

  if s.status in ('Sale Completed','Completed') then return; end if;
  if s.balance_due>0 then raise exception 'Outstanding balance remains'; end if;
  if not(d.identity_checked and d.licence_verified and d.v5_prepared and d.handover_completed and d.keys_given and d.documents_signed and d.hpi_complete) then raise exception 'Delivery checklist is incomplete'; end if;
  if inv.id is null then raise exception 'Sales invoice is required before completion'; end if;

  sale_amount_pence := public.crm_money_to_pence(coalesce(inv.total, s.sale_price, 0));
  cost_basis_pence := public.stock_cost_basis_pence(s.stock_bike_id);

  perform public.crm_post_ledger_transaction(
    current_date, 'sale_completion', 'income', 'sales_revenue',
    'Motorcycle sale revenue', sale_amount_pence, 'sale_completion', s.id::text,
    'sale_completion:' || s.id::text, s.customer_id, null, s.stock_bike_id, s.id, inv.id, null, null, null,
    null, inv.invoice_number, s.notes, p_user_id
  );

  update public.crm_sales set status='Sale Completed',completed_at=now(),delivery_date=current_date where id=p_sale_id;
  update public.crm_deliveries set status='Completed',completed_at=now() where id=d.id;
  update public.stock_bikes
    set status='Sale Completed',
        sold_date=current_date,
        actual_sale_price=coalesce(s.sale_price, inv.total),
        sold_finance_snapshot_at=coalesce(sold_finance_snapshot_at, now()),
        sold_purchase_price=coalesce(purchase_price,0),
        sold_total_cost=public.crm_pence_to_money(cost_basis_pence),
        sold_sale_price=coalesce(s.sale_price, inv.total),
        sold_gross_profit=public.crm_pence_to_money(sale_amount_pence - cost_basis_pence),
        sold_net_profit=public.crm_pence_to_money(sale_amount_pence - cost_basis_pence),
        sold_profit_percent=case when sale_amount_pence > 0 then round(((sale_amount_pence - cost_basis_pence)::numeric / sale_amount_pence::numeric) * 100, 2) else 0 end
    where id=s.stock_bike_id;
  update public.crm_customers set customer_status='Owner' where id=s.customer_id;
  update public.crm_leads set status='Sold' where id=s.lead_id;
  insert into public.crm_activities(activity_type,subject,status,customer_id,lead_id,stock_bike_id,sale_id,created_by)
  values('Note','Motorcycle delivered and sale completed','Completed',s.customer_id,s.lead_id,s.stock_bike_id,s.id,p_user_id);
  perform public.stock_log_activity(s.stock_bike_id,'sale_completed','Sale completed and financial snapshot frozen',s.customer_id,s.reservation_id,s.id,inv.id,null,'{}'::jsonb,p_user_id);
end $$;

revoke all on function public.stock_log_activity(bigint,text,text,uuid,uuid,uuid,uuid,uuid,jsonb,uuid) from public;
revoke all on function public.crm_reserve_stock_bike(uuid,bigint,numeric,timestamptz,text,text,text,uuid) from public;
revoke all on function public.crm_cancel_reservation(uuid,text,uuid) from public;
revoke all on function public.crm_convert_reservation_to_sale(uuid,boolean,uuid) from public;
revoke all on function public.crm_start_sale(uuid,bigint,numeric,numeric,text,text,text,uuid) from public;
revoke all on function public.crm_cancel_sale(uuid,text,uuid) from public;
revoke all on function public.crm_mark_sale_sold(uuid,uuid) from public;
revoke all on function public.crm_reopen_sale(uuid,text,uuid) from public;
revoke all on function public.crm_complete_sale(uuid,uuid) from public;

grant execute on function public.stock_log_activity(bigint,text,text,uuid,uuid,uuid,uuid,uuid,jsonb,uuid) to authenticated, service_role;
grant execute on function public.crm_reserve_stock_bike(uuid,bigint,numeric,timestamptz,text,text,text,uuid) to authenticated, service_role;
grant execute on function public.crm_cancel_reservation(uuid,text,uuid) to authenticated, service_role;
grant execute on function public.crm_convert_reservation_to_sale(uuid,boolean,uuid) to authenticated, service_role;
grant execute on function public.crm_start_sale(uuid,bigint,numeric,numeric,text,text,text,uuid) to authenticated, service_role;
grant execute on function public.crm_cancel_sale(uuid,text,uuid) to authenticated, service_role;
grant execute on function public.crm_mark_sale_sold(uuid,uuid) to authenticated, service_role;
grant execute on function public.crm_reopen_sale(uuid,text,uuid) to authenticated, service_role;
grant execute on function public.crm_complete_sale(uuid,uuid) to authenticated, service_role;

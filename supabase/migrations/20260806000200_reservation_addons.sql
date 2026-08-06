create table if not exists public.reservation_addons (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  description text,
  price numeric(12,2) not null default 0,
  duration_months integer,
  display_order integer not null default 0,
  active boolean not null default true,
  icon text,
  badge text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_addons_category_not_blank check (length(trim(category)) > 0),
  constraint reservation_addons_name_not_blank check (length(trim(name)) > 0),
  constraint reservation_addons_price_non_negative check (price >= 0),
  constraint reservation_addons_duration_non_negative check (duration_months is null or duration_months >= 0)
);

create unique index if not exists reservation_addons_category_name_idx on public.reservation_addons(category, name);
create index if not exists reservation_addons_active_order_idx on public.reservation_addons(category, active, display_order);

create table if not exists public.reservation_addon_selections (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.crm_reservations(id) on delete cascade,
  addon_id uuid references public.reservation_addons(id) on delete set null,
  category text not null,
  name_snapshot text not null,
  description_snapshot text,
  price_snapshot numeric(12,2) not null default 0,
  quantity integer not null default 1,
  duration_months_snapshot integer,
  icon_snapshot text,
  badge_snapshot text,
  created_at timestamptz not null default now(),
  constraint reservation_addon_selections_quantity_positive check (quantity > 0),
  constraint reservation_addon_selections_price_non_negative check (price_snapshot >= 0)
);

create index if not exists reservation_addon_selections_reservation_idx on public.reservation_addon_selections(reservation_id, category, created_at);

alter table public.stripe_reservation_checkouts add column if not exists selected_addons jsonb not null default '[]'::jsonb;

alter table public.reservation_addons enable row level security;
alter table public.reservation_addon_selections enable row level security;

drop policy if exists "Public can read active reservation add-ons" on public.reservation_addons;
create policy "Public can read active reservation add-ons" on public.reservation_addons
  for select to anon, authenticated using (active = true);

drop policy if exists "Authenticated staff manage reservation add-ons" on public.reservation_addons;
create policy "Authenticated staff manage reservation add-ons" on public.reservation_addons
  for all to authenticated using (public.crm_staff_can_access()) with check (public.crm_staff_can_access());

drop policy if exists "Authenticated staff read reservation add-on selections" on public.reservation_addon_selections;
create policy "Authenticated staff read reservation add-on selections" on public.reservation_addon_selections
  for select to authenticated using (public.crm_staff_can_access());

drop policy if exists "Service role manages reservation add-on selections" on public.reservation_addon_selections;
create policy "Service role manages reservation add-on selections" on public.reservation_addon_selections
  for all to service_role using (true) with check (true);

drop trigger if exists set_reservation_addons_updated_at on public.reservation_addons;
create trigger set_reservation_addons_updated_at before update on public.reservation_addons for each row execute function public.crm_set_updated_at();

insert into public.reservation_addons(category,name,description,price,duration_months,display_order,active,icon,badge)
values
  ('warranty','Standard Cover','Standard dealer warranty',0,null,10,true,'shield','Included'),
  ('warranty','YesMoto Protect Essential','12 Month Extended Warranty' || E'\nMechanical Cover' || E'\nElectrical Cover' || E'\nParts & Labour',199,12,20,true,'shield',null),
  ('warranty','YesMoto Protect Plus','24 Month Extended Warranty' || E'\nEverything in Essential' || E'\nBreakdown Cover' || E'\nLonger protection',299,24,30,true,'star','Most Popular'),
  ('warranty','YesMoto Protect Ultimate','36 Month Extended Warranty' || E'\nMaximum protection' || E'\nMechanical' || E'\nElectrical' || E'\nParts & Labour' || E'\nRoadside Assistance',399,36,40,true,'crown',null),
  ('delivery','Collection','Collect from YesMoto',0,null,10,true,'store','FREE'),
  ('delivery','Local Delivery','Within local area',49,null,20,true,'truck',null),
  ('delivery','Nationwide Delivery','Anywhere in mainland UK',149,null,30,true,'map','Mainland UK')
on conflict (category, name) do update set
  description=excluded.description,
  price=excluded.price,
  duration_months=excluded.duration_months,
  display_order=excluded.display_order,
  active=excluded.active,
  icon=excluded.icon,
  badge=excluded.badge;

create or replace function public.crm_complete_stripe_reservation(p_checkout_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.stripe_reservation_checkouts%rowtype;
  bike public.stock_bikes%rowtype;
  v_customer_id uuid;
  v_lead_id uuid;
  v_reservation_id uuid;
  v_payment_id uuid;
  deposit numeric;
begin
  select * into c from public.stripe_reservation_checkouts where id=p_checkout_id for update;
  if not found then raise exception 'Checkout not found'; end if;
  if c.crm_reservation_id is not null then return c.crm_reservation_id; end if;
  if c.status <> 'Paid' then raise exception 'Checkout has not been paid'; end if;

  select * into bike from public.stock_bikes where id=c.stock_bike_id for update;
  if not found then raise exception 'Motorcycle not found'; end if;

  select id into v_customer_id from public.crm_customers
  where archived_at is null and lower(email)=lower(c.customer_email)
  order by created_at
  limit 1;
  if v_customer_id is null then
    select id into v_customer_id from public.crm_customers
    where archived_at is null and phone=c.customer_phone
    order by created_at
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.crm_customers(first_name,last_name,email,phone,customer_status)
    values(c.customer_first_name,c.customer_last_name,c.customer_email,c.customer_phone,'Prospect')
    returning id into v_customer_id;
  else
    update public.crm_customers
      set first_name=coalesce(nullif(c.customer_first_name,''),first_name),
          last_name=coalesce(nullif(c.customer_last_name,''),last_name),
          phone=coalesce(nullif(c.customer_phone,''),phone),
          updated_at=now()
      where id=v_customer_id;
  end if;

  insert into public.crm_leads(customer_id,source,status,preferred_bike_id,interest_level,notes)
  values(v_customer_id,'Website reservation','Reserved',c.stock_bike_id,'Hot','GBP 99 online reservation paid through Stripe')
  returning id into v_lead_id;

  deposit := round(coalesce(c.amount_pence,9900)::numeric / 100, 2);

  insert into public.crm_reservations(customer_id,lead_id,stock_bike_id,deposit_amount,expires_at,status,notes)
  values(v_customer_id,v_lead_id,c.stock_bike_id,deposit,now()+interval '7 days','Deposit Taken','Online Stripe reservation')
  returning id into v_reservation_id;

  insert into public.reservation_addon_selections(reservation_id,addon_id,category,name_snapshot,description_snapshot,price_snapshot,quantity,duration_months_snapshot,icon_snapshot,badge_snapshot)
  select
    v_reservation_id,
    nullif(item->>'id','')::uuid,
    coalesce(nullif(item->>'category',''),'other'),
    coalesce(nullif(item->>'name',''),'Reservation extra'),
    nullif(item->>'description',''),
    coalesce(nullif(item->>'price','')::numeric,0),
    greatest(coalesce(nullif(item->>'quantity','')::integer,1),1),
    nullif(item->>'duration_months','')::integer,
    nullif(item->>'icon',''),
    nullif(item->>'badge','')
  from jsonb_array_elements(coalesce(c.selected_addons,'[]'::jsonb)) item;

  insert into public.crm_payments(reservation_id,customer_id,stock_bike_id,payment_type,method,amount,receipt_number,notes,status)
  values(v_reservation_id,v_customer_id,c.stock_bike_id,'Deposit','Card',deposit,coalesce(c.stripe_session_id,c.stripe_payment_intent_id),'Stripe online reservation','Completed')
  returning id into v_payment_id;

  update public.stripe_reservation_checkouts
    set crm_customer_id=v_customer_id, crm_lead_id=v_lead_id, crm_reservation_id=v_reservation_id, updated_at=now()
    where id=c.id;

  update public.stock_bikes set status='Reserved' where id=c.stock_bike_id;

  insert into public.crm_activities(activity_type,subject,body,status,customer_id,lead_id,reservation_id,stock_bike_id)
  values('Note','Online reservation paid','Stripe reservation completed for GBP 99. Optional extras were saved to the reservation.','Completed',v_customer_id,v_lead_id,v_reservation_id,c.stock_bike_id);

  perform public.stock_log_activity(c.stock_bike_id,'reserved','Online reservation paid',v_customer_id,v_reservation_id,null,null,v_payment_id,jsonb_build_object('stripe_checkout_id',c.id,'selected_addons',coalesce(c.selected_addons,'[]'::jsonb)),null);

  return v_reservation_id;
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
  addons_total numeric;
  invoice_total numeric;
begin
  select * into r from public.crm_reservations where id=p_reservation_id for update;
  if not found or r.status not in ('Active','Deposit Taken') then raise exception 'Active reservation not found'; end if;
  select * into bike from public.stock_bikes where id=r.stock_bike_id for update;
  if exists(select 1 from public.crm_sales where stock_bike_id=r.stock_bike_id and status not in ('Completed','Sale Completed','Cancelled')) then
    raise exception 'Motorcycle already has an active sale';
  end if;

  select coalesce(sum(amount),0) into deposit_paid from public.crm_payments where reservation_id=r.id and status='Completed' and deleted_at is null;
  select coalesce(sum(price_snapshot * quantity),0) into addons_total from public.reservation_addon_selections where reservation_id=r.id;
  invoice_total := coalesce(bike.price,0) + addons_total;
  select public.crm_next_invoice_number() into v_invoice_number;

  insert into public.crm_sales(customer_id,stock_bike_id,lead_id,reservation_id,assigned_user_id,status,sale_price,deposit_amount,balance_due,payment_status,invoice_number,created_by)
  values(r.customer_id,r.stock_bike_id,r.lead_id,r.id,coalesce(r.assigned_user_id,p_user_id),'Sale Pending',invoice_total,deposit_paid,greatest(invoice_total-deposit_paid,0),case when deposit_paid>0 then 'Part Paid' else 'Unpaid' end,v_invoice_number,p_user_id)
  returning id into v_sale_id;

  update public.crm_payments set sale_id=v_sale_id where reservation_id=r.id;
  update public.crm_reservations set status='Converted' where id=r.id;
  update public.crm_leads set status='Negotiation' where id=r.lead_id;
  update public.stock_bikes set status='Sale Pending' where id=r.stock_bike_id;

  insert into public.crm_invoices(invoice_number,sale_id,customer_id,stock_bike_id,subtotal,total,paid,balance,status,reservation_id)
  values(v_invoice_number,v_sale_id,r.customer_id,r.stock_bike_id,invoice_total,invoice_total,deposit_paid,greatest(invoice_total-deposit_paid,0),'draft',r.id)
  returning id into v_invoice_id;

  insert into public.crm_invoice_items(invoice_id,description,quantity,unit_price,item_type,sort_order)
  values(v_invoice_id,trim(concat_ws(' ',bike.year,bike.make,bike.model,bike.variant,case when bike.registration is not null then '('||bike.registration||')' end)),1,coalesce(bike.price,0),'motorcycle',0);

  insert into public.crm_invoice_items(invoice_id,description,quantity,unit_price,item_type,sort_order)
  select v_invoice_id,name_snapshot,quantity,price_snapshot,category,10 + row_number() over(order by created_at,id)
  from public.reservation_addon_selections
  where reservation_id=r.id
  order by created_at,id;

  update public.crm_payments set invoice_id=v_invoice_id where reservation_id=r.id;
  insert into public.crm_deliveries(sale_id,customer_id,stock_bike_id,assigned_user_id)
  values(v_sale_id,r.customer_id,r.stock_bike_id,coalesce(r.assigned_user_id,p_user_id));
  insert into public.crm_activities(activity_type,subject,status,customer_id,lead_id,reservation_id,stock_bike_id,sale_id,created_by)
  values('Note','Sale pending','Completed',r.customer_id,r.lead_id,r.id,r.stock_bike_id,v_sale_id,p_user_id);
  perform public.stock_log_activity(r.stock_bike_id,'sale_pending','Reservation converted to sale pending',r.customer_id,r.id,v_sale_id,v_invoice_id,null,jsonb_build_object('addons_total',addons_total),p_user_id);
  return v_sale_id;
end;
$$;

revoke all on function public.crm_complete_stripe_reservation(uuid) from public;
revoke all on function public.crm_convert_reservation_to_sale(uuid,boolean,uuid) from public;
grant execute on function public.crm_complete_stripe_reservation(uuid) to service_role;
grant execute on function public.crm_convert_reservation_to_sale(uuid,boolean,uuid) to authenticated, service_role;

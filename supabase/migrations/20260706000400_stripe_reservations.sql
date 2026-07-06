create table if not exists public.stripe_reservation_checkouts (
  id uuid primary key default gen_random_uuid(),
  stock_bike_id bigint not null references public.stock_bikes(id) on delete restrict,
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  amount_pence integer not null default 9900 check (amount_pence > 0),
  status text not null default 'Pending' check (status in ('Pending','Paid','Expired','Failed','Cancelled')),
  customer_first_name text not null, customer_last_name text not null,
  customer_email text not null, customer_phone text not null,
  expires_at timestamptz not null, paid_at timestamptz,
  crm_customer_id uuid references public.crm_customers(id) on delete set null,
  crm_lead_id uuid references public.crm_leads(id) on delete set null,
  crm_reservation_id uuid references public.crm_reservations(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists stripe_one_open_checkout_per_bike on public.stripe_reservation_checkouts(stock_bike_id) where status in ('Pending','Paid');
alter table public.stripe_reservation_checkouts enable row level security;
drop trigger if exists set_stripe_reservation_checkouts_updated_at on public.stripe_reservation_checkouts;
create trigger set_stripe_reservation_checkouts_updated_at before update on public.stripe_reservation_checkouts for each row execute function public.crm_set_updated_at();

create or replace function public.crm_complete_stripe_reservation(p_checkout_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.stripe_reservation_checkouts%rowtype; customer_id uuid; lead_id uuid; reservation_id uuid; deposit numeric;
begin
  select * into c from public.stripe_reservation_checkouts where id=p_checkout_id for update;
  if not found then raise exception 'Reservation checkout not found'; end if;
  if c.status <> 'Paid' then raise exception 'Reservation payment has not completed'; end if;
  if c.crm_reservation_id is not null then return c.crm_reservation_id; end if;
  select id into customer_id from public.crm_customers where archived_at is null and lower(email)=lower(c.customer_email) order by created_at limit 1;
  if customer_id is null then select id into customer_id from public.crm_customers where archived_at is null and phone=c.customer_phone order by created_at limit 1; end if;
  if customer_id is null then insert into public.crm_customers(first_name,last_name,email,phone,customer_status) values(c.customer_first_name,c.customer_last_name,lower(c.customer_email),c.customer_phone,'Prospect') returning id into customer_id; end if;
  insert into public.crm_leads(customer_id,source,status,preferred_bike_id,interest_level,notes)
  values(customer_id,'Website reservation','Reserved',c.stock_bike_id,'Hot','£99 online reservation paid through Stripe') returning id into lead_id;
  deposit := c.amount_pence::numeric / 100;
  insert into public.crm_reservations(customer_id,lead_id,stock_bike_id,deposit_amount,reserved_at,expires_at,status,notes)
  values(customer_id,lead_id,c.stock_bike_id,deposit,now(),now()+interval '7 days','Deposit Taken','Online Stripe reservation') returning id into reservation_id;
  insert into public.crm_payments(customer_id,reservation_id,stock_bike_id,payment_type,method,amount,receipt_number,status,notes)
  values(customer_id,reservation_id,c.stock_bike_id,'Deposit','Card',deposit,c.stripe_session_id,'Completed','Stripe online reservation payment');
  update public.stripe_reservation_checkouts set crm_customer_id=customer_id,crm_lead_id=lead_id,crm_reservation_id=reservation_id where id=c.id;
  insert into public.crm_activities(activity_type,subject,body,status,customer_id,lead_id,reservation_id,stock_bike_id)
  values('Payment','Online reservation paid','£99 Stripe reservation received','Completed',customer_id,lead_id,reservation_id,c.stock_bike_id);
  return reservation_id;
end $$;
revoke all on function public.crm_complete_stripe_reservation(uuid) from public;
grant execute on function public.crm_complete_stripe_reservation(uuid) to service_role;

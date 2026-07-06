create extension if not exists pgcrypto;

create table if not exists public.dealer_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'team_member',
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  title text, first_name text not null, last_name text not null,
  email text, phone text, alternate_phone text,
  address_line_1 text, address_line_2 text, city text, county text, postcode text,
  driving_licence_status text, finance_eligible boolean,
  marketing_email boolean not null default false, marketing_sms boolean not null default false,
  marketing_phone boolean not null default false, marketing_whatsapp boolean not null default false,
  notes text, tags text[] not null default '{}', assigned_user_id uuid references public.dealer_users(id) on delete set null,
  created_by uuid references public.dealer_users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  constraint crm_customer_contact_required check (nullif(trim(coalesce(email,'')),'') is not null or nullif(trim(coalesce(phone,'')),'') is not null)
);
create unique index if not exists crm_customers_email_unique on public.crm_customers(lower(trim(email))) where email is not null and archived_at is null;
create unique index if not exists crm_customers_phone_unique on public.crm_customers(regexp_replace(phone,'\D','','g')) where phone is not null and archived_at is null;
create index if not exists crm_customers_name_idx on public.crm_customers(last_name,first_name);

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(), customer_id uuid references public.crm_customers(id) on delete restrict,
  source text not null default 'Manual', status text not null default 'New', interest_level text,
  budget_min numeric(12,2), budget_max numeric(12,2), preferred_bike_id bigint references public.stock_bikes(id) on delete set null,
  preferred_bike_notes text, trade_in boolean not null default false, trade_in_registration text, notes text,
  assigned_user_id uuid references public.dealer_users(id) on delete set null, created_by uuid references public.dealer_users(id) on delete set null,
  lost_reason text, converted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint crm_lead_status check (status in ('New','Contacted','Qualified','Appointment Booked','Test Ride','Negotiation','Reserved','Sold','Lost')),
  constraint crm_lead_source check (source in ('Website','Phone','Walk-in','Facebook','AutoTrader','eBay','WhatsApp','Email','Manual'))
);
create index if not exists crm_leads_customer_idx on public.crm_leads(customer_id);
create index if not exists crm_leads_status_idx on public.crm_leads(status,created_at desc);

create table if not exists public.crm_enquiries (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.crm_customers(id) on delete restrict,
  lead_id uuid references public.crm_leads(id) on delete set null, stock_bike_id bigint references public.stock_bikes(id) on delete set null,
  salesperson_id uuid references public.dealer_users(id) on delete set null, source text not null default 'Website', subject text, message text not null,
  status text not null default 'New', consent boolean not null default false, metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint crm_enquiry_source check (source in ('Website','Phone','Walk-in','Facebook','AutoTrader','eBay','WhatsApp','Email','Manual')),
  constraint crm_enquiry_status check (status in ('New','Open','Replied','Closed','Spam'))
);
create index if not exists crm_enquiries_customer_idx on public.crm_enquiries(customer_id,created_at desc);

create table if not exists public.crm_reservations (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.crm_customers(id) on delete restrict,
  lead_id uuid references public.crm_leads(id) on delete set null, stock_bike_id bigint not null references public.stock_bikes(id) on delete restrict,
  assigned_user_id uuid references public.dealer_users(id) on delete set null, deposit_amount numeric(12,2) not null default 99,
  reserved_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '7 days'),
  status text not null default 'Active', notes text, created_by uuid references public.dealer_users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint crm_reservation_status check (status in ('Active','Deposit Taken','Converted','Expired','Cancelled','Refunded')),
  constraint crm_reservation_dates check (expires_at>reserved_at), constraint crm_reservation_deposit check (deposit_amount>=0)
);
create unique index if not exists crm_one_active_reservation_per_bike on public.crm_reservations(stock_bike_id) where status in ('Active','Deposit Taken');

create table if not exists public.crm_sales (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.crm_customers(id) on delete restrict,
  stock_bike_id bigint not null references public.stock_bikes(id) on delete restrict, lead_id uuid references public.crm_leads(id) on delete set null,
  reservation_id uuid references public.crm_reservations(id) on delete set null, assigned_user_id uuid references public.dealer_users(id) on delete set null,
  status text not null default 'Negotiation', sale_price numeric(12,2), deposit_amount numeric(12,2) default 0,
  balance_due numeric(12,2), payment_status text, delivery_method text, delivery_date date, completed_at timestamptz, notes text,
  created_by uuid references public.dealer_users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint crm_sale_status check (status in ('Negotiation','Reserved','Finance','Awaiting Payment','Sale Agreed','Delivery','Completed','Cancelled'))
);
create unique index if not exists crm_one_open_sale_per_bike on public.crm_sales(stock_bike_id) where status not in ('Completed','Cancelled');

create table if not exists public.crm_finance_applications (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.crm_customers(id) on delete restrict,
  sale_id uuid references public.crm_sales(id) on delete set null, stock_bike_id bigint references public.stock_bikes(id) on delete set null,
  assigned_user_id uuid references public.dealer_users(id) on delete set null, status text not null default 'Draft', lender text, decision text,
  requested_amount numeric(12,2), deposit numeric(12,2), monthly_payment numeric(12,2), term_months integer, apr numeric(7,3), notes text,
  submitted_at timestamptz, decided_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint crm_finance_status check (status in ('Draft','Submitted','Referred','Approved','Declined','Withdrawn','Completed'))
);

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(), activity_type text not null, subject text not null, body text,
  status text not null default 'Open', priority text not null default 'Normal', due_at timestamptz, completed_at timestamptz,
  customer_id uuid references public.crm_customers(id) on delete cascade, lead_id uuid references public.crm_leads(id) on delete cascade,
  reservation_id uuid references public.crm_reservations(id) on delete cascade, stock_bike_id bigint references public.stock_bikes(id) on delete cascade,
  sale_id uuid references public.crm_sales(id) on delete cascade, finance_application_id uuid references public.crm_finance_applications(id) on delete cascade,
  assigned_user_id uuid references public.dealer_users(id) on delete set null, created_by uuid references public.dealer_users(id) on delete set null,
  metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint crm_activity_type check (activity_type in ('Phone Call','Email','SMS','WhatsApp','Task','Meeting','Test Ride','Follow Up','Note')),
  constraint crm_activity_parent check (num_nonnulls(customer_id,lead_id,reservation_id,stock_bike_id,sale_id,finance_application_id)>=1)
);
create index if not exists crm_activities_due_idx on public.crm_activities(status,due_at);
create index if not exists crm_activities_customer_idx on public.crm_activities(customer_id,created_at desc);

create table if not exists public.crm_documents (
  id uuid primary key default gen_random_uuid(), file_name text not null, storage_path text not null, mime_type text, size_bytes bigint,
  document_type text not null, customer_id uuid references public.crm_customers(id) on delete cascade,
  stock_bike_id bigint references public.stock_bikes(id) on delete cascade, reservation_id uuid references public.crm_reservations(id) on delete cascade,
  sale_id uuid references public.crm_sales(id) on delete cascade, finance_application_id uuid references public.crm_finance_applications(id) on delete cascade,
  uploaded_by uuid references public.dealer_users(id) on delete set null, created_at timestamptz not null default now(),
  constraint crm_document_parent check (num_nonnulls(customer_id,stock_bike_id,reservation_id,sale_id,finance_application_id)>=1)
);

create table if not exists public.crm_communications (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.crm_customers(id) on delete cascade,
  lead_id uuid references public.crm_leads(id) on delete set null, activity_id uuid references public.crm_activities(id) on delete set null,
  channel text not null, direction text not null, subject text, body text, external_id text, occurred_at timestamptz not null default now(),
  user_id uuid references public.dealer_users(id) on delete set null, metadata jsonb not null default '{}', created_at timestamptz not null default now(),
  constraint crm_communication_channel check (channel in ('Email','SMS','WhatsApp','Phone')),
  constraint crm_communication_direction check (direction in ('Inbound','Outbound'))
);

create table if not exists public.crm_audit_log (
  id bigint generated always as identity primary key, table_name text not null, record_id uuid not null, action text not null,
  changed_by uuid references auth.users(id) on delete set null, old_data jsonb, new_data jsonb, created_at timestamptz not null default now()
);
create index if not exists crm_audit_record_idx on public.crm_audit_log(table_name,record_id,created_at desc);

create or replace function public.crm_sync_dealer_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.dealer_users(id,full_name,role) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',split_part(new.email,'@',1)),coalesce(new.raw_user_meta_data->>'role','team_member')) on conflict(id) do update set full_name=excluded.full_name; return new; end $$;
drop trigger if exists sync_dealer_user on auth.users;
create trigger sync_dealer_user after insert or update of raw_user_meta_data on auth.users for each row execute function public.crm_sync_dealer_user();
insert into public.dealer_users(id,full_name,role) select id,coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name',split_part(email,'@',1)),coalesce(raw_user_meta_data->>'role','team_member') from auth.users on conflict(id) do nothing;

create or replace function public.crm_set_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create or replace function public.crm_audit_change() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.crm_audit_log(table_name,record_id,action,changed_by,old_data,new_data) values (tg_table_name,coalesce(new.id,old.id),tg_op,auth.uid(),case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='DELETE' then null else to_jsonb(new) end); return coalesce(new,old); end $$;
create or replace function public.crm_sync_reservation_stock() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('Active','Deposit Taken') then
    if exists(select 1 from public.stock_bikes b where b.id=new.stock_bike_id and lower(b.status) in ('sold','sale completed','delivered','archived')) then raise exception 'This motorcycle is not available to reserve'; end if;
    if exists(select 1 from public.crm_reservations r where r.stock_bike_id=new.stock_bike_id and r.id<>new.id and r.status in ('Active','Deposit Taken')) then raise exception 'This motorcycle already has an active reservation'; end if;
    update public.stock_bikes set status='Reserved' where id=new.stock_bike_id and lower(status) not in ('sold','sale completed','delivered','archived');
  elsif tg_op='UPDATE' and old.status in ('Active','Deposit Taken') and new.status in ('Expired','Cancelled','Refunded') then update public.stock_bikes set status='In Stock' where id=new.stock_bike_id and lower(status)='reserved';
  elsif new.status='Converted' then update public.stock_bikes set status='Sold',sold_date=coalesce(sold_date,current_date) where id=new.stock_bike_id;
  end if; return new;
end $$;
create or replace function public.crm_expire_reservations() returns integer language plpgsql security definer set search_path='' as $$ declare affected integer; begin update public.crm_reservations set status='Expired' where status in ('Active','Deposit Taken') and expires_at<=now(); get diagnostics affected=row_count; return affected; end $$;

do $$ declare t text; begin
  foreach t in array array['dealer_users','crm_customers','crm_leads','crm_enquiries','crm_reservations','crm_sales','crm_finance_applications','crm_activities'] loop
    execute format('drop trigger if exists %I on public.%I','set_'||t||'_updated_at',t);
    execute format('create trigger %I before update on public.%I for each row execute function public.crm_set_updated_at()','set_'||t||'_updated_at',t);
  end loop;
  foreach t in array array['crm_customers','crm_leads','crm_enquiries','crm_reservations','crm_sales','crm_finance_applications','crm_activities','crm_documents','crm_communications'] loop
    execute format('drop trigger if exists %I on public.%I','audit_'||t,t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.crm_audit_change()','audit_'||t,t);
  end loop;
end $$;
drop trigger if exists sync_reservation_stock on public.crm_reservations;
create trigger sync_reservation_stock after insert or update of status on public.crm_reservations for each row execute function public.crm_sync_reservation_stock();

create or replace function public.crm_staff_can_access() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.dealer_users where id=auth.uid() and active=true) $$;
do $$ declare t text; begin foreach t in array array['dealer_users','crm_customers','crm_leads','crm_enquiries','crm_reservations','crm_sales','crm_finance_applications','crm_activities','crm_documents','crm_communications','crm_audit_log'] loop execute format('alter table public.%I enable row level security',t); execute format('drop policy if exists "Authenticated staff full access" on public.%I',t); execute format('create policy "Authenticated staff full access" on public.%I for all to authenticated using (public.crm_staff_can_access()) with check (public.crm_staff_can_access())',t); end loop; end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('crm-documents','crm-documents',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
drop policy if exists "Authenticated staff manage CRM documents" on storage.objects;
create policy "Authenticated staff manage CRM documents" on storage.objects for all to authenticated using (bucket_id='crm-documents') with check (bucket_id='crm-documents');

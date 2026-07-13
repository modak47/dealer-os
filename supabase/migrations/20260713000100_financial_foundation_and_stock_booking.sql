create extension if not exists pgcrypto;

create table if not exists public.stock_suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_type text not null default 'private_seller',
  name text not null,
  company_name text,
  email text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  town text,
  county text,
  postcode text,
  notes text,
  created_by uuid references public.dealer_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_suppliers_type_check check (supplier_type in ('private_seller','trade_supplier','auction','part_exchange','existing_customer','other'))
);

alter table public.stock_bikes
  add column if not exists supplier_id uuid references public.stock_suppliers(id) on delete set null,
  add column if not exists derivative_id text,
  add column if not exists first_registration_date date,
  add column if not exists mot_expiry date,
  add column if not exists hpi_status text,
  add column if not exists condition_summary text,
  add column if not exists target_gross_profit numeric(12,2),
  add column if not exists pricing_notes text,
  add column if not exists workshop_required boolean not null default false,
  add column if not exists pdi_required boolean not null default false,
  add column if not exists service_required boolean not null default false,
  add column if not exists mot_required boolean not null default false,
  add column if not exists diagnostic_required boolean not null default false,
  add column if not exists repair_required boolean not null default false,
  add column if not exists valet_required boolean not null default false,
  add column if not exists detail_required boolean not null default false,
  add column if not exists cosmetic_required boolean not null default false,
  add column if not exists photos_required boolean not null default false,
  add column if not exists video_required boolean not null default false,
  add column if not exists documents_required boolean not null default false,
  add column if not exists spare_key_required boolean not null default false,
  add column if not exists transport_required boolean not null default false,
  add column if not exists source_opportunity_id bigint,
  add column if not exists source_deal_id uuid references public.crm_sales(id) on delete set null;

create table if not exists public.stock_purchases (
  id uuid primary key default gen_random_uuid(),
  stock_bike_id bigint not null references public.stock_bikes(id) on delete restrict,
  supplier_id uuid references public.stock_suppliers(id) on delete set null,
  purchase_date date not null default current_date,
  purchase_price_pence bigint not null,
  payment_status text not null default 'unpaid',
  payment_method text,
  reference text,
  notes text,
  posted_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  reversal_purchase_id uuid references public.stock_purchases(id) on delete restrict,
  idempotency_key text not null,
  created_by uuid references public.dealer_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_purchases_amount_check check (purchase_price_pence >= 0),
  constraint stock_purchases_payment_status_check check (payment_status in ('unpaid','pending','part_paid','paid','void')),
  constraint stock_purchases_no_self_reversal check (reversal_purchase_id is null or reversal_purchase_id <> id)
);

create unique index if not exists stock_purchases_idempotency_key_idx on public.stock_purchases(idempotency_key);
create index if not exists stock_purchases_stock_idx on public.stock_purchases(stock_bike_id, created_at desc);

create table if not exists public.stock_costs (
  id uuid primary key default gen_random_uuid(),
  stock_bike_id bigint not null references public.stock_bikes(id) on delete restrict,
  supplier_id uuid references public.stock_suppliers(id) on delete set null,
  cost_category text not null,
  description text not null,
  amount_pence bigint not null,
  cost_date date not null default current_date,
  payment_status text not null default 'unpaid',
  payment_method text,
  reference text,
  notes text,
  posted_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  reversal_cost_id uuid references public.stock_costs(id) on delete restrict,
  idempotency_key text not null,
  created_by uuid references public.dealer_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_costs_amount_check check (amount_pence >= 0),
  constraint stock_costs_category_check check (cost_category in ('parts','workshop_labour','external_workshop','mot','transport','collection','delivery','valeting','photography','advertising','hpi','auction_fee','buyer_fee','administration','warranty','other')),
  constraint stock_costs_payment_status_check check (payment_status in ('unpaid','pending','part_paid','paid','void')),
  constraint stock_costs_no_self_reversal check (reversal_cost_id is null or reversal_cost_id <> id)
);

create unique index if not exists stock_costs_idempotency_key_idx on public.stock_costs(idempotency_key);
create index if not exists stock_costs_stock_idx on public.stock_costs(stock_bike_id, cost_date desc);

create table if not exists public.financial_ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null default current_date,
  posted_at timestamptz not null default now(),
  transaction_type text not null,
  direction text not null,
  category text not null,
  description text not null,
  amount_pence bigint not null,
  customer_id uuid references public.crm_customers(id) on delete set null,
  supplier_id uuid references public.stock_suppliers(id) on delete set null,
  stock_bike_id bigint references public.stock_bikes(id) on delete set null,
  deal_id uuid references public.crm_sales(id) on delete set null,
  invoice_id uuid references public.crm_invoices(id) on delete set null,
  payment_id uuid references public.crm_payments(id) on delete set null,
  stock_purchase_id uuid references public.stock_purchases(id) on delete set null,
  stock_cost_id uuid references public.stock_costs(id) on delete set null,
  source_type text not null,
  source_id text not null,
  idempotency_key text not null,
  payment_method text,
  reference text,
  notes text,
  status text not null default 'posted',
  voided_at timestamptz,
  reversal_of uuid references public.financial_ledger_transactions(id) on delete restrict,
  created_by uuid references public.dealer_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_ledger_amount_check check (amount_pence >= 0),
  constraint financial_ledger_direction_check check (direction in ('income','expense')),
  constraint financial_ledger_status_check check (status in ('posted','void','reversal')),
  constraint financial_ledger_no_self_reversal check (reversal_of is null or reversal_of <> id)
);

create unique index if not exists financial_ledger_idempotency_key_idx on public.financial_ledger_transactions(idempotency_key);
create index if not exists financial_ledger_date_idx on public.financial_ledger_transactions(transaction_date desc, posted_at desc);
create index if not exists financial_ledger_stock_idx on public.financial_ledger_transactions(stock_bike_id, transaction_date desc);
create index if not exists financial_ledger_deal_idx on public.financial_ledger_transactions(deal_id, transaction_date desc);
create index if not exists financial_ledger_invoice_idx on public.financial_ledger_transactions(invoice_id);

create or replace function public.crm_money_to_pence(p_amount numeric)
returns bigint
language sql
immutable
as $$
  select greatest(0, round(coalesce(p_amount, 0) * 100)::bigint);
$$;

create or replace function public.crm_pence_to_money(p_amount bigint)
returns numeric
language sql
immutable
as $$
  select round((coalesce(p_amount, 0)::numeric / 100), 2);
$$;

create or replace function public.crm_post_ledger_transaction(
  p_transaction_date date,
  p_transaction_type text,
  p_direction text,
  p_category text,
  p_description text,
  p_amount_pence bigint,
  p_source_type text,
  p_source_id text,
  p_idempotency_key text,
  p_customer_id uuid default null,
  p_supplier_id uuid default null,
  p_stock_bike_id bigint default null,
  p_deal_id uuid default null,
  p_invoice_id uuid default null,
  p_payment_id uuid default null,
  p_stock_purchase_id uuid default null,
  p_stock_cost_id uuid default null,
  p_payment_method text default null,
  p_reference text default null,
  p_notes text default null,
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(p_amount_pence, 0) < 0 then
    raise exception 'Ledger amount cannot be negative';
  end if;

  insert into public.financial_ledger_transactions(
    transaction_date, transaction_type, direction, category, description, amount_pence,
    customer_id, supplier_id, stock_bike_id, deal_id, invoice_id, payment_id,
    stock_purchase_id, stock_cost_id, source_type, source_id, idempotency_key,
    payment_method, reference, notes, created_by
  )
  values(
    coalesce(p_transaction_date, current_date), p_transaction_type, p_direction, p_category, p_description, coalesce(p_amount_pence, 0),
    p_customer_id, p_supplier_id, p_stock_bike_id, p_deal_id, p_invoice_id, p_payment_id,
    p_stock_purchase_id, p_stock_cost_id, p_source_type, p_source_id, p_idempotency_key,
    p_payment_method, p_reference, p_notes, p_created_by
  )
  on conflict(idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.stock_cost_basis_pence(p_stock_bike_id bigint)
returns bigint
language sql
stable
set search_path = public
as $$
  select
    coalesce((select sum(purchase_price_pence) from public.stock_purchases where stock_bike_id = p_stock_bike_id and voided_at is null), 0)
    + coalesce((select sum(amount_pence) from public.stock_costs where stock_bike_id = p_stock_bike_id and voided_at is null), 0);
$$;

create or replace function public.crm_post_stock_purchase_ledger(p_purchase_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.stock_purchases%rowtype;
  v_id uuid;
begin
  select * into p from public.stock_purchases where id = p_purchase_id for update;
  if not found then raise exception 'Stock purchase not found'; end if;
  if p.voided_at is not null then raise exception 'Voided stock purchase cannot be posted'; end if;

  v_id := public.crm_post_ledger_transaction(
    p.purchase_date, 'stock_purchase', 'expense', 'stock_purchase',
    'Motorcycle purchase', p.purchase_price_pence, 'stock_purchase', p.id::text,
    'stock_purchase:' || p.id::text, null, p.supplier_id, p.stock_bike_id, null, null, null, p.id, null,
    p.payment_method, p.reference, p.notes, p.created_by
  );
  update public.stock_purchases set posted_at = coalesce(posted_at, now()) where id = p.id;
  return v_id;
end;
$$;

create or replace function public.crm_post_stock_cost_ledger(p_cost_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.stock_costs%rowtype;
  v_id uuid;
begin
  select * into c from public.stock_costs where id = p_cost_id for update;
  if not found then raise exception 'Stock cost not found'; end if;
  if c.voided_at is not null then raise exception 'Voided stock cost cannot be posted'; end if;

  v_id := public.crm_post_ledger_transaction(
    c.cost_date, 'stock_cost', 'expense', c.cost_category,
    c.description, c.amount_pence, 'stock_cost', c.id::text,
    'stock_cost:' || c.id::text, null, c.supplier_id, c.stock_bike_id, null, null, null, null, c.id,
    c.payment_method, c.reference, c.notes, c.created_by
  );
  update public.stock_costs set posted_at = coalesce(posted_at, now()) where id = c.id;
  return v_id;
end;
$$;

create or replace function public.crm_post_payment_ledger(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.crm_payments%rowtype;
  v_direction text;
  v_type text;
  v_category text;
  v_id uuid;
begin
  select * into p from public.crm_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.deleted_at is not null or p.status <> 'Completed' then return null; end if;

  v_direction := case when lower(p.payment_type) like '%refund%' then 'expense' else 'income' end;
  v_type := case when v_direction = 'expense' then 'refund' else 'customer_payment' end;
  v_category := case when v_direction = 'expense' then 'refunds' else 'customer_payments' end;

  v_id := public.crm_post_ledger_transaction(
    p.paid_at::date, v_type, v_direction, v_category,
    coalesce(p.payment_type, 'Payment'), public.crm_money_to_pence(p.amount),
    'crm_payment', p.id::text, 'payment:' || p.id::text,
    p.customer_id, null, p.stock_bike_id, p.sale_id, p.invoice_id, p.id, null, null,
    p.method, p.receipt_number, p.notes, p.created_by
  );
  return v_id;
end;
$$;

alter table public.crm_payments
  drop constraint if exists crm_payment_method,
  add constraint crm_payment_method check(method in ('Cash','Card','Debit card','Credit card','Bank','Bank transfer','Bank Transfer','Finance','Finance Deposit','Part Exchange','Mixed','Other')),
  drop constraint if exists crm_payment_type_check,
  add constraint crm_payment_type_check check(payment_type in ('Deposit','Payment','Balance payment','Finance payment','Part-exchange allowance','Refund','Adjustment'));

alter table public.crm_payments
  add column if not exists invoice_id uuid references public.crm_invoices(id) on delete set null,
  add column if not exists reversal_of uuid references public.crm_payments(id) on delete restrict,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;

create or replace function public.crm_payment_ledger_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT','UPDATE') and new.status = 'Completed' and new.deleted_at is null then
    perform public.crm_post_payment_ledger(new.id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists post_payment_ledger on public.crm_payments;
create trigger post_payment_ledger
after insert or update of status, amount, payment_type, method, invoice_id
on public.crm_payments
for each row execute function public.crm_payment_ledger_changed();

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

  if s.status = 'Completed' then
    return;
  end if;
  if s.balance_due>0 then raise exception 'Outstanding balance remains'; end if;
  if not(d.identity_checked and d.licence_verified and d.v5_prepared and d.handover_completed and d.keys_given and d.documents_signed and d.hpi_complete) then raise exception 'Delivery checklist is incomplete'; end if;

  if inv.id is null then
    raise exception 'Sales invoice is required before completion';
  end if;

  sale_amount_pence := public.crm_money_to_pence(coalesce(inv.total, s.sale_price, 0));
  cost_basis_pence := public.stock_cost_basis_pence(s.stock_bike_id);

  perform public.crm_post_ledger_transaction(
    current_date, 'sale_completion', 'income', 'sales_revenue',
    'Motorcycle sale revenue', sale_amount_pence, 'sale_completion', s.id::text,
    'sale_completion:' || s.id::text, s.customer_id, null, s.stock_bike_id, s.id, inv.id, null, null, null,
    null, inv.invoice_number, s.notes, p_user_id
  );

  update public.crm_sales set status='Completed',completed_at=now(),delivery_date=current_date where id=p_sale_id;
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
end $$;

create or replace function public.book_motorcycle_into_stock(p_payload jsonb, p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock_number text;
  v_stock_id bigint;
  v_supplier_id uuid;
  v_purchase_id uuid;
  v_cost_id uuid;
  v_purchase_price_pence bigint;
  v_target_retail numeric;
  v_status text;
  v_idempotency_key text;
  v_cost jsonb;
  v_existing record;
begin
  if p_payload is null then raise exception 'Booking payload is required'; end if;
  v_idempotency_key := nullif(p_payload->>'idempotency_key','');
  if v_idempotency_key is null then raise exception 'Idempotency key is required'; end if;

  select sp.stock_bike_id, b.stock_number into v_existing
  from public.stock_purchases sp
  join public.stock_bikes b on b.id = sp.stock_bike_id
  where sp.idempotency_key = 'booking_purchase:' || v_idempotency_key
  limit 1;
  if found then
    return jsonb_build_object('stock_bike_id', v_existing.stock_bike_id, 'stock_number', v_existing.stock_number, 'existing', true);
  end if;

  if nullif(p_payload->>'make','') is null or nullif(p_payload->>'model','') is null then
    raise exception 'Make and model are required';
  end if;

  if nullif(p_payload->>'registration','') is not null and exists (
    select 1 from public.stock_bikes
    where upper(regexp_replace(coalesce(registration,''), '\s+', '', 'g')) = upper(regexp_replace(p_payload->>'registration', '\s+', '', 'g'))
      and lower(status) not in ('sold','sale completed','removed','cancelled','purchase cancelled')
  ) then
    raise exception 'An active stock bike with this registration already exists';
  end if;

  if nullif(p_payload->>'vin','') is not null and exists (
    select 1 from public.stock_bikes
    where upper(coalesce(vin,'')) = upper(p_payload->>'vin')
      and lower(status) not in ('sold','sale completed','removed','cancelled','purchase cancelled')
  ) then
    raise exception 'An active stock bike with this VIN already exists';
  end if;

  if nullif(p_payload#>>'{seller,name}','') is not null then
    insert into public.stock_suppliers(
      supplier_type, name, company_name, email, phone, address_line_1, address_line_2, town, county, postcode, notes, created_by
    )
    values(
      coalesce(nullif(p_payload#>>'{seller,type}',''),'private_seller'),
      p_payload#>>'{seller,name}',
      nullif(p_payload#>>'{seller,company_name}',''),
      nullif(p_payload#>>'{seller,email}',''),
      nullif(p_payload#>>'{seller,phone}',''),
      nullif(p_payload#>>'{seller,address_line_1}',''),
      nullif(p_payload#>>'{seller,address_line_2}',''),
      nullif(p_payload#>>'{seller,town}',''),
      nullif(p_payload#>>'{seller,county}',''),
      nullif(p_payload#>>'{seller,postcode}',''),
      nullif(p_payload#>>'{seller,notes}',''),
      p_user_id
    )
    returning id into v_supplier_id;
  end if;

  v_stock_number := public.reserve_next_stock_number();
  v_purchase_price_pence := public.crm_money_to_pence((p_payload->>'purchase_price')::numeric);
  v_target_retail := nullif(p_payload->>'target_retail_price','')::numeric;
  v_status := coalesce(nullif(p_payload->>'status',''), 'Awaiting Preparation');

  insert into public.stock_bikes(
    stock_number, registration, vin, make, model, variant, derivative_id, year, mileage, engine_cc,
    colour, fuel, transmission, previous_owners, registration_date, first_registration_date, mot_expiry,
    service_history, hpi_category, hpi_status, condition_summary, notes, status, display_status,
    show_on_website, reserve_enabled, price, purchase_price, purchase_date, purchase_source, supplier_id, seller_name,
    target_retail_price, minimum_retail_price, estimated_preparation_cost, estimated_transport_cost, other_estimated_costs,
    target_gross_profit, pricing_notes, workshop_required, pdi_required, service_required, mot_required, diagnostic_required,
    repair_required, valet_required, detail_required, cosmetic_required, photos_required, video_required, hpi_completed,
    documents_required, spare_key_required, transport_required, website_lead_id, source_opportunity_id, source_deal_id,
    created_by, updated_by, date_in_stock, workshop_status, valeting_status, photo_status
  )
  values(
    v_stock_number,
    upper(regexp_replace(coalesce(p_payload->>'registration',''), '\s+', '', 'g')),
    nullif(upper(p_payload->>'vin'),''),
    p_payload->>'make',
    p_payload->>'model',
    nullif(p_payload->>'variant',''),
    nullif(p_payload->>'derivative_id',''),
    nullif(p_payload->>'year','')::integer,
    nullif(p_payload->>'mileage','')::integer,
    nullif(p_payload->>'engine_cc','')::integer,
    nullif(p_payload->>'colour',''),
    nullif(p_payload->>'fuel',''),
    nullif(p_payload->>'transmission',''),
    nullif(p_payload->>'previous_owners','')::integer,
    nullif(p_payload->>'registration_date','')::date,
    nullif(p_payload->>'first_registration_date','')::date,
    nullif(p_payload->>'mot_expiry','')::date,
    nullif(p_payload->>'service_history',''),
    nullif(p_payload->>'hpi_category',''),
    nullif(p_payload->>'hpi_status',''),
    nullif(p_payload->>'condition',''),
    nullif(p_payload->>'notes',''),
    v_status,
    v_status,
    false,
    false,
    v_target_retail,
    public.crm_pence_to_money(v_purchase_price_pence),
    coalesce(nullif(p_payload->>'purchase_date','')::date, current_date),
    nullif(p_payload->>'purchase_source',''),
    v_supplier_id,
    nullif(p_payload#>>'{seller,name}',''),
    v_target_retail,
    nullif(p_payload->>'minimum_retail_price','')::numeric,
    nullif(p_payload->>'expected_preparation_cost','')::numeric,
    nullif(p_payload->>'collection_transport_cost','')::numeric,
    coalesce(nullif(p_payload->>'auction_buyer_fees','')::numeric,0) + coalesce(nullif(p_payload->>'other_immediate_costs','')::numeric,0),
    nullif(p_payload->>'target_gross_profit','')::numeric,
    nullif(p_payload->>'pricing_notes',''),
    coalesce((p_payload->>'workshop_required')::boolean,false),
    coalesce((p_payload->>'pdi_required')::boolean,false),
    coalesce((p_payload->>'service_required')::boolean,false),
    coalesce((p_payload->>'mot_required')::boolean,false),
    coalesce((p_payload->>'diagnostic_required')::boolean,false),
    coalesce((p_payload->>'repair_required')::boolean,false),
    coalesce((p_payload->>'valet_required')::boolean,false),
    coalesce((p_payload->>'detail_required')::boolean,false),
    coalesce((p_payload->>'cosmetic_required')::boolean,false),
    coalesce((p_payload->>'photos_required')::boolean,true),
    coalesce((p_payload->>'video_required')::boolean,false),
    coalesce((p_payload->>'hpi_check_required')::boolean,false),
    coalesce((p_payload->>'documents_required')::boolean,false),
    coalesce((p_payload->>'spare_key_required')::boolean,false),
    coalesce((p_payload->>'transport_required')::boolean,false),
    nullif(p_payload->>'website_lead_id','')::bigint,
    nullif(p_payload->>'source_opportunity_id','')::bigint,
    nullif(p_payload->>'source_deal_id','')::uuid,
    p_user_id,
    p_user_id,
    current_date,
    case when coalesce((p_payload->>'workshop_required')::boolean,false) or coalesce((p_payload->>'pdi_required')::boolean,false) then 'pending' else null end,
    case when coalesce((p_payload->>'valet_required')::boolean,false) or coalesce((p_payload->>'detail_required')::boolean,false) then 'pending' else null end,
    case when coalesce((p_payload->>'photos_required')::boolean,true) then 'pending' else null end
  )
  returning id into v_stock_id;

  insert into public.stock_purchases(
    stock_bike_id, supplier_id, purchase_date, purchase_price_pence, payment_status, payment_method, reference, notes, idempotency_key, created_by
  )
  values(
    v_stock_id, v_supplier_id, coalesce(nullif(p_payload->>'purchase_date','')::date, current_date), v_purchase_price_pence,
    coalesce(nullif(p_payload->>'payment_status',''),'unpaid'), nullif(p_payload->>'payment_method',''), nullif(p_payload->>'purchase_reference',''),
    nullif(p_payload->>'purchase_notes',''), 'booking_purchase:' || v_idempotency_key, p_user_id
  )
  returning id into v_purchase_id;

  perform public.crm_post_stock_purchase_ledger(v_purchase_id);

  for v_cost in select * from jsonb_array_elements(coalesce(p_payload->'immediate_costs','[]'::jsonb)) loop
    if public.crm_money_to_pence(nullif(v_cost->>'amount','')::numeric) > 0 then
      insert into public.stock_costs(
        stock_bike_id, supplier_id, cost_category, description, amount_pence, cost_date, payment_status, payment_method, reference, notes, idempotency_key, created_by
      )
      values(
        v_stock_id, v_supplier_id,
        coalesce(nullif(v_cost->>'category',''),'other'),
        coalesce(nullif(v_cost->>'description',''),'Immediate stock cost'),
        public.crm_money_to_pence(nullif(v_cost->>'amount','')::numeric),
        coalesce(nullif(v_cost->>'date','')::date, current_date),
        coalesce(nullif(v_cost->>'payment_status',''),'unpaid'),
        nullif(v_cost->>'payment_method',''),
        nullif(v_cost->>'reference',''),
        nullif(v_cost->>'notes',''),
        'booking_cost:' || v_idempotency_key || ':' || coalesce(nullif(v_cost->>'category',''),'other') || ':' || coalesce(nullif(v_cost->>'description',''),'cost'),
        p_user_id
      )
      returning id into v_cost_id;
      perform public.crm_post_stock_cost_ledger(v_cost_id);
    end if;
  end loop;

  perform public.stock_workflow_create_defaults(v_stock_id::text);

  return jsonb_build_object('stock_bike_id', v_stock_id, 'stock_number', v_stock_number, 'purchase_id', v_purchase_id, 'existing', false);
end;
$$;

do $$ declare t text; begin
  foreach t in array array['stock_suppliers','stock_purchases','stock_costs','financial_ledger_transactions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Authenticated staff full access" on public.%I', t);
    execute format('create policy "Authenticated staff full access" on public.%I for all to authenticated using (public.crm_staff_can_access()) with check (public.crm_staff_can_access())', t);
    execute format('drop trigger if exists %I on public.%I','set_'||t||'_updated_at',t);
    execute format('create trigger %I before update on public.%I for each row execute function public.crm_set_updated_at()','set_'||t||'_updated_at',t);
  end loop;
end $$;

revoke all on function public.book_motorcycle_into_stock(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.book_motorcycle_into_stock(jsonb, uuid) to service_role;

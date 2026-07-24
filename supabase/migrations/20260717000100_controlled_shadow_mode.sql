-- Controlled shadow-mode support for proving the DMS with real operational tables.

alter table public.stock_bikes add column if not exists is_test_record boolean not null default false;
alter table public.stock_suppliers add column if not exists is_test_record boolean not null default false;
alter table public.stock_purchases add column if not exists is_test_record boolean not null default false;
alter table public.stock_costs add column if not exists is_test_record boolean not null default false;
alter table public.financial_ledger_transactions add column if not exists is_test_record boolean not null default false;
alter table public.crm_customers add column if not exists is_test_record boolean not null default false;
alter table public.crm_leads add column if not exists is_test_record boolean not null default false;
alter table public.crm_reservations add column if not exists is_test_record boolean not null default false;
alter table public.crm_sales add column if not exists is_test_record boolean not null default false;
alter table public.crm_payments add column if not exists is_test_record boolean not null default false;
alter table public.crm_invoices add column if not exists is_test_record boolean not null default false;
alter table public.crm_invoice_items add column if not exists is_test_record boolean not null default false;
alter table public.crm_deliveries add column if not exists is_test_record boolean not null default false;
alter table public.stock_activity_events add column if not exists is_test_record boolean not null default false;

create index if not exists stock_bikes_test_idx on public.stock_bikes(is_test_record, status);
create index if not exists financial_ledger_test_idx on public.financial_ledger_transactions(is_test_record, transaction_date desc);
create index if not exists crm_sales_test_idx on public.crm_sales(is_test_record, status);

create or replace function public.stock_refresh_finance_snapshot(p_stock_bike_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_pence bigint;
  cost_pence bigint;
  total_pence bigint;
  retail_pence bigint;
begin
  select coalesce(sum(purchase_price_pence),0)
    into purchase_pence
    from public.stock_purchases
    where stock_bike_id = p_stock_bike_id and voided_at is null;

  select coalesce(sum(amount_pence),0)
    into cost_pence
    from public.stock_costs
    where stock_bike_id = p_stock_bike_id and voided_at is null;

  total_pence := coalesce(purchase_pence,0) + coalesce(cost_pence,0);

  select public.crm_money_to_pence(coalesce(price,target_retail_price,0))
    into retail_pence
    from public.stock_bikes
    where id = p_stock_bike_id;

  update public.stock_bikes
     set purchase_price = public.crm_pence_to_money(purchase_pence),
         actual_preparation_cost = public.crm_pence_to_money(cost_pence),
         total_stock_cost = public.crm_pence_to_money(total_pence),
         expected_gross_profit = public.crm_pence_to_money(coalesce(retail_pence,0) - total_pence),
         expected_net_profit = public.crm_pence_to_money(coalesce(retail_pence,0) - total_pence),
         updated_at = now()
   where id = p_stock_bike_id;
end;
$$;

create or replace function public.stock_add_cost(
  p_stock_bike_id bigint,
  p_category text,
  p_description text,
  p_amount numeric,
  p_cost_date date default current_date,
  p_payment_status text default 'unpaid',
  p_payment_method text default null,
  p_reference text default null,
  p_notes text default null,
  p_idempotency_key text default null,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost_id uuid;
  v_key text;
  v_is_test boolean;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Cost amount must be greater than zero'; end if;
  if p_category not in ('parts','workshop_labour','external_workshop','mot','transport','collection','delivery','valeting','photography','advertising','hpi','auction_fee','buyer_fee','administration','warranty','other') then
    raise exception 'Invalid stock cost category';
  end if;
  select coalesce(is_test_record,false) into v_is_test from public.stock_bikes where id = p_stock_bike_id;
  if not found then raise exception 'Stock bike not found'; end if;
  v_key := coalesce(nullif(p_idempotency_key,''),'stock_cost:'||p_stock_bike_id||':'||p_category||':'||md5(coalesce(p_description,'')||':'||coalesce(p_reference,'')));

  insert into public.stock_costs(
    stock_bike_id,cost_category,description,amount_pence,cost_date,payment_status,payment_method,reference,notes,idempotency_key,created_by,is_test_record
  )
  values(
    p_stock_bike_id,p_category,coalesce(nullif(p_description,''),p_category),public.crm_money_to_pence(p_amount),coalesce(p_cost_date,current_date),coalesce(p_payment_status,'unpaid'),p_payment_method,p_reference,p_notes,v_key,p_user_id,v_is_test
  )
  on conflict(idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning id into v_cost_id;

  perform public.crm_post_stock_cost_ledger(v_cost_id);
  update public.financial_ledger_transactions set is_test_record = v_is_test where stock_cost_id = v_cost_id;
  perform public.stock_refresh_finance_snapshot(p_stock_bike_id);
  perform public.stock_log_activity(p_stock_bike_id,'stock_cost_added','Stock cost added',null,null,null,null,null,jsonb_build_object('cost_id',v_cost_id,'amount',p_amount,'category',p_category),p_user_id);
  update public.stock_activity_events set is_test_record = v_is_test where stock_bike_id = p_stock_bike_id and metadata->>'cost_id' = v_cost_id::text;
  return v_cost_id;
end;
$$;

create or replace function public.stock_void_cost(p_cost_id uuid,p_reason text default null,p_user_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.stock_costs%rowtype;
  v_reversal_id uuid;
begin
  select * into c from public.stock_costs where id = p_cost_id for update;
  if not found then raise exception 'Stock cost not found'; end if;
  if c.voided_at is not null then return c.reversal_cost_id; end if;

  insert into public.stock_costs(
    stock_bike_id,supplier_id,cost_category,description,amount_pence,cost_date,payment_status,payment_method,reference,notes,voided_at,reversal_cost_id,idempotency_key,created_by,is_test_record
  )
  values(
    c.stock_bike_id,c.supplier_id,c.cost_category,'Reversal: '||c.description,c.amount_pence,current_date,'void',c.payment_method,c.reference,coalesce(p_reason,'Cost voided'),now(),c.id,'stock_cost_reversal:'||c.id::text,p_user_id,c.is_test_record
  )
  on conflict(idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning id into v_reversal_id;

  update public.stock_costs set voided_at = now(), reversal_cost_id = v_reversal_id, notes = concat_ws(E'\n',notes,'Voided: '||coalesce(p_reason,'No reason supplied')) where id = c.id;
  perform public.crm_post_ledger_transaction(current_date,'stock_cost_reversal','income',c.cost_category,'Stock cost reversal',c.amount_pence,'stock_cost_reversal',c.id::text,'stock_cost_reversal:'||c.id::text,null,c.supplier_id,c.stock_bike_id,null,null,null,null,v_reversal_id,c.payment_method,c.reference,p_reason,p_user_id);
  update public.financial_ledger_transactions set is_test_record = c.is_test_record where idempotency_key = 'stock_cost_reversal:'||c.id::text;
  perform public.stock_refresh_finance_snapshot(c.stock_bike_id);
  return v_reversal_id;
end;
$$;

create or replace function public.crm_record_refund(
  p_original_payment_id uuid,
  p_amount numeric,
  p_reason text,
  p_method text default 'Bank Transfer',
  p_reference text default null,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.crm_payments%rowtype;
  v_refund_id uuid;
  v_key text;
begin
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Refund reason is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Refund amount must be greater than zero'; end if;
  select * into p from public.crm_payments where id = p_original_payment_id for update;
  if not found then raise exception 'Original payment not found'; end if;
  if p.payment_type = 'Refund' then raise exception 'Cannot refund a refund payment'; end if;
  if p_amount > p.amount then raise exception 'Refund cannot exceed original payment'; end if;
  v_key := 'refund:'||p.id::text||':'||public.crm_money_to_pence(p_amount)::text;

  insert into public.crm_payments(
    sale_id,invoice_id,reservation_id,customer_id,stock_bike_id,payment_type,method,amount,receipt_number,notes,status,reversal_of,created_by,is_test_record
  )
  values(
    p.sale_id,p.invoice_id,p.reservation_id,p.customer_id,p.stock_bike_id,'Refund',p_method,p_amount,p_reference,p_reason,'Completed',p.id,p_user_id,p.is_test_record
  )
  on conflict do nothing
  returning id into v_refund_id;

  if v_refund_id is null then
    select id into v_refund_id from public.crm_payments where reversal_of = p.id and payment_type = 'Refund' and amount = p_amount limit 1;
  end if;

  perform public.crm_post_payment_ledger(v_refund_id);
  update public.financial_ledger_transactions set is_test_record = p.is_test_record where payment_id = v_refund_id;
  update public.crm_payments set status = case when status = 'Refund Required' then 'Refunded' else status end where id = p.id;
  if p.invoice_id is not null then update public.crm_invoices set status = 'credited' where id = p.invoice_id and status in ('cancelled','credited'); end if;
  return v_refund_id;
end;
$$;

create or replace view public.dealer5_shadow_health as
select
  b.id as stock_bike_id,
  b.registration,
  b.stock_number,
  b.make,
  b.model,
  b.status as yesmoto_status,
  coalesce(b.dealer5_data->'fields'->>'Current Status', b.dealer5_data->>'Current Status', b.dealer5_data->>'status') as dealer5_status,
  b.price as yesmoto_price,
  nullif(regexp_replace(coalesce(b.dealer5_data->'fields'->>'Sale Price', b.dealer5_data->>'Sale Price', b.dealer5_data->>'price'), '[^0-9.]', '', 'g'),'')::numeric as dealer5_price,
  coalesce(jsonb_array_length(to_jsonb(b.image_urls)),0) as yesmoto_image_count,
  b.dealer5_updated_at,
  b.updated_at as yesmoto_updated_at,
  b.show_on_website,
  exists(select 1 from public.crm_reservations r where r.stock_bike_id=b.id and r.status in ('Active','Deposit Taken')) as has_active_reservation,
  exists(select 1 from public.crm_sales s where s.stock_bike_id=b.id and s.status not in ('Cancelled','Completed','Sale Completed')) as has_active_sale,
  case
    when b.dealer5_id is null then 'missing_from_dealer5'
    when coalesce(b.dealer5_data,'{}'::jsonb) = '{}'::jsonb then 'missing_from_dealer5'
    when lower(coalesce(b.status,'')) in ('reserved','sale pending') and not exists(select 1 from public.crm_reservations r where r.stock_bike_id=b.id and r.status in ('Active','Deposit Taken')) and not exists(select 1 from public.crm_sales s where s.stock_bike_id=b.id and s.status not in ('Cancelled','Completed','Sale Completed')) then 'reserved_without_linked_deal'
    when lower(coalesce(coalesce(b.dealer5_data->'fields'->>'Current Status', b.dealer5_data->>'Current Status', b.dealer5_data->>'status'),'')) like '%sold%' and lower(coalesce(b.status,'')) not in ('sold','sale completed') then 'sold_externally_active_internally'
    when nullif(coalesce(b.dealer5_data->'fields'->>'Current Status', b.dealer5_data->>'Current Status', b.dealer5_data->>'status'),'') is not null and lower(coalesce(b.status,'')) <> lower(coalesce(b.dealer5_data->'fields'->>'Current Status', b.dealer5_data->>'Current Status', b.dealer5_data->>'status')) then 'status_conflict'
    when nullif(regexp_replace(coalesce(b.dealer5_data->'fields'->>'Sale Price', b.dealer5_data->>'Sale Price', b.dealer5_data->>'price'), '[^0-9.]', '', 'g'),'') is not null and b.price is not null and b.price <> nullif(regexp_replace(coalesce(b.dealer5_data->'fields'->>'Sale Price', b.dealer5_data->>'Sale Price', b.dealer5_data->>'price'), '[^0-9.]', '', 'g'),'')::numeric then 'price_conflict'
    else 'matched'
  end as health_status
from public.stock_bikes b
where coalesce(b.is_test_record,false) = false;

alter view public.dealer5_shadow_health set (security_invoker = true);

grant select on public.dealer5_shadow_health to authenticated, service_role;
grant execute on function public.stock_refresh_finance_snapshot(bigint) to authenticated, service_role;
grant execute on function public.stock_add_cost(bigint,text,text,numeric,date,text,text,text,text,text,uuid) to authenticated, service_role;
grant execute on function public.stock_void_cost(uuid,text,uuid) to authenticated, service_role;
grant execute on function public.crm_record_refund(uuid,numeric,text,text,text,uuid) to authenticated, service_role;

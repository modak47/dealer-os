create or replace function public.crm_cancel_sale(p_sale_id uuid,p_reason text default null,p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.crm_sales%rowtype;
  v_reason text := coalesce(nullif(trim(p_reason),''),'Sale cancelled');
begin
  select * into s from public.crm_sales where id=p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if s.status='Cancelled' then return; end if;
  if s.status in ('Sale Completed','Completed') then raise exception 'Completed sales must be reopened before cancellation'; end if;

  update public.crm_sales
    set status='Cancelled',cancelled_at=now(),cancelled_by=p_user_id,cancellation_reason=v_reason,completed_at=null
    where id=s.id;

  update public.crm_deliveries set status='Cancelled',completed_at=null where sale_id=s.id;
  update public.crm_invoices set status='cancelled',paid=0,balance=0,cancelled_at=now() where sale_id=s.id and deleted_at is null;
  update public.crm_payments
    set status='Refund Required', notes=concat_ws(E'\n',notes,'Sale cancelled: '||v_reason)
    where sale_id=s.id and status='Completed' and deleted_at is null;

  update public.financial_ledger_transactions
    set status='void', notes=concat_ws(E'\n',notes,'Voided after sale cancellation: '||v_reason)
    where status='posted'
      and (
        deal_id=s.id
        or invoice_id in (select id from public.crm_invoices where sale_id=s.id)
        or payment_id in (select id from public.crm_payments where sale_id=s.id)
      );

  if s.reservation_id is not null then
    update public.crm_reservations
      set status='Cancelled',cancelled_at=now(),cancelled_by=p_user_id,cancellation_reason=v_reason
      where id=s.reservation_id;
  end if;

  if exists(select 1 from public.crm_reservations where stock_bike_id=s.stock_bike_id and status in ('Active','Deposit Taken')) then
    update public.stock_bikes set status='Reserved',sold_date=null where id=s.stock_bike_id;
  else
    update public.stock_bikes set status='In Stock',sold_date=null where id=s.stock_bike_id;
  end if;

  perform public.stock_log_activity(s.stock_bike_id,'sale_cancelled',v_reason,s.customer_id,s.reservation_id,s.id,null,null,'{}'::jsonb,p_user_id);
end;
$$;

grant execute on function public.crm_cancel_sale(uuid,text,uuid) to authenticated, service_role;

update public.crm_sales
  set status='Cancelled'
  where cancelled_at is not null and status <> 'Cancelled';

update public.crm_invoices i
  set status='cancelled', paid=0, balance=0, cancelled_at=coalesce(i.cancelled_at, s.cancelled_at, now())
  from public.crm_sales s
  where i.sale_id=s.id and s.status='Cancelled' and i.deleted_at is null and i.status <> 'cancelled';

update public.crm_payments p
  set status='Refund Required', notes=concat_ws(E'\n',p.notes,'Sale cancellation repair')
  from public.crm_sales s
  where p.sale_id=s.id and s.status='Cancelled' and p.deleted_at is null and p.status='Completed';

update public.financial_ledger_transactions fl
  set status='void', notes=concat_ws(E'\n',fl.notes,'Voided by sale cancellation repair')
  where status='posted'
    and (
      deal_id in (select id from public.crm_sales where status='Cancelled')
      or invoice_id in (select i.id from public.crm_invoices i join public.crm_sales s on s.id=i.sale_id where s.status='Cancelled')
      or payment_id in (select p.id from public.crm_payments p join public.crm_sales s on s.id=p.sale_id where s.status='Cancelled')
    );

update public.stock_bikes b
  set status='In Stock', sold_date=null
  where lower(coalesce(b.status,''))='sale pending'
    and exists(select 1 from public.crm_sales s where s.stock_bike_id=b.id and s.status='Cancelled')
    and not exists(select 1 from public.crm_sales s where s.stock_bike_id=b.id and s.status not in ('Cancelled','Completed','Sale Completed'))
    and not exists(select 1 from public.crm_reservations r where r.stock_bike_id=b.id and r.status in ('Active','Deposit Taken'));

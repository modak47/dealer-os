alter table public.crm_invoices drop constraint if exists crm_invoices_status_check;

alter table public.crm_invoices
  add constraint crm_invoices_status_check
  check (status in ('draft','sent','partially_paid','paid','overdue','cancelled','credited','Open','Paid'));

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
  if p.invoice_id is not null then
    update public.crm_invoices
      set status = 'credited'
      where id = p.invoice_id
        and status in ('cancelled','credited');
  end if;
  return v_refund_id;
end;
$$;

revoke all on function public.crm_record_refund(uuid,numeric,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.crm_record_refund(uuid,numeric,text,text,text,uuid) to authenticated, service_role;

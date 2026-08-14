create or replace function public.stock_void_purchase_record(
  p_stock_bike_id bigint,
  p_reason text,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'Stock record voided');
begin
  if p_stock_bike_id is null then
    raise exception 'Stock bike is required';
  end if;

  if not exists(select 1 from public.stock_bikes where id = p_stock_bike_id for update) then
    raise exception 'Stock bike not found';
  end if;

  if exists(select 1 from public.crm_sales where stock_bike_id = p_stock_bike_id and status in ('Completed','Sale Completed')) then
    raise exception 'Completed sales must be reopened before voiding this stock record';
  end if;

  update public.stock_purchases
    set payment_status = 'void',
        voided_at = coalesce(voided_at, now()),
        void_reason = v_reason,
        is_test_record = true
    where stock_bike_id = p_stock_bike_id
      and voided_at is null;

  update public.stock_costs
    set payment_status = 'void',
        voided_at = coalesce(voided_at, now()),
        void_reason = v_reason,
        is_test_record = true
    where stock_bike_id = p_stock_bike_id
      and voided_at is null;

  update public.financial_ledger_transactions
    set status = 'void',
        notes = concat_ws(E'\n', notes, 'Voided with stock record: ' || v_reason),
        is_test_record = true
    where stock_bike_id = p_stock_bike_id
      and status = 'posted';

  update public.crm_invoices
    set status = 'cancelled',
        paid = 0,
        balance = 0,
        cancelled_at = coalesce(cancelled_at, now()),
        is_test_record = true
    where stock_bike_id = p_stock_bike_id
      and deleted_at is null
      and status <> 'cancelled';

  update public.crm_payments
    set status = case when status = 'Completed' then 'Refund Required' else status end,
        notes = concat_ws(E'\n', notes, 'Stock record voided: ' || v_reason),
        is_test_record = true
    where stock_bike_id = p_stock_bike_id
      and deleted_at is null;

  update public.crm_deliveries
    set status = 'Cancelled',
        completed_at = null,
        is_test_record = true
    where stock_bike_id = p_stock_bike_id
      and status <> 'Cancelled';

  update public.crm_sales
    set status = 'Cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        cancelled_by = p_user_id,
        cancellation_reason = coalesce(cancellation_reason, v_reason),
        completed_at = null,
        is_test_record = true
    where stock_bike_id = p_stock_bike_id
      and status not in ('Cancelled','Completed','Sale Completed');

  update public.crm_reservations
    set status = 'Cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        cancelled_by = p_user_id,
        cancellation_reason = coalesce(cancellation_reason, v_reason),
        is_test_record = true
    where stock_bike_id = p_stock_bike_id
      and status in ('Active','Deposit Taken','Converted');

  update public.stock_workflow_tasks
    set status = 'completed',
        completed_at = coalesce(completed_at, now()),
        completed_by = p_user_id::text,
        notes = concat_ws(E'\n', notes, 'Stock record voided: ' || v_reason)
    where stock_bike_id = p_stock_bike_id::text
      and status <> 'completed';

  update public.stock_bikes
    set status = 'Purchase Cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        cancellation_reason = v_reason,
        show_on_website = false,
        reserve_enabled = false,
        is_test_record = true,
        sold_date = null,
        updated_by = p_user_id
    where id = p_stock_bike_id;

  perform public.stock_log_activity(p_stock_bike_id,'stock_record_voided',v_reason,null,null,null,null,null,'{}'::jsonb,p_user_id);
  update public.stock_activity_events
    set is_test_record = true
    where stock_bike_id = p_stock_bike_id;
end;
$$;

grant execute on function public.stock_void_purchase_record(bigint,text,uuid) to authenticated, service_role;

create or replace function public.crm_undo_sale(p_sale_id uuid, p_reason text, p_user_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare s public.crm_sales%rowtype;
begin
  select * into s from public.crm_sales where id=p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if s.status='Cancelled' then raise exception 'This sale has already been reversed'; end if;
  update public.crm_sales set status='Cancelled', completed_at=null, delivery_date=null, notes=concat_ws(E'\n',notes,'Reversal: '||p_reason) where id=s.id;
  update public.stock_bikes set status='In Stock', sold_date=null where id=s.stock_bike_id;
  update public.crm_reservations set status='Cancelled', cancelled_at=now(), cancellation_reason=p_reason where id=s.reservation_id;
  update public.crm_leads set status='New' where id=s.lead_id;
  update public.crm_deliveries set status='Cancelled', completed_at=null where sale_id=s.id;
  update public.crm_invoices set status='Cancelled' where sale_id=s.id;
  update public.crm_payments set status='Refund Required', notes=concat_ws(E'\n',notes,'Sale reversed: '||p_reason) where sale_id=s.id and status='Completed';
  insert into public.crm_activities(activity_type,subject,body,status,customer_id,lead_id,reservation_id,stock_bike_id,sale_id,created_by)
  values('Note','Sale reversed',p_reason,'Completed',s.customer_id,s.lead_id,s.reservation_id,s.stock_bike_id,s.id,p_user_id);
end $$;
revoke all on function public.crm_undo_sale(uuid,text,uuid) from public;
grant execute on function public.crm_undo_sale(uuid,text,uuid) to authenticated, service_role;

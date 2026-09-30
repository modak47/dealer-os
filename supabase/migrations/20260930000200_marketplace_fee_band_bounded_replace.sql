begin;

create or replace function public.staff_replace_marketplace_fee_bands(p_bands jsonb, p_staff_user_id uuid)
returns setof public.marketplace_fee_bands
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer;
  v_invalid integer;
  v_existing_ids uuid[];
  v_deleted integer;
begin
  if not exists (
    select 1
    from public.dealer_users
    where id = p_staff_user_id
      and active = true
      and role = 'team_member'
  ) then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_bands) <> 'array' or jsonb_array_length(p_bands) = 0 then
    raise exception 'At least one fee band is required.' using errcode = '22023';
  end if;

  create temporary table if not exists pg_temp.proposed_marketplace_fee_bands (
    min_purchase_price numeric(12,2),
    max_purchase_price numeric(12,2),
    fee_amount numeric(12,2),
    sort_order integer
  ) on commit drop;
  truncate pg_temp.proposed_marketplace_fee_bands;

  insert into pg_temp.proposed_marketplace_fee_bands
    (min_purchase_price, max_purchase_price, fee_amount, sort_order)
  select
    min_purchase_price,
    max_purchase_price,
    fee_amount,
    row_number() over (order by min_purchase_price) - 1
  from jsonb_to_recordset(p_bands) as x(
    min_purchase_price numeric,
    max_purchase_price numeric,
    fee_amount numeric
  );

  select count(*) into v_count
  from pg_temp.proposed_marketplace_fee_bands;

  select count(*) into v_invalid
  from (
    select
      *,
      lag(max_purchase_price) over (order by min_purchase_price) as prior_max,
      row_number() over (order by min_purchase_price) as row_number,
      count(*) over () as total_rows
    from pg_temp.proposed_marketplace_fee_bands
  ) b
  where min_purchase_price is null
     or min_purchase_price < 0
     or fee_amount is null
     or fee_amount < 0
     or (max_purchase_price is not null and max_purchase_price <= min_purchase_price)
     or (row_number = 1 and min_purchase_price <> 0)
     or (row_number > 1 and prior_max is distinct from min_purchase_price)
     or (row_number < total_rows and max_purchase_price is null)
     or (row_number = total_rows and max_purchase_price is not null);

  if v_count = 0 or v_invalid > 0 then
    raise exception 'Fee bands must start at zero, be continuous and non-overlapping, and the final band must have no upper limit.' using errcode = '22023';
  end if;

  lock table public.marketplace_fee_bands in share row exclusive mode;

  select coalesce(array_agg(id order by id), array[]::uuid[])
    into v_existing_ids
  from public.marketplace_fee_bands;

  delete from public.marketplace_fee_bands
  where id = any(v_existing_ids);

  get diagnostics v_deleted = row_count;
  if v_deleted <> cardinality(v_existing_ids) then
    raise exception 'Marketplace fee configuration changed during replacement.' using errcode = '40001';
  end if;

  insert into public.marketplace_fee_bands(
    min_purchase_price,
    max_purchase_price,
    fee_amount,
    sort_order,
    created_by,
    updated_by
  )
  select
    min_purchase_price,
    max_purchase_price,
    fee_amount,
    sort_order,
    p_staff_user_id,
    p_staff_user_id
  from pg_temp.proposed_marketplace_fee_bands
  order by sort_order;

  insert into public.marketplace_fee_settings_history(bands, changed_by)
  select
    jsonb_agg(to_jsonb(b) - 'created_by' - 'updated_by' order by b.sort_order),
    p_staff_user_id
  from public.marketplace_fee_bands b;

  update public.marketplace_fee_settings
  set updated_at = now(),
      updated_by = p_staff_user_id
  where id = true;

  return query
  select *
  from public.marketplace_fee_bands
  order by min_purchase_price;
end;
$$;

revoke all on function public.staff_replace_marketplace_fee_bands(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.staff_replace_marketplace_fee_bands(jsonb,uuid) to service_role;

notify pgrst,'reload schema';

commit;

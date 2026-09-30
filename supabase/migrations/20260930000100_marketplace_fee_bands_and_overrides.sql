create table if not exists public.marketplace_fee_bands (
  id uuid primary key default gen_random_uuid(),
  min_purchase_price numeric(12,2) not null,
  max_purchase_price numeric(12,2),
  fee_amount numeric(12,2) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.dealer_users(id) on delete set null,
  updated_by uuid references public.dealer_users(id) on delete set null,
  constraint marketplace_fee_bands_min_check check (min_purchase_price >= 0),
  constraint marketplace_fee_bands_max_check check (max_purchase_price is null or max_purchase_price > min_purchase_price),
  constraint marketplace_fee_bands_fee_check check (fee_amount >= 0)
);

insert into public.marketplace_fee_bands(min_purchase_price,max_purchase_price,fee_amount,sort_order)
select * from (values
  (0::numeric,2000::numeric,49::numeric,0),
  (2000::numeric,4000::numeric,79::numeric,1),
  (4000::numeric,6000::numeric,99::numeric,2),
  (6000::numeric,10000::numeric,129::numeric,3),
  (10000::numeric,null::numeric,149::numeric,4)
) seed(min_price,max_price,fee,position)
where not exists (select 1 from public.marketplace_fee_bands);

alter table public.website_leads
  add column if not exists marketplace_fee_default_amount numeric(12,2),
  add column if not exists marketplace_fee_band_id uuid,
  add column if not exists marketplace_fee_calculated_at timestamptz,
  add column if not exists marketplace_fee_override_amount numeric(12,2),
  add column if not exists marketplace_fee_override_reason text,
  add column if not exists marketplace_fee_overridden_by uuid references public.dealer_users(id) on delete set null,
  add column if not exists marketplace_fee_overridden_at timestamptz;

do $$ begin
  alter table public.website_leads add constraint website_leads_marketplace_fee_default_check check (marketplace_fee_default_amount is null or marketplace_fee_default_amount >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.website_leads add constraint website_leads_marketplace_fee_override_check check (marketplace_fee_override_amount is null or marketplace_fee_override_amount >= 0);
exception when duplicate_object then null; end $$;

create table if not exists public.marketplace_fee_override_audit (
  id bigint generated always as identity primary key,
  website_lead_id bigint not null references public.website_leads(id) on delete restrict,
  default_fee_amount numeric(12,2) not null,
  previous_final_fee_amount numeric(12,2) not null,
  final_fee_amount numeric(12,2) not null,
  reason text not null,
  changed_by uuid not null references public.dealer_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint marketplace_fee_override_audit_amounts_check check (default_fee_amount >= 0 and previous_final_fee_amount >= 0 and final_fee_amount >= 0),
  constraint marketplace_fee_override_audit_reason_check check (length(trim(reason)) > 0)
);

create table if not exists public.marketplace_fee_settings_history (
  id bigint generated always as identity primary key,
  bands jsonb not null,
  changed_by uuid not null references public.dealer_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint marketplace_fee_settings_history_bands_check check (jsonb_typeof(bands) = 'array')
);

create index if not exists marketplace_fee_bands_order_idx on public.marketplace_fee_bands(min_purchase_price,sort_order);
create index if not exists marketplace_fee_override_audit_lead_idx on public.marketplace_fee_override_audit(website_lead_id,created_at desc);

alter table public.marketplace_fee_bands enable row level security;
alter table public.marketplace_fee_override_audit enable row level security;
alter table public.marketplace_fee_settings_history enable row level security;

drop policy if exists "Authenticated staff manage marketplace fee bands" on public.marketplace_fee_bands;
drop policy if exists "Authenticated staff view marketplace fee bands" on public.marketplace_fee_bands;
create policy "Authenticated staff view marketplace fee bands" on public.marketplace_fee_bands for select to authenticated using (public.crm_staff_can_access());
drop policy if exists "Authenticated staff view marketplace fee overrides" on public.marketplace_fee_override_audit;
create policy "Authenticated staff view marketplace fee overrides" on public.marketplace_fee_override_audit for select to authenticated using (public.crm_staff_can_access());
drop policy if exists "Authenticated staff view marketplace fee history" on public.marketplace_fee_settings_history;
create policy "Authenticated staff view marketplace fee history" on public.marketplace_fee_settings_history for select to authenticated using (public.crm_staff_can_access());

revoke insert,update,delete,truncate,references,trigger on public.marketplace_fee_bands from anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on public.marketplace_fee_override_audit from anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on public.marketplace_fee_settings_history from anon,authenticated;

drop trigger if exists set_marketplace_fee_bands_updated_at on public.marketplace_fee_bands;
create trigger set_marketplace_fee_bands_updated_at before update on public.marketplace_fee_bands for each row execute function public.crm_set_updated_at();

create or replace function public.marketplace_fee_for_purchase_price(p_purchase_price numeric)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  select b.fee_amount
  from public.marketplace_fee_bands b
  where p_purchase_price >= b.min_purchase_price
    and (b.max_purchase_price is null or p_purchase_price < b.max_purchase_price)
  order by b.min_purchase_price desc
  limit 1
$$;

create or replace function public.staff_replace_marketplace_fee_bands(p_bands jsonb, p_staff_user_id uuid)
returns setof public.marketplace_fee_bands
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer;
  v_invalid integer;
begin
  if not exists (select 1 from public.dealer_users where id = p_staff_user_id and active = true and role = 'team_member') then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_bands) <> 'array' or jsonb_array_length(p_bands) = 0 then
    raise exception 'At least one fee band is required.' using errcode = '22023';
  end if;

  create temporary table if not exists pg_temp.proposed_marketplace_fee_bands (
    min_purchase_price numeric(12,2), max_purchase_price numeric(12,2), fee_amount numeric(12,2), sort_order integer
  ) on commit drop;
  truncate pg_temp.proposed_marketplace_fee_bands;
  insert into pg_temp.proposed_marketplace_fee_bands
  select min_purchase_price,max_purchase_price,fee_amount,row_number() over(order by min_purchase_price)-1
  from jsonb_to_recordset(p_bands) as x(min_purchase_price numeric,max_purchase_price numeric,fee_amount numeric);

  select count(*) into v_count from pg_temp.proposed_marketplace_fee_bands;
  select count(*) into v_invalid
  from (
    select *, lag(max_purchase_price) over(order by min_purchase_price) as prior_max,
      row_number() over(order by min_purchase_price) as row_number,
      count(*) over() as total_rows
    from pg_temp.proposed_marketplace_fee_bands
  ) b
  where min_purchase_price is null or min_purchase_price < 0 or fee_amount is null or fee_amount < 0
     or (max_purchase_price is not null and max_purchase_price <= min_purchase_price)
     or (row_number = 1 and min_purchase_price <> 0)
     or (row_number > 1 and prior_max is distinct from min_purchase_price)
     or (row_number < total_rows and max_purchase_price is null)
     or (row_number = total_rows and max_purchase_price is not null);
  if v_count = 0 or v_invalid > 0 then
    raise exception 'Fee bands must start at zero, be continuous and non-overlapping, and the final band must have no upper limit.' using errcode = '22023';
  end if;

  delete from public.marketplace_fee_bands;
  insert into public.marketplace_fee_bands(min_purchase_price,max_purchase_price,fee_amount,sort_order,created_by,updated_by)
  select min_purchase_price,max_purchase_price,fee_amount,sort_order,p_staff_user_id,p_staff_user_id
  from pg_temp.proposed_marketplace_fee_bands order by sort_order;
  insert into public.marketplace_fee_settings_history(bands,changed_by)
  select jsonb_agg(to_jsonb(b) - 'created_by' - 'updated_by' order by b.sort_order),p_staff_user_id from public.marketplace_fee_bands b;
  update public.marketplace_fee_settings set updated_at = now(),updated_by = p_staff_user_id where id = true;
  return query select * from public.marketplace_fee_bands order by min_purchase_price;
end;
$$;

create or replace function public.staff_override_marketplace_fee(p_website_lead_id bigint, p_final_fee_amount numeric, p_reason text, p_staff_user_id uuid)
returns public.website_leads
language plpgsql
security definer
set search_path=''
as $$
declare
  v_lead public.website_leads;
  v_reason text := trim(coalesce(p_reason,''));
begin
  if not exists (select 1 from public.dealer_users where id = p_staff_user_id and active = true and role = 'team_member') then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  if p_final_fee_amount is null or p_final_fee_amount < 0 or v_reason = '' then
    raise exception 'A non-negative final fee and internal reason are required.' using errcode = '22023';
  end if;
  select * into v_lead from public.website_leads where id = p_website_lead_id for update;
  if v_lead.id is null or v_lead.opportunity_mode <> 'marketplace_offer' or v_lead.marketplace_accepted_offer_id is null then
    raise exception 'An accepted marketplace deal is required.' using errcode = '22023';
  end if;
  if exists (select 1 from public.dealer_purchases where website_lead_id = p_website_lead_id) then
    raise exception 'The fee is already locked to a reported purchase.' using errcode = '23505';
  end if;
  insert into public.marketplace_fee_override_audit(website_lead_id,default_fee_amount,previous_final_fee_amount,final_fee_amount,reason,changed_by)
  values(v_lead.id,coalesce(v_lead.marketplace_fee_default_amount,v_lead.marketplace_fee_amount,0),coalesce(v_lead.marketplace_fee_amount,0),p_final_fee_amount,v_reason,p_staff_user_id);
  update public.website_leads set marketplace_fee_amount=p_final_fee_amount,marketplace_fee_override_amount=p_final_fee_amount,
    marketplace_fee_override_reason=v_reason,marketplace_fee_overridden_by=p_staff_user_id,marketplace_fee_overridden_at=now(),updated_at=now()
  where id=p_website_lead_id returning * into v_lead;
  insert into public.dealer_portal_audit_events(website_lead_id,dealer_account_id,dealer_user_id,event_type,event_data)
  values(v_lead.id,v_lead.accepted_offer_dealer_account_id,p_staff_user_id,'marketplace_fee_overridden',jsonb_build_object('default_fee_amount',v_lead.marketplace_fee_default_amount,'final_fee_amount',p_final_fee_amount,'reason',v_reason));
  return v_lead;
end;
$$;

create or replace function public.seller_accept_marketplace_offer(p_website_lead_id bigint,p_offer_id uuid)
returns public.dealer_offers language plpgsql security definer set search_path='' as $$
declare
  v_offer public.dealer_offers; v_claim public.dealer_lead_claims; v_fee numeric(12,2); v_band_id uuid;
begin
  select * into v_offer from public.dealer_offers where id=p_offer_id and website_lead_id=p_website_lead_id and status in ('submitted','viewed') for update;
  if v_offer.id is null then raise exception 'Offer is no longer available.' using errcode='40001'; end if;
  perform 1 from public.website_leads where id=p_website_lead_id and opportunity_mode='marketplace_offer' and marketplace_accepted_offer_id is null and marketplace_status in ('offer_received','live_to_dealers') for update;
  if not found then raise exception 'This opportunity has already accepted an offer or is not available.' using errcode='40001'; end if;
  select id,fee_amount into v_band_id,v_fee from public.marketplace_fee_bands where (v_offer.amount_pence::numeric/100)>=min_purchase_price and (max_purchase_price is null or (v_offer.amount_pence::numeric/100)<max_purchase_price) order by min_purchase_price desc limit 1;
  if v_fee is null then raise exception 'No marketplace fee band covers this offer amount.' using errcode='22023'; end if;
  update public.dealer_offers set status=case when id=p_offer_id then 'accepted' else 'not_selected' end,accepted_at=case when id=p_offer_id then now() else accepted_at end,updated_at=now() where website_lead_id=p_website_lead_id and status in ('submitted','viewed');
  update public.website_leads set marketplace_status='offer_accepted',marketplace_accepted_offer_id=p_offer_id,marketplace_accepted_at=now(),accepted_offer_amount=round(v_offer.amount_pence::numeric/100,2),accepted_offer_dealer_account_id=v_offer.dealer_account_id,
    marketplace_fee_default_amount=v_fee,marketplace_fee_amount=v_fee,marketplace_fee_band_id=v_band_id,marketplace_fee_calculated_at=now(),marketplace_fee_override_amount=null,marketplace_fee_override_reason=null,marketplace_fee_overridden_by=null,marketplace_fee_overridden_at=null,
    status='dealer_claimed',assigned_to='dealer:'||v_offer.dealer_account_id::text,updated_at=now() where id=p_website_lead_id;
  insert into public.dealer_lead_claims(website_lead_id,dealer_account_id,dealer_user_id,allocation_id,status,attribution_expires_at)
  values(p_website_lead_id,v_offer.dealer_account_id,v_offer.dealer_user_id,v_offer.allocation_id,'agreed_to_purchase',now()+make_interval(days=>coalesce((select attribution_period_days from public.dealer_portal_accounts where id=v_offer.dealer_account_id),60))) returning * into v_claim;
  update public.dealer_lead_allocations set allocation_status=case when dealer_account_id=v_offer.dealer_account_id then 'claimed' else 'withdrawn' end,updated_at=now() where website_lead_id=p_website_lead_id and allocation_status='available';
  insert into public.dealer_portal_audit_events(website_lead_id,dealer_account_id,dealer_user_id,event_type,event_data) values(p_website_lead_id,v_offer.dealer_account_id,v_offer.dealer_user_id,'marketplace_offer_accepted',jsonb_build_object('offer_id',v_offer.id,'claim_id',v_claim.id,'amount_pence',v_offer.amount_pence,'marketplace_fee_amount',v_fee,'marketplace_fee_band_id',v_band_id));
  select * into v_offer from public.dealer_offers where id=p_offer_id; return v_offer;
end; $$;

create or replace function public.marketplace_purchase_fee_amount(p_website_lead_id bigint,p_dealer_account_id uuid)
returns numeric language sql stable security definer set search_path='' as $$
  select coalesce(l.marketplace_fee_amount,public.marketplace_fee_for_purchase_price(l.accepted_offer_amount))
  from public.website_leads l where l.id=p_website_lead_id and l.opportunity_mode='marketplace_offer' and l.accepted_offer_dealer_account_id=p_dealer_account_id
$$;

create or replace function public.record_marketplace_purchase(
  p_claim_id uuid,p_dealer_account_id uuid,p_dealer_user_id uuid,p_purchase_price numeric,p_purchase_date date,
  p_collection_date date default null,p_mileage_at_purchase integer default null,p_notes text default null,p_confirmed boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_claim public.dealer_lead_claims; v_lead public.website_leads; v_purchase public.dealer_purchases; v_fee public.dealer_purchase_fees; v_fee_amount numeric(12,2); v_now timestamptz:=now();
begin
  if not p_confirmed then raise exception 'Explicit purchase confirmation is required.' using errcode='22023'; end if;
  select c.* into v_claim from public.dealer_lead_claims c where c.id=p_claim_id and c.dealer_account_id=p_dealer_account_id for update;
  if v_claim.id is null then raise exception 'Claim not found for this dealer.' using errcode='42501'; end if;
  select l.* into v_lead from public.website_leads l where l.id=v_claim.website_lead_id and l.opportunity_mode='marketplace_offer' and l.accepted_offer_dealer_account_id=p_dealer_account_id for update;
  if v_lead.id is null then raise exception 'Accepted marketplace deal is not available.' using errcode='22023'; end if;
  select p.* into v_purchase from public.dealer_purchases p where p.claim_id=v_claim.id;
  if v_purchase.id is not null then
    select f.* into v_fee from public.dealer_purchase_fees f where f.purchase_id=v_purchase.id;
    return jsonb_build_object('purchase',to_jsonb(v_purchase),'fee',to_jsonb(v_fee),'duplicate',true);
  end if;
  if v_claim.status not in ('agreed_to_purchase','collection_booked') then raise exception 'Accepted marketplace claim is not ready for purchase.' using errcode='22023'; end if;
  if p_purchase_price is distinct from v_lead.accepted_offer_amount then raise exception 'Purchase price must match the accepted dealer offer.' using errcode='22023'; end if;
  v_fee_amount:=coalesce(v_lead.marketplace_fee_amount,public.marketplace_fee_for_purchase_price(v_lead.accepted_offer_amount));
  if v_fee_amount is null then raise exception 'Marketplace fee snapshot is missing.' using errcode='22023'; end if;
  insert into public.dealer_purchases(website_lead_id,claim_id,dealer_account_id,purchase_type,purchase_price,purchase_date,collection_date,mileage_at_purchase,notes,reported_by)
  values(v_lead.id,v_claim.id,p_dealer_account_id,'dealer_reported',p_purchase_price,p_purchase_date,p_collection_date,p_mileage_at_purchase,nullif(trim(p_notes),''),p_dealer_user_id) returning * into v_purchase;
  insert into public.dealer_purchase_fees(purchase_id,dealer_account_id,website_lead_id,fee_amount,credit_amount,adjustment_amount,invoiced_amount,paid_amount,outstanding_amount,status,notes)
  values(v_purchase.id,p_dealer_account_id,v_lead.id,v_fee_amount,0,0,0,0,v_fee_amount,'pending_invoice','MotorGeeks marketplace Successful Purchase Fee created from dealer portal purchase report.') returning * into v_fee;
  update public.dealer_lead_claims set status='purchased',outcome_at=v_now,updated_at=v_now where id=v_claim.id;
  update public.website_leads set status='dealer_purchased',marketplace_status='purchased',purchased_at=v_now,updated_at=v_now where id=v_lead.id;
  insert into public.dealer_lead_notes(website_lead_id,claim_id,dealer_account_id,dealer_user_id,note_type,body) values(v_lead.id,v_claim.id,p_dealer_account_id,p_dealer_user_id,'status','Marketplace purchase reported. Successful Purchase Fee created.');
  insert into public.dealer_portal_audit_events(website_lead_id,dealer_account_id,dealer_user_id,event_type,event_data) values(v_lead.id,p_dealer_account_id,p_dealer_user_id,'dealer_purchase_reported',jsonb_build_object('claim_id',v_claim.id,'purchase_id',v_purchase.id,'fee_id',v_fee.id,'fee_amount',v_fee_amount,'purchase_type','dealer_reported'));
  insert into public.dealer_fee_ledger_entries(fee_id,purchase_id,website_lead_id,dealer_account_id,entry_type,amount,previous_status,new_status,previous_amounts,new_amounts,note,created_by)
  values(v_fee.id,v_purchase.id,v_lead.id,p_dealer_account_id,'fee_created',v_fee_amount,null,v_fee.status,'{}'::jsonb,jsonb_build_object('fee_amount',v_fee_amount,'credit_amount',0,'adjustment_amount',0,'invoiced_amount',0,'paid_amount',0,'outstanding_amount',v_fee_amount),'MotorGeeks marketplace Successful Purchase Fee created from dealer portal purchase report.',p_dealer_user_id);
  return jsonb_build_object('purchase',to_jsonb(v_purchase),'fee',to_jsonb(v_fee),'duplicate',false);
end; $$;

revoke all on function public.marketplace_fee_for_purchase_price(numeric) from public,anon,authenticated;
revoke all on function public.staff_replace_marketplace_fee_bands(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.staff_override_marketplace_fee(bigint,numeric,text,uuid) from public,anon,authenticated;
revoke all on function public.record_marketplace_purchase(uuid,uuid,uuid,numeric,date,date,integer,text,boolean) from public,anon,authenticated;
revoke all on function public.seller_accept_marketplace_offer(bigint,uuid) from public,anon,authenticated;
revoke all on function public.marketplace_purchase_fee_amount(bigint,uuid) from public,anon,authenticated;
grant execute on function public.marketplace_fee_for_purchase_price(numeric) to service_role;
grant execute on function public.staff_replace_marketplace_fee_bands(jsonb,uuid) to service_role;
grant execute on function public.staff_override_marketplace_fee(bigint,numeric,text,uuid) to service_role;
grant execute on function public.record_marketplace_purchase(uuid,uuid,uuid,numeric,date,date,integer,text,boolean) to service_role;
grant execute on function public.seller_accept_marketplace_offer(bigint,uuid) to service_role;
grant execute on function public.marketplace_purchase_fee_amount(bigint,uuid) to service_role;

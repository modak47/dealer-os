alter table public.website_leads
  add column if not exists opportunity_mode text not null default 'direct_claim',
  add column if not exists marketplace_status text,
  add column if not exists marketplace_submitted_at timestamptz,
  add column if not exists marketplace_released_at timestamptz,
  add column if not exists marketplace_accepted_offer_id uuid,
  add column if not exists marketplace_accepted_at timestamptz,
  add column if not exists marketplace_fee_amount numeric(12,2),
  add column if not exists accepted_offer_amount numeric(12,2),
  add column if not exists accepted_offer_dealer_account_id uuid references public.dealer_portal_accounts(id) on delete set null,
  add column if not exists seller_profile jsonb not null default '{}'::jsonb,
  add column if not exists seller_condition jsonb not null default '{}'::jsonb,
  add column if not exists seller_vehicle_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists seller_progress jsonb not null default '{}'::jsonb;

alter table public.website_leads
  drop constraint if exists website_leads_opportunity_mode_check,
  add constraint website_leads_opportunity_mode_check check (opportunity_mode in ('direct_claim','marketplace_offer')),
  drop constraint if exists website_leads_marketplace_status_check,
  add constraint website_leads_marketplace_status_check check (
    marketplace_status is null or marketplace_status in (
      'draft','submitted','under_review','live_to_dealers','offer_received','offer_accepted',
      'purchase_pending','purchased','closed','cancelled'
    )
  ),
  drop constraint if exists website_leads_seller_profile_object_check,
  add constraint website_leads_seller_profile_object_check check (jsonb_typeof(seller_profile) = 'object'),
  drop constraint if exists website_leads_seller_condition_object_check,
  add constraint website_leads_seller_condition_object_check check (jsonb_typeof(seller_condition) = 'object'),
  drop constraint if exists website_leads_seller_vehicle_snapshot_object_check,
  add constraint website_leads_seller_vehicle_snapshot_object_check check (jsonb_typeof(seller_vehicle_snapshot) = 'object'),
  drop constraint if exists website_leads_seller_progress_object_check,
  add constraint website_leads_seller_progress_object_check check (jsonb_typeof(seller_progress) = 'object');

create table if not exists public.seller_valuation_drafts (
  id uuid primary key default gen_random_uuid(),
  draft_token_hash text not null unique,
  website_lead_id bigint references public.website_leads(id) on delete set null,
  current_step integer not null default 1,
  registration text,
  vehicle_snapshot jsonb not null default '{}'::jsonb,
  condition_snapshot jsonb not null default '{}'::jsonb,
  seller_snapshot jsonb not null default '{}'::jsonb,
  photo_count integer not null default 0,
  last_autosaved_at timestamptz not null default now(),
  submitted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_valuation_drafts_step_check check (current_step between 1 and 4),
  constraint seller_valuation_drafts_vehicle_object_check check (jsonb_typeof(vehicle_snapshot) = 'object'),
  constraint seller_valuation_drafts_condition_object_check check (jsonb_typeof(condition_snapshot) = 'object'),
  constraint seller_valuation_drafts_seller_object_check check (jsonb_typeof(seller_snapshot) = 'object')
);

create table if not exists public.lead_photos (
  id uuid primary key default gen_random_uuid(),
  website_lead_id bigint references public.website_leads(id) on delete cascade,
  draft_id uuid references public.seller_valuation_drafts(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text,
  content_type text not null,
  byte_size integer not null,
  width integer,
  height integer,
  sort_order integer not null default 0,
  photo_label text,
  status text not null default 'uploaded',
  uploaded_by text not null default 'seller',
  created_at timestamptz not null default now(),
  constraint lead_photos_owner_check check (website_lead_id is not null or draft_id is not null),
  constraint lead_photos_status_check check (status in ('uploading','uploaded','failed','removed')),
  constraint lead_photos_size_check check (byte_size > 0 and byte_size <= 15728640),
  constraint lead_photos_type_check check (content_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif'))
);

create table if not exists public.seller_access_tokens (
  id uuid primary key default gen_random_uuid(),
  website_lead_id bigint not null references public.website_leads(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null default 'seller_magic_link',
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint seller_access_tokens_purpose_check check (purpose in ('seller_magic_link','seller_session'))
);

create table if not exists public.dealer_offers (
  id uuid primary key default gen_random_uuid(),
  website_lead_id bigint not null references public.website_leads(id) on delete cascade,
  dealer_account_id uuid not null references public.dealer_portal_accounts(id) on delete restrict,
  dealer_user_id uuid references auth.users(id) on delete set null,
  allocation_id uuid references public.dealer_lead_allocations(id) on delete set null,
  amount_pence integer not null,
  note text,
  status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  revised_at timestamptz,
  withdrawn_at timestamptz,
  accepted_at timestamptz,
  viewed_by_seller_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_offers_amount_check check (amount_pence > 0),
  constraint dealer_offers_status_check check (status in ('submitted','viewed','accepted','not_selected','withdrawn','closed'))
);

create table if not exists public.marketplace_fee_settings (
  id boolean primary key default true,
  successful_purchase_fee numeric(12,2) not null default 0,
  fee_trigger text not null default 'purchase_reported',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.dealer_users(id) on delete set null,
  constraint marketplace_fee_settings_singleton check (id = true),
  constraint marketplace_fee_settings_fee_check check (successful_purchase_fee >= 0),
  constraint marketplace_fee_settings_trigger_check check (fee_trigger in ('purchase_reported','offer_accepted'))
);

insert into public.marketplace_fee_settings(id, successful_purchase_fee)
values(true, 0)
on conflict (id) do nothing;

create index if not exists website_leads_marketplace_status_idx
  on public.website_leads(opportunity_mode, marketplace_status, submitted_at desc);
create index if not exists seller_valuation_drafts_token_idx
  on public.seller_valuation_drafts(draft_token_hash);
create index if not exists lead_photos_lead_idx
  on public.lead_photos(website_lead_id, sort_order, created_at);
create index if not exists lead_photos_draft_idx
  on public.lead_photos(draft_id, sort_order, created_at);
create index if not exists seller_access_tokens_token_idx
  on public.seller_access_tokens(token_hash);
create index if not exists seller_access_tokens_lead_idx
  on public.seller_access_tokens(website_lead_id, created_at desc);
create index if not exists dealer_offers_lead_idx
  on public.dealer_offers(website_lead_id, submitted_at desc);
create index if not exists dealer_offers_dealer_idx
  on public.dealer_offers(dealer_account_id, submitted_at desc);

create unique index if not exists dealer_offers_one_current_offer_idx
  on public.dealer_offers(website_lead_id, dealer_account_id)
  where status in ('submitted','viewed');

create unique index if not exists dealer_offers_one_accepted_offer_idx
  on public.dealer_offers(website_lead_id)
  where status = 'accepted';

alter table public.seller_valuation_drafts enable row level security;
alter table public.lead_photos enable row level security;
alter table public.seller_access_tokens enable row level security;
alter table public.dealer_offers enable row level security;
alter table public.marketplace_fee_settings enable row level security;

do $$ declare t text; begin
  foreach t in array array[
    'seller_valuation_drafts',
    'lead_photos',
    'seller_access_tokens',
    'dealer_offers',
    'marketplace_fee_settings'
  ] loop
    execute format('drop policy if exists "Authenticated staff manage marketplace" on public.%I', t);
    execute format('create policy "Authenticated staff manage marketplace" on public.%I for all to authenticated using (public.crm_staff_can_access()) with check (public.crm_staff_can_access())', t);
  end loop;
end $$;

drop trigger if exists set_seller_valuation_drafts_updated_at on public.seller_valuation_drafts;
create trigger set_seller_valuation_drafts_updated_at before update on public.seller_valuation_drafts for each row execute function public.crm_set_updated_at();
drop trigger if exists set_dealer_offers_updated_at on public.dealer_offers;
create trigger set_dealer_offers_updated_at before update on public.dealer_offers for each row execute function public.crm_set_updated_at();
drop trigger if exists set_marketplace_fee_settings_updated_at on public.marketplace_fee_settings;
create trigger set_marketplace_fee_settings_updated_at before update on public.marketplace_fee_settings for each row execute function public.crm_set_updated_at();

create or replace function public.dealer_submit_marketplace_offer(
  p_website_lead_id bigint,
  p_dealer_account_id uuid,
  p_dealer_user_id uuid,
  p_amount_pence integer,
  p_note text default null
) returns public.dealer_offers
language plpgsql
security definer
set search_path=''
as $$
declare
  v_allocation_id uuid;
  v_offer public.dealer_offers;
begin
  select a.id into v_allocation_id
  from public.dealer_lead_allocations a
  join public.dealer_portal_accounts d on d.id = a.dealer_account_id
  join public.website_leads l on l.id = a.website_lead_id
  where a.website_lead_id = p_website_lead_id
    and a.dealer_account_id = p_dealer_account_id
    and a.allocation_status = 'available'
    and d.account_status = 'active'
    and l.opportunity_mode = 'marketplace_offer'
    and l.marketplace_status in ('live_to_dealers','offer_received')
  limit 1;

  if v_allocation_id is null then
    raise exception 'Dealer is not authorised to offer on this opportunity.' using errcode = '42501';
  end if;
  if p_amount_pence is null or p_amount_pence <= 0 then
    raise exception 'Offer amount must be greater than zero.' using errcode = '22023';
  end if;

  insert into public.dealer_offers(website_lead_id,dealer_account_id,dealer_user_id,allocation_id,amount_pence,note)
  values(p_website_lead_id,p_dealer_account_id,p_dealer_user_id,v_allocation_id,p_amount_pence,nullif(trim(p_note),''))
  on conflict (website_lead_id,dealer_account_id) where status in ('submitted','viewed')
  do update set amount_pence = excluded.amount_pence, note = excluded.note, dealer_user_id = excluded.dealer_user_id, revised_at = now(), updated_at = now()
  returning * into v_offer;

  update public.website_leads
  set marketplace_status = 'offer_received',
      updated_at = now()
  where id = p_website_lead_id
    and marketplace_status = 'live_to_dealers';

  insert into public.dealer_portal_audit_events(website_lead_id,dealer_account_id,dealer_user_id,event_type,event_data)
  values(p_website_lead_id,p_dealer_account_id,p_dealer_user_id,'marketplace_offer_submitted',jsonb_build_object('offer_id',v_offer.id,'amount_pence',v_offer.amount_pence));

  return v_offer;
end;
$$;

create or replace function public.seller_accept_marketplace_offer(
  p_website_lead_id bigint,
  p_offer_id uuid
) returns public.dealer_offers
language plpgsql
security definer
set search_path=''
as $$
declare
  v_offer public.dealer_offers;
  v_claim public.dealer_lead_claims;
  v_fee numeric(12,2);
begin
  select * into v_offer
  from public.dealer_offers
  where id = p_offer_id
    and website_lead_id = p_website_lead_id
    and status in ('submitted','viewed')
  for update;

  if v_offer.id is null then
    raise exception 'Offer is no longer available.' using errcode = '40001';
  end if;

  perform 1
  from public.website_leads
  where id = p_website_lead_id
    and opportunity_mode = 'marketplace_offer'
    and marketplace_accepted_offer_id is null
    and marketplace_status in ('offer_received','live_to_dealers')
  for update;

  if not found then
    raise exception 'This opportunity has already accepted an offer or is not available.' using errcode = '40001';
  end if;

  select successful_purchase_fee into v_fee from public.marketplace_fee_settings where id = true;

  update public.dealer_offers
  set status = case when id = p_offer_id then 'accepted' else 'not_selected' end,
      accepted_at = case when id = p_offer_id then now() else accepted_at end,
      updated_at = now()
  where website_lead_id = p_website_lead_id
    and status in ('submitted','viewed');

  update public.website_leads
  set marketplace_status = 'offer_accepted',
      marketplace_accepted_offer_id = p_offer_id,
      marketplace_accepted_at = now(),
      accepted_offer_amount = round(v_offer.amount_pence::numeric / 100, 2),
      accepted_offer_dealer_account_id = v_offer.dealer_account_id,
      marketplace_fee_amount = coalesce(v_fee,0),
      status = 'dealer_claimed',
      assigned_to = 'dealer:' || v_offer.dealer_account_id::text,
      updated_at = now()
  where id = p_website_lead_id;

  insert into public.dealer_lead_claims(
    website_lead_id,
    dealer_account_id,
    dealer_user_id,
    allocation_id,
    status,
    attribution_expires_at
  )
  values(
    p_website_lead_id,
    v_offer.dealer_account_id,
    v_offer.dealer_user_id,
    v_offer.allocation_id,
    'agreed_to_purchase',
    now() + make_interval(days => coalesce((select attribution_period_days from public.dealer_portal_accounts where id = v_offer.dealer_account_id),60))
  )
  returning * into v_claim;

  update public.dealer_lead_allocations
  set allocation_status = case when dealer_account_id = v_offer.dealer_account_id then 'claimed' else 'withdrawn' end,
      updated_at = now()
  where website_lead_id = p_website_lead_id
    and allocation_status = 'available';

  insert into public.dealer_portal_audit_events(website_lead_id,dealer_account_id,dealer_user_id,event_type,event_data)
  values(p_website_lead_id,v_offer.dealer_account_id,v_offer.dealer_user_id,'marketplace_offer_accepted',jsonb_build_object('offer_id',v_offer.id,'claim_id',v_claim.id,'amount_pence',v_offer.amount_pence,'marketplace_fee_amount',coalesce(v_fee,0)));

  select * into v_offer from public.dealer_offers where id = p_offer_id;
  return v_offer;
end;
$$;

alter table public.website_leads
  drop constraint if exists website_leads_marketplace_accepted_offer_fk,
  add constraint website_leads_marketplace_accepted_offer_fk foreign key (marketplace_accepted_offer_id) references public.dealer_offers(id) on delete set null;

create or replace function public.marketplace_purchase_fee_amount(p_website_lead_id bigint, p_dealer_account_id uuid)
returns numeric
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(l.marketplace_fee_amount, s.successful_purchase_fee, d.successful_purchase_fee, 0)
  from public.website_leads l
  join public.dealer_portal_accounts d on d.id = p_dealer_account_id
  left join public.marketplace_fee_settings s on s.id = true
  where l.id = p_website_lead_id
$$;

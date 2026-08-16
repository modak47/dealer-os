create table if not exists public.dealer_portal_accounts (
  id uuid primary key default gen_random_uuid(),
  trading_name text not null,
  limited_company_name text,
  company_registration_number text,
  vat_number text,
  registered_address text,
  trading_address text,
  main_contact text,
  telephone text,
  mobile_whatsapp text,
  main_email text,
  accounts_email text,
  website text,
  postcode text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  autotrader_dealer_ref text,
  account_status text not null default 'pending',
  successful_purchase_fee numeric(12,2) not null default 50,
  attribution_period_days integer not null default 60,
  claim_expiry_hours integer,
  update_deadline_hours integer,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.dealer_users(id) on delete set null,
  updated_by uuid references public.dealer_users(id) on delete set null,
  constraint dealer_portal_accounts_status_check check (account_status in ('pending','active','suspended','closed')),
  constraint dealer_portal_accounts_fee_check check (successful_purchase_fee >= 0),
  constraint dealer_portal_accounts_attribution_check check (attribution_period_days >= 0)
);

create table if not exists public.dealer_portal_users (
  id uuid primary key default gen_random_uuid(),
  dealer_account_id uuid not null references public.dealer_portal_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'dealer_user',
  active boolean not null default true,
  invited_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.dealer_users(id) on delete set null,
  updated_by uuid references public.dealer_users(id) on delete set null,
  constraint dealer_portal_users_role_check check (role in ('dealer_admin','dealer_user')),
  unique(dealer_account_id,user_id)
);

create table if not exists public.dealer_buying_preferences (
  dealer_account_id uuid primary key references public.dealer_portal_accounts(id) on delete cascade,
  motorcycle_types text[] not null default '{}',
  makes_wanted text[] not null default '{}',
  makes_excluded text[] not null default '{}',
  models_wanted text[] not null default '{}',
  minimum_year integer,
  maximum_age_years integer,
  minimum_value numeric(12,2),
  maximum_value numeric(12,2),
  maximum_mileage integer,
  minimum_engine_cc integer,
  maximum_engine_cc integer,
  accepts_non_running boolean not null default false,
  accepts_insurance_category boolean not null default false,
  accepts_outstanding_finance boolean not null default false,
  accepts_imported boolean not null default false,
  accepts_modified boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dealer_geography_preferences (
  dealer_account_id uuid primary key references public.dealer_portal_accounts(id) on delete cascade,
  england boolean not null default true,
  wales boolean not null default true,
  scotland boolean not null default false,
  northern_ireland boolean not null default false,
  republic_of_ireland boolean not null default false,
  maximum_radius_miles numeric(8,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dealer_lead_allocations (
  id uuid primary key default gen_random_uuid(),
  website_lead_id bigint not null references public.website_leads(id) on delete cascade,
  dealer_account_id uuid references public.dealer_portal_accounts(id) on delete cascade,
  allocation_method text not null default 'matching_pool',
  allocation_status text not null default 'available',
  match_score numeric(5,2),
  match_reasons jsonb not null default '{}'::jsonb,
  excluded_reasons jsonb not null default '{}'::jsonb,
  allocated_at timestamptz not null default now(),
  notified_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.dealer_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.dealer_users(id) on delete set null,
  constraint dealer_lead_allocations_method_check check (allocation_method in ('direct','dealer_group','matching_pool','priority')),
  constraint dealer_lead_allocations_status_check check (allocation_status in ('available','claimed','expired','withdrawn','excluded'))
);

create table if not exists public.dealer_lead_claims (
  id uuid primary key default gen_random_uuid(),
  website_lead_id bigint not null references public.website_leads(id) on delete cascade,
  dealer_account_id uuid not null references public.dealer_portal_accounts(id) on delete restrict,
  dealer_user_id uuid references auth.users(id) on delete set null,
  allocation_id uuid references public.dealer_lead_allocations(id) on delete set null,
  status text not null default 'claimed',
  claimed_at timestamptz not null default now(),
  customer_details_unlocked_at timestamptz not null default now(),
  outcome_at timestamptz,
  lost_reason text,
  returned_at timestamptz,
  attribution_expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_lead_claims_status_check check (status in ('claimed','attempting_contact','contacted','offer_made','negotiating','agreed_to_purchase','collection_booked','purchased','lost','returned_to_pool','purchased_later'))
);

create unique index if not exists dealer_lead_claims_one_active_claim_idx
  on public.dealer_lead_claims(website_lead_id)
  where status in ('claimed','attempting_contact','contacted','offer_made','negotiating','agreed_to_purchase','collection_booked','purchased','purchased_later');

create index if not exists dealer_lead_claims_dealer_idx
  on public.dealer_lead_claims(dealer_account_id, claimed_at desc);

create table if not exists public.dealer_lead_notes (
  id uuid primary key default gen_random_uuid(),
  website_lead_id bigint not null references public.website_leads(id) on delete cascade,
  claim_id uuid references public.dealer_lead_claims(id) on delete cascade,
  dealer_account_id uuid not null references public.dealer_portal_accounts(id) on delete cascade,
  dealer_user_id uuid references auth.users(id) on delete set null,
  note_type text not null default 'note',
  body text not null,
  created_at timestamptz not null default now(),
  constraint dealer_lead_notes_type_check check (note_type in ('note','call','email','sms','whatsapp','offer','status'))
);

create table if not exists public.dealer_purchases (
  id uuid primary key default gen_random_uuid(),
  website_lead_id bigint not null references public.website_leads(id) on delete restrict,
  claim_id uuid not null references public.dealer_lead_claims(id) on delete restrict,
  dealer_account_id uuid not null references public.dealer_portal_accounts(id) on delete restrict,
  purchase_type text not null default 'dealer_reported',
  purchase_price numeric(12,2) not null,
  purchase_date date not null,
  collection_date date,
  mileage_at_purchase integer,
  notes text,
  reported_by uuid references auth.users(id) on delete set null,
  reported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint dealer_purchases_type_check check (purchase_type in ('dealer_reported','dealer_reported_later','stock_matching_admin_confirmed','other')),
  constraint dealer_purchases_price_check check (purchase_price >= 0)
);

create table if not exists public.dealer_purchase_fees (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.dealer_purchases(id) on delete restrict,
  dealer_account_id uuid not null references public.dealer_portal_accounts(id) on delete restrict,
  website_lead_id bigint not null references public.website_leads(id) on delete restrict,
  fee_amount numeric(12,2) not null,
  status text not null default 'pending_invoice',
  credit_amount numeric(12,2) not null default 0,
  adjustment_amount numeric(12,2) not null default 0,
  invoiced_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_purchase_fees_status_check check (status in ('pending_invoice','invoiced','paid','credited','void')),
  constraint dealer_purchase_fees_amount_check check (fee_amount >= 0)
);

create table if not exists public.dealer_portal_audit_events (
  id bigint generated always as identity primary key,
  website_lead_id bigint references public.website_leads(id) on delete set null,
  dealer_account_id uuid references public.dealer_portal_accounts(id) on delete set null,
  dealer_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dealer_portal_audit_lead_idx
  on public.dealer_portal_audit_events(website_lead_id, created_at desc);

drop trigger if exists set_dealer_portal_accounts_updated_at on public.dealer_portal_accounts;
create trigger set_dealer_portal_accounts_updated_at before update on public.dealer_portal_accounts for each row execute function public.crm_set_updated_at();
drop trigger if exists set_dealer_portal_users_updated_at on public.dealer_portal_users;
create trigger set_dealer_portal_users_updated_at before update on public.dealer_portal_users for each row execute function public.crm_set_updated_at();
drop trigger if exists set_dealer_buying_preferences_updated_at on public.dealer_buying_preferences;
create trigger set_dealer_buying_preferences_updated_at before update on public.dealer_buying_preferences for each row execute function public.crm_set_updated_at();
drop trigger if exists set_dealer_geography_preferences_updated_at on public.dealer_geography_preferences;
create trigger set_dealer_geography_preferences_updated_at before update on public.dealer_geography_preferences for each row execute function public.crm_set_updated_at();
drop trigger if exists set_dealer_lead_claims_updated_at on public.dealer_lead_claims;
create trigger set_dealer_lead_claims_updated_at before update on public.dealer_lead_claims for each row execute function public.crm_set_updated_at();
drop trigger if exists set_dealer_purchase_fees_updated_at on public.dealer_purchase_fees;
create trigger set_dealer_purchase_fees_updated_at before update on public.dealer_purchase_fees for each row execute function public.crm_set_updated_at();

create or replace function public.dealer_claim_lead(
  p_website_lead_id bigint,
  p_dealer_account_id uuid,
  p_dealer_user_id uuid
) returns public.dealer_lead_claims
language plpgsql
security definer
set search_path=''
as $$
declare
  v_allocation_id uuid;
  v_claim public.dealer_lead_claims;
  v_attribution_days integer;
begin
  select a.id
    into v_allocation_id
  from public.dealer_lead_allocations a
  join public.dealer_portal_accounts d on d.id = a.dealer_account_id
  where a.website_lead_id = p_website_lead_id
    and a.dealer_account_id = p_dealer_account_id
    and a.allocation_status = 'available'
    and d.account_status = 'active'
  order by a.allocated_at desc
  limit 1;

  if v_allocation_id is null then
    return null;
  end if;

  select attribution_period_days
    into v_attribution_days
  from public.dealer_portal_accounts
  where id = p_dealer_account_id;

  update public.website_leads
  set status = 'dealer_claimed',
      assigned_to = 'dealer:' || p_dealer_account_id::text,
      updated_at = now()
  where id = p_website_lead_id
    and status in ('dealer_pool_available','dealer_allocated','referred_to_dealer')
    and not exists (
      select 1 from public.dealer_lead_claims c
      where c.website_lead_id = p_website_lead_id
        and c.status in ('claimed','attempting_contact','contacted','offer_made','negotiating','agreed_to_purchase','collection_booked','purchased','purchased_later')
    );

  if not found then
    insert into public.dealer_portal_audit_events(website_lead_id,dealer_account_id,dealer_user_id,event_type,event_data)
    values(p_website_lead_id,p_dealer_account_id,p_dealer_user_id,'claim_rejected','{"reason":"already_claimed_or_unavailable"}'::jsonb);
    return null;
  end if;

  insert into public.dealer_lead_claims(
    website_lead_id,
    dealer_account_id,
    dealer_user_id,
    allocation_id,
    attribution_expires_at
  )
  values(
    p_website_lead_id,
    p_dealer_account_id,
    p_dealer_user_id,
    v_allocation_id,
    now() + make_interval(days => coalesce(v_attribution_days, 60))
  )
  returning * into v_claim;

  update public.dealer_lead_allocations
  set allocation_status = case when id = v_allocation_id then 'claimed' else 'withdrawn' end,
      updated_at = now()
  where website_lead_id = p_website_lead_id
    and allocation_status = 'available';

  insert into public.dealer_portal_audit_events(website_lead_id,dealer_account_id,dealer_user_id,event_type,event_data)
  values(p_website_lead_id,p_dealer_account_id,p_dealer_user_id,'lead_claimed',jsonb_build_object('claim_id',v_claim.id,'allocation_id',v_allocation_id));

  return v_claim;
end;
$$;

alter table public.dealer_portal_accounts enable row level security;
alter table public.dealer_portal_users enable row level security;
alter table public.dealer_buying_preferences enable row level security;
alter table public.dealer_geography_preferences enable row level security;
alter table public.dealer_lead_allocations enable row level security;
alter table public.dealer_lead_claims enable row level security;
alter table public.dealer_lead_notes enable row level security;
alter table public.dealer_purchases enable row level security;
alter table public.dealer_purchase_fees enable row level security;
alter table public.dealer_portal_audit_events enable row level security;

do $$ declare t text; begin
  foreach t in array array[
    'dealer_portal_accounts',
    'dealer_portal_users',
    'dealer_buying_preferences',
    'dealer_geography_preferences',
    'dealer_lead_allocations',
    'dealer_lead_claims',
    'dealer_lead_notes',
    'dealer_purchases',
    'dealer_purchase_fees',
    'dealer_portal_audit_events'
  ] loop
    execute format('drop policy if exists "Authenticated staff manage dealer portal" on public.%I', t);
    execute format('create policy "Authenticated staff manage dealer portal" on public.%I for all to authenticated using (public.crm_staff_can_access()) with check (public.crm_staff_can_access())', t);
  end loop;
end $$;

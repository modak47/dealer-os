alter table public.website_leads
  add column if not exists latest_referral_id uuid,
  add column if not exists latest_referred_dealer_id uuid,
  add column if not exists latest_referred_dealer_name text,
  add column if not exists latest_referred_at timestamptz,
  add column if not exists referral_count integer not null default 0;

create table if not exists public.dealer_contacts (
  id uuid primary key default gen_random_uuid(),
  dealer_name text not null,
  contact_name text,
  email text,
  mobile_number text,
  landline_number text,
  whatsapp_number text,
  town text,
  postcode text,
  notes text,
  preferred_contact_method text not null default 'email',
  active boolean not null default true,
  brands_handled text[] not null default '{}',
  max_collection_radius_miles numeric(8,2),
  bike_types_interested text,
  min_purchase_value numeric(12,2),
  max_purchase_value numeric(12,2),
  referral_fee_arrangement text,
  last_referral_date timestamptz,
  total_referrals integer not null default 0,
  successful_referrals integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.dealer_users(id) on delete set null,
  updated_by uuid references public.dealer_users(id) on delete set null,
  constraint dealer_contacts_method_check check (preferred_contact_method in ('email','whatsapp','sms','phone')),
  constraint dealer_contacts_contact_check check (
    nullif(trim(coalesce(email,'')),'') is not null
    or nullif(trim(coalesce(mobile_number,'')),'') is not null
    or nullif(trim(coalesce(landline_number,'')),'') is not null
    or nullif(trim(coalesce(whatsapp_number,'')),'') is not null
  )
);

create table if not exists public.lead_referrals (
  id uuid primary key default gen_random_uuid(),
  website_lead_id bigint not null references public.website_leads(id) on delete cascade,
  dealer_contact_id uuid not null references public.dealer_contacts(id) on delete restrict,
  communication_method text not null,
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  message_subject text,
  message_body text not null,
  information_shared jsonb not null default '{}'::jsonb,
  customer_details_included jsonb not null default '{}'::jsonb,
  customer_consent_confirmed boolean not null default false,
  customer_consent_source text,
  customer_consent_confirmed_at timestamptz,
  customer_consent_confirmed_by uuid references public.dealer_users(id) on delete set null,
  referral_status text not null default 'Draft',
  dealer_outcome text not null default 'Awaiting response',
  sent_at timestamptz,
  opened_externally_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  provider text,
  provider_message_id text,
  provider_response jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.dealer_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.dealer_users(id) on delete set null,
  constraint lead_referrals_method_check check (communication_method in ('email','whatsapp','sms')),
  constraint lead_referrals_status_check check (referral_status in ('Draft','Prepared','Sent','Opened in WhatsApp','Opened in SMS','Failed','Cancelled','Dealer Interested','Dealer Declined','Customer Contacted','Completed')),
  constraint lead_referrals_outcome_check check (dealer_outcome in ('Awaiting response','Dealer interested','Dealer declined','Customer contacted','Completed','Cancelled'))
);

alter table public.website_leads
  drop constraint if exists website_leads_latest_referral_fk,
  add constraint website_leads_latest_referral_fk foreign key (latest_referral_id) references public.lead_referrals(id) on delete set null;

alter table public.website_leads
  drop constraint if exists website_leads_latest_referred_dealer_fk,
  add constraint website_leads_latest_referred_dealer_fk foreign key (latest_referred_dealer_id) references public.dealer_contacts(id) on delete set null;

create index if not exists dealer_contacts_active_idx on public.dealer_contacts(active, dealer_name);
create index if not exists dealer_contacts_search_idx on public.dealer_contacts(dealer_name, town);
create index if not exists lead_referrals_lead_idx on public.lead_referrals(website_lead_id, created_at desc);
create index if not exists lead_referrals_dealer_idx on public.lead_referrals(dealer_contact_id, created_at desc);
create index if not exists website_leads_latest_referral_idx on public.website_leads(latest_referred_at desc) where latest_referral_id is not null;

drop trigger if exists set_dealer_contacts_updated_at on public.dealer_contacts;
create trigger set_dealer_contacts_updated_at before update on public.dealer_contacts for each row execute function public.crm_set_updated_at();

drop trigger if exists set_lead_referrals_updated_at on public.lead_referrals;
create trigger set_lead_referrals_updated_at before update on public.lead_referrals for each row execute function public.crm_set_updated_at();

alter table public.dealer_contacts enable row level security;
alter table public.lead_referrals enable row level security;

drop policy if exists "Authenticated staff read dealer contacts" on public.dealer_contacts;
create policy "Authenticated staff read dealer contacts" on public.dealer_contacts for select to authenticated using(public.crm_staff_can_access());
drop policy if exists "Authenticated staff manage dealer contacts" on public.dealer_contacts;
create policy "Authenticated staff manage dealer contacts" on public.dealer_contacts for all to authenticated using(public.crm_staff_can_access()) with check(public.crm_staff_can_access());

drop policy if exists "Authenticated staff read lead referrals" on public.lead_referrals;
create policy "Authenticated staff read lead referrals" on public.lead_referrals for select to authenticated using(public.crm_staff_can_access());
drop policy if exists "Authenticated staff manage lead referrals" on public.lead_referrals;
create policy "Authenticated staff manage lead referrals" on public.lead_referrals for all to authenticated using(public.crm_staff_can_access()) with check(public.crm_staff_can_access());

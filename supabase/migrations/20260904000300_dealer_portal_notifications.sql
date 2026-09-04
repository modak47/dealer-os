create table if not exists public.dealer_portal_notifications (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,
  website_lead_id bigint references public.website_leads(id) on delete set null,
  dealer_account_id uuid not null references public.dealer_portal_accounts(id) on delete restrict,
  dealer_user_id uuid references auth.users(id) on delete set null,
  allocation_id uuid references public.dealer_lead_allocations(id) on delete set null,
  claim_id uuid references public.dealer_lead_claims(id) on delete set null,
  purchase_id uuid references public.dealer_purchases(id) on delete set null,
  fee_id uuid references public.dealer_purchase_fees(id) on delete set null,
  event_type text not null,
  channel text not null,
  destination text,
  subject text,
  message_body text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  provider text,
  provider_message_id text,
  provider_response jsonb not null default '{}'::jsonb,
  safe_error text,
  created_at timestamptz not null default now(),
  queued_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  constraint dealer_portal_notifications_dedupe_key_unique unique (dedupe_key),
  constraint dealer_portal_notifications_channel_check check (channel in ('email','whatsapp','event')),
  constraint dealer_portal_notifications_status_check check (status in ('queued','sent','failed','not_configured','skipped'))
);

create index if not exists dealer_portal_notifications_dealer_idx
  on public.dealer_portal_notifications(dealer_account_id, created_at desc);

create index if not exists dealer_portal_notifications_lead_idx
  on public.dealer_portal_notifications(website_lead_id, created_at desc);

create index if not exists dealer_portal_notifications_claim_idx
  on public.dealer_portal_notifications(claim_id, created_at desc)
  where claim_id is not null;

alter table public.dealer_portal_notifications enable row level security;

drop policy if exists "Staff manage dealer portal notifications" on public.dealer_portal_notifications;
create policy "Staff manage dealer portal notifications"
  on public.dealer_portal_notifications
  for all
  to authenticated
  using (public.crm_staff_can_access())
  with check (public.crm_staff_can_access());

drop policy if exists "Dealer users read own dealer portal notifications" on public.dealer_portal_notifications;
create policy "Dealer users read own dealer portal notifications"
  on public.dealer_portal_notifications
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.dealer_portal_users dpu
      where dpu.user_id = auth.uid()
        and dpu.active = true
        and dpu.dealer_account_id = dealer_portal_notifications.dealer_account_id
    )
  );

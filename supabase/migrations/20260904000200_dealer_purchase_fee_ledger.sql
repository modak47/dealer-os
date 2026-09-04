alter table public.dealer_purchase_fees
  add column if not exists invoice_reference text,
  add column if not exists invoiced_amount numeric(12,2) not null default 0,
  add column if not exists paid_amount numeric(12,2) not null default 0,
  add column if not exists outstanding_amount numeric(12,2) not null default 0,
  add column if not exists invoiced_by uuid references public.dealer_users(id) on delete set null,
  add column if not exists paid_by uuid references public.dealer_users(id) on delete set null,
  add column if not exists credited_at timestamptz,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.dealer_users(id) on delete set null;

update public.dealer_purchase_fees
set
  invoiced_amount = case when invoiced_at is not null then greatest(fee_amount + adjustment_amount - credit_amount, 0) else coalesce(invoiced_amount, 0) end,
  paid_amount = case when paid_at is not null and coalesce(paid_amount, 0) = 0 then greatest(fee_amount + adjustment_amount - credit_amount, 0) else coalesce(paid_amount, 0) end,
  outstanding_amount = greatest(fee_amount + adjustment_amount - credit_amount - coalesce(paid_amount, 0), 0),
  credited_at = case when status = 'credited' and credited_at is null then updated_at else credited_at end,
  voided_at = case when status = 'void' and voided_at is null then updated_at else voided_at end;

do $$
begin
  alter table public.dealer_purchase_fees
    add constraint dealer_purchase_fees_invoiced_amount_check check (invoiced_amount >= 0);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.dealer_purchase_fees
    add constraint dealer_purchase_fees_paid_amount_check check (paid_amount >= 0);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.dealer_purchase_fees
    add constraint dealer_purchase_fees_outstanding_amount_check check (outstanding_amount >= 0);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.dealer_purchase_fees
    add constraint dealer_purchase_fees_effective_charge_check check ((fee_amount + adjustment_amount - credit_amount) >= 0);
exception when duplicate_object then null;
end $$;

create unique index if not exists dealer_purchase_fees_purchase_unique_idx
  on public.dealer_purchase_fees(purchase_id);

create unique index if not exists dealer_purchases_claim_unique_idx
  on public.dealer_purchases(claim_id);

create table if not exists public.dealer_fee_ledger_entries (
  id bigint generated always as identity primary key,
  fee_id uuid not null references public.dealer_purchase_fees(id) on delete restrict,
  purchase_id uuid references public.dealer_purchases(id) on delete restrict,
  website_lead_id bigint references public.website_leads(id) on delete restrict,
  dealer_account_id uuid not null references public.dealer_portal_accounts(id) on delete restrict,
  entry_type text not null,
  amount numeric(12,2) not null default 0,
  previous_status text,
  new_status text,
  previous_amounts jsonb not null default '{}'::jsonb,
  new_amounts jsonb not null default '{}'::jsonb,
  note text,
  created_by uuid references public.dealer_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint dealer_fee_ledger_entry_type_check check (entry_type in ('fee_created','marked_invoiced','payment_recorded','credit_applied','adjustment_applied','voided')),
  constraint dealer_fee_ledger_entry_amount_check check (amount >= 0)
);

create index if not exists dealer_fee_ledger_entries_dealer_idx
  on public.dealer_fee_ledger_entries(dealer_account_id, created_at desc);

create index if not exists dealer_fee_ledger_entries_fee_idx
  on public.dealer_fee_ledger_entries(fee_id, created_at desc);

alter table public.dealer_fee_ledger_entries enable row level security;

drop policy if exists "Authenticated staff manage dealer fee ledger" on public.dealer_fee_ledger_entries;
create policy "Authenticated staff manage dealer fee ledger"
  on public.dealer_fee_ledger_entries
  for all
  to authenticated
  using (public.crm_staff_can_access())
  with check (public.crm_staff_can_access());

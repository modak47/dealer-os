alter table public.dealer_portal_accounts
  drop constraint if exists dealer_portal_accounts_status_check;

alter table public.dealer_portal_accounts
  add constraint dealer_portal_accounts_status_check
  check (account_status in ('pending','active','suspended','rejected','closed'));

create table if not exists public.dealer_settings (
  id boolean primary key default true check (id),
  business_name text not null default 'YesMoto',
  trading_name text not null default 'YesMoto',
  legal_name text not null default 'Sell Your Motorbike Ltd T/A Yes Moto',
  address_line_1 text, address_line_2 text, town text, county text, postcode text,
  country text not null default 'United Kingdom',
  phone text, email text, website text, whatsapp_number text, opening_hours text,
  company_number text, vat_number text,
  invoice_prefix text not null default 'YM',
  invoice_title text not null default 'Invoice',
  invoice_footer text not null default 'Thank you for choosing YesMoto.',
  payment_terms_days integer not null default 7 check(payment_terms_days between 0 and 365),
  payment_instructions text,
  vat_wording text not null default 'VAT treatment is shown where applicable.',
  bank_account_name text, bank_sort_code text, bank_account_number text,
  payment_reference_prefix text not null default 'YM',
  reservation_amount numeric(12,2) not null default 99 check(reservation_amount>=0),
  default_delivery_charge numeric(12,2) not null default 0 check(default_delivery_charge>=0),
  email_from_name text not null default 'YesMoto',
  email_from_address text, email_reply_to text,
  invoice_email_subject text not null default 'Your YesMoto invoice for {bike}',
  invoice_email_template text not null default E'Hi {customer_name},\n\nPlease find attached invoice {invoice_number} for your {bike}.\n\nBalance outstanding: {balance}\nPayment reference: {payment_reference}\n\nThank you,\nYesMoto\n{phone}\n{email}',
  website_contact_phone text, website_contact_email text, website_whatsapp text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  updated_by uuid references public.dealer_users(id) on delete set null
);

insert into public.dealer_settings (
  id,business_name,trading_name,legal_name,address_line_1,town,postcode,phone,email,website,
  whatsapp_number,opening_hours,website_contact_phone,website_contact_email,website_whatsapp
) values (
  true,'YesMoto','YesMoto','Sell Your Motorbike Ltd T/A Yes Moto','72 Brentwood Road','Brighton','BN1 7ES',
  '07984 763470','sellyourmotorbike@gmail.com','yesmoto.co.uk','07984 763470','Mon - Sat 9:00 - 18:00',
  '07984 763470','sellyourmotorbike@gmail.com','07984 763470'
) on conflict(id) do nothing;

alter table public.dealer_settings enable row level security;
drop policy if exists "Authenticated staff read dealer settings" on public.dealer_settings;
create policy "Authenticated staff read dealer settings" on public.dealer_settings for select to authenticated using(public.crm_staff_can_access());
drop policy if exists "Authenticated staff update dealer settings" on public.dealer_settings;
create policy "Authenticated staff update dealer settings" on public.dealer_settings for update to authenticated using(public.crm_staff_can_access()) with check(public.crm_staff_can_access());
drop trigger if exists set_dealer_settings_updated_at on public.dealer_settings;
create trigger set_dealer_settings_updated_at before update on public.dealer_settings for each row execute function public.crm_set_updated_at();

create or replace function public.crm_next_invoice_number() returns text language plpgsql security definer set search_path='' as $$
declare prefix text;
begin
  select coalesce(nullif(trim(invoice_prefix),''),'YM') into prefix from public.dealer_settings where id=true;
  return coalesce(prefix,'YM')||'-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.crm_invoice_number_seq')::text,5,'0');
end $$;

create or replace function public.crm_apply_invoice_settings() returns trigger language plpgsql security definer set search_path='' as $$
declare terms integer;
begin
  if new.due_at is null then
    select coalesce(payment_terms_days,7) into terms from public.dealer_settings where id=true;
    new.due_at := coalesce(new.issued_at,now()) + make_interval(days=>coalesce(terms,7));
  end if;
  return new;
end $$;
drop trigger if exists apply_dealer_settings_to_invoice on public.crm_invoices;
create trigger apply_dealer_settings_to_invoice before insert on public.crm_invoices for each row execute function public.crm_apply_invoice_settings();

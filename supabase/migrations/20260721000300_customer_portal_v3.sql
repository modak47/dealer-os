alter table public.crm_deliveries
  add column if not exists customer_confirmed_at timestamptz,
  add column if not exists customer_signature_name text,
  add column if not exists customer_signature_data_url text;

create index if not exists crm_documents_customer_created_idx
  on public.crm_documents(customer_id, created_at desc);

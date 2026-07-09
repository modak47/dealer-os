create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stock-documents',
  'stock-documents',
  false,
  52428800,
  array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.stock_attachments (
  id uuid primary key default gen_random_uuid(),
  stock_bike_id text not null,
  attachment_type text not null check (attachment_type in ('PDI Form','V5','MOT Certificate','Service History','Invoice','Other')),
  file_name text not null,
  file_path text not null unique,
  content_type text,
  file_size bigint,
  notes text,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_attachments_stock_bike_id_idx on public.stock_attachments(stock_bike_id);
create index if not exists stock_attachments_type_idx on public.stock_attachments(attachment_type);
create index if not exists stock_attachments_created_at_idx on public.stock_attachments(created_at desc);

create or replace function public.set_stock_attachments_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_stock_attachments_updated_at on public.stock_attachments;
create trigger set_stock_attachments_updated_at
before update on public.stock_attachments
for each row execute function public.set_stock_attachments_updated_at();

create table if not exists public.stock_pdi_checks (
  id uuid primary key default gen_random_uuid(),
  stock_bike_id text not null,
  checklist jsonb not null default '[]'::jsonb,
  technician_name text,
  technician_signature text,
  status text not null default 'draft' check (status in ('draft','completed')),
  completed_at timestamptz,
  completed_by uuid,
  generated_attachment_id uuid references public.stock_attachments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_pdi_checks_checklist_is_array check (jsonb_typeof(checklist) = 'array')
);

create index if not exists stock_pdi_checks_stock_bike_id_idx on public.stock_pdi_checks(stock_bike_id);
create index if not exists stock_pdi_checks_status_idx on public.stock_pdi_checks(status);

create or replace function public.set_stock_pdi_checks_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_stock_pdi_checks_updated_at on public.stock_pdi_checks;
create trigger set_stock_pdi_checks_updated_at
before update on public.stock_pdi_checks
for each row execute function public.set_stock_pdi_checks_updated_at();

alter table public.stock_attachments enable row level security;
alter table public.stock_pdi_checks enable row level security;

drop policy if exists "Authenticated staff can read stock attachments" on public.stock_attachments;
create policy "Authenticated staff can read stock attachments" on public.stock_attachments
for select to authenticated using (true);

drop policy if exists "Authenticated staff can insert stock attachments" on public.stock_attachments;
create policy "Authenticated staff can insert stock attachments" on public.stock_attachments
for insert to authenticated with check (true);

drop policy if exists "Authenticated staff can update stock attachments" on public.stock_attachments;
create policy "Authenticated staff can update stock attachments" on public.stock_attachments
for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated staff can delete stock attachments" on public.stock_attachments;
create policy "Authenticated staff can delete stock attachments" on public.stock_attachments
for delete to authenticated using (true);

drop policy if exists "Authenticated staff can read stock pdi checks" on public.stock_pdi_checks;
create policy "Authenticated staff can read stock pdi checks" on public.stock_pdi_checks
for select to authenticated using (true);

drop policy if exists "Authenticated staff can insert stock pdi checks" on public.stock_pdi_checks;
create policy "Authenticated staff can insert stock pdi checks" on public.stock_pdi_checks
for insert to authenticated with check (true);

drop policy if exists "Authenticated staff can update stock pdi checks" on public.stock_pdi_checks;
create policy "Authenticated staff can update stock pdi checks" on public.stock_pdi_checks
for update to authenticated using (true) with check (true);

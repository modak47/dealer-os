alter table public.crm_customers
  add column if not exists portal_access_code text;

update public.crm_customers
set portal_access_code = upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))
where portal_access_code is null or trim(portal_access_code) = '';

alter table public.crm_customers
  alter column portal_access_code set default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

create unique index if not exists crm_customers_portal_access_code_unique
  on public.crm_customers(portal_access_code)
  where portal_access_code is not null;

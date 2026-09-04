create or replace function public.crm_staff_can_access()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.dealer_users
    where id = auth.uid()
      and active = true
      and coalesce(role, '') not in ('dealer_admin', 'dealer_user')
  )
$$;

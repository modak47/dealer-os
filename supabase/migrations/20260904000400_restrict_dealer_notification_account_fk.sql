do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where nsp.nspname = 'public'
    and rel.relname = 'dealer_portal_notifications'
    and att.attname = 'dealer_account_id'
    and con.contype = 'f'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.dealer_portal_notifications drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.dealer_portal_notifications
  add constraint dealer_portal_notifications_dealer_account_id_fkey
  foreign key (dealer_account_id)
  references public.dealer_portal_accounts(id)
  on delete restrict;

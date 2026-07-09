create table if not exists public.stock_workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  stock_bike_id text not null,
  department text not null check (department in ('Workshop Preparation','Wash / Initial Valet','Final Valet','Photos')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','blocked')),
  assigned_to text,
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(stock_bike_id, department)
);

create index if not exists stock_workflow_tasks_stock_bike_id_idx on public.stock_workflow_tasks(stock_bike_id);
create index if not exists stock_workflow_tasks_department_status_idx on public.stock_workflow_tasks(department,status);
create index if not exists stock_workflow_tasks_updated_at_idx on public.stock_workflow_tasks(updated_at desc);

create or replace function public.set_stock_workflow_tasks_updated_at()
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

drop trigger if exists set_stock_workflow_tasks_updated_at on public.stock_workflow_tasks;
create trigger set_stock_workflow_tasks_updated_at
before update on public.stock_workflow_tasks
for each row execute function public.set_stock_workflow_tasks_updated_at();

create or replace function public.stock_workflow_create_defaults(p_stock_bike_id text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.stock_workflow_tasks(stock_bike_id,department,status)
  values
    (p_stock_bike_id,'Workshop Preparation','pending'),
    (p_stock_bike_id,'Wash / Initial Valet','pending'),
    (p_stock_bike_id,'Final Valet','pending'),
    (p_stock_bike_id,'Photos','pending')
  on conflict(stock_bike_id,department) do nothing;
end;
$$;

create or replace function public.stock_workflow_after_stock_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.stock_workflow_create_defaults(new.id::text);
  return new;
end;
$$;

drop trigger if exists create_stock_workflow_tasks on public.stock_bikes;
create trigger create_stock_workflow_tasks
after insert on public.stock_bikes
for each row execute function public.stock_workflow_after_stock_insert();

create or replace function public.stock_workflow_backfill()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  bike record;
  before_count integer;
  after_count integer;
begin
  select count(*) into before_count from public.stock_workflow_tasks;
  for bike in select id from public.stock_bikes loop
    perform public.stock_workflow_create_defaults(bike.id::text);
  end loop;
  select count(*) into after_count from public.stock_workflow_tasks;
  return after_count - before_count;
end;
$$;

alter table public.stock_workflow_tasks enable row level security;

drop policy if exists "Authenticated staff can read stock workflow tasks" on public.stock_workflow_tasks;
create policy "Authenticated staff can read stock workflow tasks"
on public.stock_workflow_tasks for select
to authenticated
using (true);

drop policy if exists "Authenticated staff can insert stock workflow tasks" on public.stock_workflow_tasks;
create policy "Authenticated staff can insert stock workflow tasks"
on public.stock_workflow_tasks for insert
to authenticated
with check (true);

drop policy if exists "Authenticated staff can update stock workflow tasks" on public.stock_workflow_tasks;
create policy "Authenticated staff can update stock workflow tasks"
on public.stock_workflow_tasks for update
to authenticated
using (true)
with check (true);

select public.stock_workflow_backfill();

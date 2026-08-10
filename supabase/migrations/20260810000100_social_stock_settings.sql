create table if not exists public.social_stock_settings (
  id uuid primary key default gen_random_uuid(),
  stock_bike_id bigint not null references public.stock_bikes(id) on delete cascade,
  include_in_rotation boolean not null default true,
  priority boolean not null default false,
  preferred_platform text,
  preferred_template_id uuid references public.social_post_templates(id) on delete set null,
  preferred_post_time time,
  max_posts_per_bike integer not null default 6,
  last_queued_at timestamptz,
  notes text,
  created_by uuid references public.dealer_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_stock_settings_stock_unique unique(stock_bike_id),
  constraint social_stock_settings_max_posts_positive check(max_posts_per_bike > 0)
);

create index if not exists social_stock_settings_rotation_idx
  on public.social_stock_settings(include_in_rotation, priority, updated_at desc);

alter table public.social_stock_settings enable row level security;

drop policy if exists "Authenticated staff full access social stock settings" on public.social_stock_settings;
create policy "Authenticated staff full access social stock settings"
  on public.social_stock_settings
  for all
  to authenticated
  using (public.crm_staff_can_access())
  with check (public.crm_staff_can_access());

drop trigger if exists set_social_stock_settings_updated_at on public.social_stock_settings;
create trigger set_social_stock_settings_updated_at
  before update on public.social_stock_settings
  for each row
  execute function public.crm_set_updated_at();

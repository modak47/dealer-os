create table if not exists public.social_channels (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  display_name text not null,
  status text not null default 'not_connected',
  posting_enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  last_connected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_channels_platform_name_unique unique(platform, display_name),
  constraint social_channels_status_check check(status in ('not_connected','connected','paused','error'))
);

create table if not exists public.social_post_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_type text not null default 'manual',
  platform text,
  caption_template text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_campaign_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_type text not null,
  platform text,
  cadence_days integer not null default 7,
  max_posts_per_bike integer not null default 4,
  require_manual_approval boolean not null default true,
  active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_campaign_rules_cadence_positive check(cadence_days > 0),
  constraint social_campaign_rules_max_posts_positive check(max_posts_per_bike > 0)
);

create table if not exists public.social_post_queue (
  id uuid primary key default gen_random_uuid(),
  stock_bike_id bigint references public.stock_bikes(id) on delete set null,
  channel_id uuid references public.social_channels(id) on delete set null,
  template_id uuid references public.social_post_templates(id) on delete set null,
  platform text not null,
  status text not null default 'draft',
  caption text not null,
  image_url text,
  target_url text,
  scheduled_for timestamptz,
  posted_at timestamptz,
  external_post_id text,
  external_url text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.dealer_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_post_queue_status_check check(status in ('draft','approved','scheduled','posting','posted','failed','cancelled','skipped'))
);

create index if not exists social_post_queue_stock_idx on public.social_post_queue(stock_bike_id, created_at desc);
create index if not exists social_post_queue_status_idx on public.social_post_queue(status, scheduled_for);

alter table public.social_channels enable row level security;
alter table public.social_post_templates enable row level security;
alter table public.social_campaign_rules enable row level security;
alter table public.social_post_queue enable row level security;

drop policy if exists "Authenticated staff full access social channels" on public.social_channels;
create policy "Authenticated staff full access social channels" on public.social_channels for all to authenticated using (public.crm_staff_can_access()) with check (public.crm_staff_can_access());
drop policy if exists "Authenticated staff full access social templates" on public.social_post_templates;
create policy "Authenticated staff full access social templates" on public.social_post_templates for all to authenticated using (public.crm_staff_can_access()) with check (public.crm_staff_can_access());
drop policy if exists "Authenticated staff full access social rules" on public.social_campaign_rules;
create policy "Authenticated staff full access social rules" on public.social_campaign_rules for all to authenticated using (public.crm_staff_can_access()) with check (public.crm_staff_can_access());
drop policy if exists "Authenticated staff full access social queue" on public.social_post_queue;
create policy "Authenticated staff full access social queue" on public.social_post_queue for all to authenticated using (public.crm_staff_can_access()) with check (public.crm_staff_can_access());

drop trigger if exists set_social_channels_updated_at on public.social_channels;
create trigger set_social_channels_updated_at before update on public.social_channels for each row execute function public.crm_set_updated_at();
drop trigger if exists set_social_post_templates_updated_at on public.social_post_templates;
create trigger set_social_post_templates_updated_at before update on public.social_post_templates for each row execute function public.crm_set_updated_at();
drop trigger if exists set_social_campaign_rules_updated_at on public.social_campaign_rules;
create trigger set_social_campaign_rules_updated_at before update on public.social_campaign_rules for each row execute function public.crm_set_updated_at();
drop trigger if exists set_social_post_queue_updated_at on public.social_post_queue;
create trigger set_social_post_queue_updated_at before update on public.social_post_queue for each row execute function public.crm_set_updated_at();

insert into public.social_channels(platform,display_name,status,posting_enabled)
values
  ('facebook','Facebook Page','not_connected',false),
  ('instagram','Instagram Business','not_connected',false),
  ('pinterest','Pinterest','not_connected',false),
  ('google_business','Google Business Profile','not_connected',false)
on conflict (platform, display_name) do nothing;

insert into public.social_post_templates(name,trigger_type,platform,caption_template,display_order)
values
  ('New arrival','new_stock',null,'New in at YesMoto: {{year}} {{make}} {{model}} {{variant}}. {{price}}. View it here: {{url}}',10),
  ('Weekly feature','weekly_repost',null,'Still available: {{year}} {{make}} {{model}} with {{mileage}}. Finance and nationwide delivery available. {{url}}',20),
  ('Low mileage spotlight','manual',null,'Low mileage feature from YesMoto: {{year}} {{make}} {{model}} - {{mileage}}. Reserve online for GBP 99. {{url}}',30)
on conflict do nothing;

insert into public.social_campaign_rules(name,trigger_type,platform,cadence_days,max_posts_per_bike,require_manual_approval,active)
values
  ('New stock approval queue','new_stock',null,1,1,true,true),
  ('Weekly unsold stock rotation','weekly_repost',null,7,6,true,false)
on conflict do nothing;

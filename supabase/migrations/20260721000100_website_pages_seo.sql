create table if not exists public.website_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  path text not null unique,
  title text not null,
  nav_label text not null default '',
  seo_title text not null default '',
  meta_description text not null default '',
  og_image_url text not null default '',
  canonical_path text not null default '',
  hero_kicker text not null default '',
  hero_title text not null default '',
  hero_subtitle text not null default '',
  body_sections jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check(status in ('draft','published')),
  page_kind text not null default 'managed' check(page_kind in ('builtin','managed')),
  show_in_header boolean not null default false,
  show_in_footer boolean not null default false,
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.website_pages(slug,path,title,nav_label,seo_title,meta_description,canonical_path,hero_kicker,hero_title,hero_subtitle,status,page_kind,show_in_header,show_in_footer,display_order) values
  ('home','/','Home','Home','YesMoto | Premium Used Motorcycles','Quality used motorcycles from YesMoto in Brighton. Browse stock, reserve online, part exchange and arrange nationwide delivery.','/','YESMOTO','Buy, sell or finance your next motorbike.','Quality used bikes. Competitive finance. Part exchange welcome.','published','builtin',false,true,0),
  ('used-bikes','/used-bikes','Used Motorcycles','Used Bikes','Used Motorcycles for Sale | YesMoto Brighton','Browse quality used motorcycles for sale at YesMoto. HPI checked, professionally prepared and available with nationwide delivery.','/used-bikes','USED MOTORCYCLES','Used motorcycles','Every bike is hand-picked, HPI checked and professionally prepared by our workshop.','published','builtin',true,true,10),
  ('stock','/stock','Stock','Stock','Motorcycle Stock | YesMoto','Browse current YesMoto motorcycle stock, including used bikes available to reserve online.','/stock','MOTORCYCLE STOCK','Current motorcycle stock','Browse our latest motorcycles available from YesMoto.','published','builtin',true,true,20),
  ('finance','/finance','Finance','Finance','Motorcycle Finance | YesMoto','Motorcycle finance options from YesMoto. Enquire about flexible finance for your next used motorcycle.','/finance','MOTORCYCLE FINANCE','Finance your next motorcycle','Flexible finance options available, subject to status.','published','builtin',true,true,30),
  ('part-exchange','/part-exchange','Part Exchange','Part Exchange','Motorcycle Part Exchange | YesMoto','Part exchange your motorcycle with YesMoto and use it towards your next bike.','/part-exchange','PART EXCHANGE','Part exchange your motorcycle','Tell us about your bike and we will help value it.','published','builtin',true,true,40),
  ('sell-my-bike','/sell-my-bike','Sell My Bike','Sell My Bike','Sell My Motorcycle | YesMoto','Sell your motorcycle to YesMoto. Quick valuation, straightforward process and collection options.','/sell-my-bike','SELL MY BIKE','Sell your motorcycle','A simple route to selling your motorcycle.','published','builtin',true,true,50),
  ('about','/about','About YesMoto','About Us','About YesMoto | Used Motorcycle Dealer Brighton','Meet YesMoto, Brighton''s independent used motorcycle specialist with more than 22 years of motorcycle experience.','/about','ABOUT YESMOTO','Motorcycles are our experience.','Carefully selected used motorcycles, professionally prepared in Brighton and supplied throughout the UK.','published','builtin',true,true,60),
  ('used-motorcycle-warranty','/used-motorcycle-warranty','Used Motorcycle Warranty','Warranty','Used Motorcycle Warranty | YesMoto','Qualifying YesMoto motorcycles include a 3-month Warranty First warranty and nationwide support.','/used-motorcycle-warranty','WARRANTY FIRST COVER','Ride away with confidence.','Nationwide support included with every qualifying retail motorcycle.','published','builtin',false,true,70),
  ('nationwide-delivery','/nationwide-delivery','Nationwide Motorcycle Delivery','Delivery','Nationwide Motorcycle Delivery | YesMoto','Safe, insured motorcycle delivery from YesMoto in Brighton throughout mainland UK.','/nationwide-delivery','FROM BRIGHTON ACROSS THE UK','Nationwide motorcycle delivery.','Safe, professional transport directly to your door.','published','builtin',false,true,80),
  ('motorcycle-preparation','/motorcycle-preparation','Motorcycle Preparation','Preparation','Motorcycle Preparation | YesMoto','Discover how every used motorcycle at YesMoto is inspected, prepared and presented before sale.','/motorcycle-preparation','THE YESMOTO WORKSHOP','Prepared with care.','Individually assessed. Professionally prepared. Ready to enjoy.','published','builtin',false,true,90),
  ('why-buy-from-yesmoto','/why-buy-from-yesmoto','Why Buy From YesMoto','Why YesMoto','Why Buy From YesMoto | Used Motorcycles Brighton','Carefully selected motorcycles, honest presentation, nationwide delivery and over 22 years of motorcycle experience.','/why-buy-from-yesmoto','THE YESMOTO DIFFERENCE','Buying used should be simple.','Transparent information, proper preparation and personal service.','published','builtin',false,true,100),
  ('reserve-online','/reserve-online','Reserve Online','Reserve Online','Reserve Your Motorcycle Online | YesMoto','Reserve a YesMoto motorcycle online for 99 pounds and secure it for up to seven days.','/reserve-online','RESERVE ONLINE 24/7','Found the right motorcycle?','Secure it online for just 99 pounds.','published','builtin',false,true,110),
  ('contact','/contact','Contact','Contact','Contact YesMoto | Brighton Used Motorcycles','Contact YesMoto about used motorcycles, part exchange, finance, delivery and reservations.','/contact','CONTACT YESMOTO','Talk to the team.','Ask about a motorcycle, selling your bike or arranging delivery.','published','builtin',true,true,120)
on conflict(slug) do nothing;

alter table public.website_pages enable row level security;
drop policy if exists "Public read published website pages" on public.website_pages;
create policy "Public read published website pages" on public.website_pages for select to anon, authenticated using(status='published');
drop policy if exists "Authenticated staff manage website pages" on public.website_pages;
create policy "Authenticated staff manage website pages" on public.website_pages for all to authenticated using(public.crm_staff_can_access()) with check(public.crm_staff_can_access());

drop trigger if exists set_website_pages_updated_at on public.website_pages;
create trigger set_website_pages_updated_at before update on public.website_pages for each row execute function public.crm_set_updated_at();

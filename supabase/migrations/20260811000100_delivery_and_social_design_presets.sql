alter table public.social_post_templates
  add column if not exists visual_design jsonb not null default '{}'::jsonb;

create unique index if not exists social_post_templates_name_unique_idx
  on public.social_post_templates(name);

update public.reservation_addons
set
  name = 'Click & Collect',
  description = E'Collect from our collection centre\nView by appointment\nPersonalised handover\nSame great preparation & checks\nNo delivery charge',
  price = 0,
  icon = 'store',
  badge = 'FREE',
  display_order = 10,
  active = true
where category = 'delivery'
  and name in ('Collection','Click & Collect');

update public.reservation_addons
set
  name = 'Free Delivery Within 20 Miles',
  description = E'Local delivery by our team\nDelivered by our team\nWithin 20 miles of our showroom\nFully insured delivery\nHand over & walkaround included\nNo delivery charge',
  price = 0,
  icon = 'truck',
  badge = 'FREE',
  display_order = 20,
  active = true
where category = 'delivery'
  and name in ('Local Delivery','Free Delivery Within 20 Miles');

update public.reservation_addons
set
  name = 'Mainland UK Delivery',
  description = E'Anywhere in mainland UK\nAnywhere in mainland UK (up to Carlisle)\nFully insured delivery service\n5-7 working days (tracked)\nSMS updates with your delivery\nHand over & walkaround included',
  price = 189,
  icon = 'map',
  badge = 'MAINLAND UK',
  display_order = 30,
  active = true
where category = 'delivery'
  and name in ('Nationwide Delivery','Mainland UK Delivery');

insert into public.reservation_addons(category,name,description,price,duration_months,display_order,active,icon,badge)
values
  ('delivery','Scotland & Ireland Delivery',E'Please contact us for a personalised delivery quote.\nScotland, Northern Ireland, Ireland and island addresses\nFully insured transport options\nQuote confirmed before payment',0,null,40,true,'quote','REQUEST A QUOTE')
on conflict (category, name) do update set
  description=excluded.description,
  price=excluded.price,
  duration_months=excluded.duration_months,
  display_order=excluded.display_order,
  active=excluded.active,
  icon=excluded.icon,
  badge=excluded.badge;

insert into public.social_post_templates(name,trigger_type,platform,caption_template,visual_design,display_order,active)
values
  ('Finance options','manual',null,'Flexible finance options available on this {{year}} {{make}} {{model}}. To suit every budget. {{url}}',
    '{"preset":"finance","layout":"single","headline":"Flexible Finance Options","subline":"To Suit Every Budget!","footer":"07984 763470 | www.yesmoto.co.uk","showPrice":false,"showBrand":true}'::jsonb,110,true),
  ('Delivery available','manual',null,'From our showroom to your driveway. Delivery available on this {{year}} {{make}} {{model}}. {{url}}',
    '{"preset":"delivery","layout":"single","headline":"From Our Showroom to Your Driveway","subline":"Delivery Available!","footer":"YES MOTO","showPrice":false,"showBrand":true}'::jsonb,120,true),
  ('Part exchange upgrade','manual',null,'Thinking of upgrading? Part exchange your old bike today against this {{year}} {{make}} {{model}}. {{url}}',
    '{"preset":"part_exchange","layout":"single","headline":"Thinking of Upgrading?","subline":"Part Exchange Your Old Bike Today!","footer":"www.yesmoto.co.uk","showPrice":false,"showBrand":true}'::jsonb,130,true),
  ('We buy motorbikes','manual',null,'We buy motorbikes. What do you have? Contact YesMoto today. {{url}}',
    '{"preset":"we_buy","layout":"single","headline":"We Buy Motorbikes","subline":"What Do You Have?","footer":"www.yesmoto.co.uk","showPrice":false,"showBrand":true}'::jsonb,140,true),
  ('Awaiting preparation','new_stock',null,'This {{year}} {{make}} {{model}} is awaiting preparation. Inspection, valet, images and video coming soon. {{url}}',
    '{"preset":"awaiting_prep","layout":"multi","headline":"Awaiting Preparation","subline":"Inspection | Valet | Images | Video","strapline":"VISIT YESMOTO.CO.UK TO FIND OUT MORE","showPrice":true,"pricePosition":"bottom","showBrand":true,"showThumbs":true}'::jsonb,150,true),
  ('Awaiting preparation price top','new_stock',null,'This {{year}} {{make}} {{model}} is awaiting preparation and priced at {{price}}. {{url}}',
    '{"preset":"awaiting_prep","layout":"multi","headline":"Awaiting Preparation","subline":"Inspection | Valet | Images | Video","strapline":"VISIT YESMOTO.CO.UK TO FIND OUT MORE","showPrice":true,"pricePosition":"top","showBrand":true,"showThumbs":true}'::jsonb,160,true),
  ('Awaiting preparation price middle','new_stock',null,'New arrival: {{year}} {{make}} {{model}}. Awaiting preparation. {{url}}',
    '{"preset":"awaiting_prep","layout":"multi","headline":"Awaiting Preparation","subline":"Inspection | Valet | Images | Video","strapline":"VISIT YESMOTO.CO.UK TO FIND OUT MORE","showPrice":true,"pricePosition":"middle","showBrand":true,"showThumbs":true}'::jsonb,170,true),
  ('Awaiting preparation clean','new_stock',null,'{{year}} {{make}} {{model}} now in stock and awaiting preparation. {{url}}',
    '{"preset":"awaiting_prep","layout":"multi","headline":"Awaiting Preparation","subline":"Inspection | Valet | Images | Video","strapline":"VISIT YESMOTO.CO.UK TO FIND OUT MORE","showPrice":false,"showBrand":true,"showThumbs":true}'::jsonb,180,true),
  ('Stock hero with reviews','manual',null,'{{year}} {{make}} {{model}} now available from YesMoto for {{price}}. Delivery, part exchange and finance available. {{url}}',
    '{"preset":"stock_hero","layout":"multi","headline":"Delivery - Part Exchange - Finance","subline":"Google Verified Reviews","footer":"YES MOTO","showPrice":true,"pricePosition":"top-right","showBrand":true,"showThumbs":true}'::jsonb,190,true)
on conflict (name) do update set
  trigger_type=excluded.trigger_type,
  platform=excluded.platform,
  caption_template=excluded.caption_template,
  visual_design=excluded.visual_design,
  display_order=excluded.display_order,
  active=excluded.active;

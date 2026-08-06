update public.reservation_addons
set active = false
where category = 'warranty'
  and name in ('Standard Cover','YesMoto Protect Essential','YesMoto Protect Plus','YesMoto Protect Ultimate');

insert into public.reservation_addons(category,name,description,price,duration_months,display_order,active,icon,badge)
values
  ('warranty','Elite Warranty','3 Month Warranty' || E'\nFREE UK Roadside Assistance' || E'\n£1,000 Claim Limit' || E'\n£75 per Hour Labour Rate' || E'\nValid at Any VAT Registered Garage' || E'\nUK Wide Cover (England, Scotland, Wales & Northern Ireland)',0,3,10,true,'shield','Included'),
  ('warranty','Elite+ 12 Months','12 Month Warranty' || E'\nFREE UK Roadside Assistance' || E'\n£1,000 Claim Limit' || E'\n£75 per Hour Labour Rate' || E'\nValid at Any VAT Registered Garage' || E'\nUK Wide Cover (England, Scotland, Wales & Northern Ireland)',229,12,20,true,'star','Most Popular - Save £70'),
  ('warranty','Elite+ 24 Months','24 Month Warranty' || E'\nFREE UK Roadside Assistance' || E'\n£1,000 Claim Limit' || E'\n£75 per Hour Labour Rate' || E'\nValid at Any VAT Registered Garage' || E'\nUK Wide Cover (England, Scotland, Wales & Northern Ireland)',399,24,30,true,'crown','Best Value - Save £100')
on conflict (category, name) do update set
  description=excluded.description,
  price=excluded.price,
  duration_months=excluded.duration_months,
  display_order=excluded.display_order,
  active=excluded.active,
  icon=excluded.icon,
  badge=excluded.badge;

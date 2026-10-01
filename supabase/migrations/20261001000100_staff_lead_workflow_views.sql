-- Human-facing workflow views for the existing paginated staff lead browser.
-- Adds no lifecycle columns and performs no data changes.
begin;

create or replace function public.staff_website_leads_list(p_filters jsonb default '{}',p_at timestamptz default null,p_id bigint default null,p_limit int default 51)
returns setof jsonb language sql stable set search_path=public as $$
 with selected as materialized (
 select l.id,l.public_id,l.received_at,l.received_date_basis,l.lead_source,l.website,l.reg,l.make,l.model,l.year,l.mileage,l.price,l.location_town,l.status,l.opportunity_mode,l.marketplace_status,l.portal_reviewed_at,l.portal_ready_at,l.archived_at,l.valuation_status,l.retail_estimate,l.suggested_offer,l.estimated_margin,l.vehicle_check_status,l.images,l."Images",l.image1,l.image2,l.image3,l.image4,l.image5,l.image6,l.image7,l.image8,l.image9,l.image10 from public.website_leads l
 where ((p_filters->>'include_archived')::boolean is true or l.archived_at is null)
 and (nullif(p_filters->>'source','') is null or public.staff_lead_source(coalesce(l.lead_source,l.website))=public.staff_lead_source(p_filters->>'source'))
 and (nullif(p_filters->>'mode','') is null or l.opportunity_mode=p_filters->>'mode')
 and (nullif(p_filters->>'status','') is null or l.status=p_filters->>'status' or l.marketplace_status=p_filters->>'status')
 and (coalesce(p_filters->>'review','') <> 'not_reviewed' or l.portal_reviewed_at is null)
 and (coalesce(p_filters->>'review','') <> 'reviewed' or l.portal_reviewed_at is not null)
 and (nullif(p_filters->>'from','') is null or l.received_at >= (p_filters->>'from')::timestamptz)
 and (nullif(p_filters->>'to','') is null or l.received_at < (p_filters->>'to')::timestamptz)
 and (nullif(p_filters->>'q','') is null
   or position(lower(p_filters->>'q') in lower(concat_ws(' ',l.id::text,l.public_id::text,l.reg,l.make,l.model,l.fname,l.lname,l.email,l.phone,l.postcode)))>0
   or (length(regexp_replace(lower(p_filters->>'q'),'[^a-z0-9]','','g'))>0 and (
     position(regexp_replace(lower(p_filters->>'q'),'[^a-z0-9]','','g') in regexp_replace(lower(coalesce(l.reg,'')),'[^a-z0-9]','','g'))>0
     or position(regexp_replace(lower(p_filters->>'q'),'[^a-z0-9]','','g') in regexp_replace(lower(coalesce(l.phone,'')),'[^a-z0-9]','','g'))>0
     or position(regexp_replace(lower(p_filters->>'q'),'[^a-z0-9]','','g') in regexp_replace(lower(coalesce(l.postcode,'')),'[^a-z0-9]','','g'))>0)))
 and case coalesce(p_filters->>'view','all')
 -- Website Leads is a partition of current intake: New, Ready, Sent, Closed, or Archive.
 -- A reviewed lead stays in New until it is made Ready, so it cannot disappear between actions.
 when 'needs_review' then l.archived_at is null and l.portal_ready_at is null
   and l.status not in ('closed','declined','purchased','dealer_purchased','internal_buying')
   and coalesce(l.marketplace_status not in ('closed','cancelled','purchased'),true)
   and l.status not in ('dealer_pool_available','dealer_allocated','dealer_claimed','referred_to_dealer','accepted','purchase_agreed')
   and coalesce(l.marketplace_status not in ('live_to_dealers','offer_received','offer_accepted','purchase_pending'),true)
   and not exists(select 1 from public.dealer_lead_claims c where c.website_lead_id=l.id and c.status not in ('lost','returned_to_pool','purchased','purchased_later'))
 when 'ready' then l.archived_at is null and l.portal_ready_at is not null
   and l.status not in ('closed','declined','purchased','dealer_purchased','internal_buying')
   and coalesce(l.marketplace_status not in ('closed','cancelled','purchased'),true)
   and l.status not in ('dealer_pool_available','dealer_allocated','dealer_claimed','referred_to_dealer','accepted','purchase_agreed')
   and coalesce(l.marketplace_status not in ('live_to_dealers','offer_received','offer_accepted','purchase_pending'),true)
   and not exists(select 1 from public.dealer_lead_claims c where c.website_lead_id=l.id and c.status not in ('lost','returned_to_pool','purchased','purchased_later'))
 when 'released' then l.archived_at is null
   and l.status not in ('closed','declined','purchased','dealer_purchased','internal_buying')
   and coalesce(l.marketplace_status not in ('closed','cancelled','purchased'),true)
   and (l.status in ('dealer_pool_available','dealer_allocated','dealer_claimed','referred_to_dealer','accepted','purchase_agreed')
     or l.marketplace_status in ('live_to_dealers','offer_received','offer_accepted','purchase_pending')
     or exists(select 1 from public.dealer_lead_claims c where c.website_lead_id=l.id and c.status not in ('lost','returned_to_pool','purchased','purchased_later')))
 when 'active' then l.archived_at is null and (l.status in ('dealer_pool_available','dealer_allocated','dealer_claimed','referred_to_dealer','accepted','purchase_agreed')
   or l.marketplace_status in ('live_to_dealers','offer_received','offer_accepted','purchase_pending')
   or exists(select 1 from public.dealer_lead_claims c where c.website_lead_id=l.id and c.status not in ('lost','returned_to_pool','purchased','purchased_later')))
 when 'live' then l.archived_at is null
   and not (l.status in ('purchased','dealer_purchased') or coalesce(l.marketplace_status='purchased',false) or exists(select 1 from public.dealer_purchases p where p.website_lead_id=l.id))
   and l.status not in ('accepted','purchase_agreed')
   and coalesce(l.marketplace_status not in ('offer_received','offer_accepted','purchase_pending'),true)
   and (l.status in ('dealer_pool_available','dealer_allocated','dealer_claimed','referred_to_dealer') or l.marketplace_status='live_to_dealers'
     or exists(select 1 from public.dealer_lead_claims c where c.website_lead_id=l.id and c.status not in ('lost','returned_to_pool','purchased','purchased_later')))
 when 'offers' then l.archived_at is null and l.opportunity_mode='marketplace_offer' and l.marketplace_status='offer_received'
 when 'deals_agreed' then l.archived_at is null
   and not (l.status in ('purchased','dealer_purchased') or coalesce(l.marketplace_status='purchased',false) or exists(select 1 from public.dealer_purchases p where p.website_lead_id=l.id))
   and (l.marketplace_status in ('offer_accepted','purchase_pending') or l.status in ('accepted','purchase_agreed'))
 when 'completed' then l.status in ('purchased','dealer_purchased') or l.marketplace_status='purchased' or exists(select 1 from public.dealer_purchases p where p.website_lead_id=l.id)
 when 'closed' then l.archived_at is null and (l.status in ('closed','declined','purchased','dealer_purchased','internal_buying') or l.marketplace_status in ('closed','cancelled','purchased'))
 when 'archived' then l.archived_at is not null
 when 'backlog' then l.received_at < (p_filters->>'backlog_before')::timestamptz and not public.staff_lead_is_distributed(l) and not public.staff_lead_is_blocked(l)
 else true end
 and (p_at is null or (l.received_at,l.id)<(p_at,p_id))
 order by l.received_at desc,l.id desc limit least(greatest(p_limit,1),51)
 )
 select jsonb_build_object(
 'id',l.id,'public_id',l.public_id,'received_at',l.received_at,'received_date_basis',l.received_date_basis,
 'lead_source',public.staff_lead_source(coalesce(l.lead_source,l.website)),'reg',l.reg,'make',l.make,'model',l.model,'year',l.year,'mileage',l.mileage,'price',l.price,'location_town',l.location_town,
 'status',l.status,'opportunity_mode',l.opportunity_mode,'marketplace_status',l.marketplace_status,
 'portal_reviewed_at',l.portal_reviewed_at,'portal_ready_at',l.portal_ready_at,'archived_at',l.archived_at,
 'valuation_status',l.valuation_status,'retail_estimate',l.retail_estimate,'suggested_offer',l.suggested_offer,'estimated_margin',l.estimated_margin,'vehicle_check_status',l.vehicle_check_status,
 'photo_count',coalesce(p.n,0)+coalesce(cardinality(legacy.urls),0),'thumbnail_url',legacy.urls[1],'thumbnail_bucket',p.bucket,'thumbnail_path',p.path)
 from selected l
 left join lateral (select count(*) n,(array_agg(storage_bucket order by sort_order nulls last,id))[1] bucket,(array_agg(storage_path order by sort_order nulls last,id))[1] path
   from public.lead_photos where website_lead_id=l.id and status<>'removed') p on true
 left join lateral (select array_agg(url order by ord) urls from (
   select url,min(ord) ord from unnest(array(select jsonb_array_elements_text(l.images)) || array[l.image1,l.image2,l.image3,l.image4,l.image5,l.image6,l.image7,l.image8,l.image9,l.image10] ||
   array(select m[1] from regexp_matches(coalesce(l."Images",''),$rx$https?://[^\s"'<>),]+$rx$,'g') m)) with ordinality u(url,ord)
   where nullif(trim(url),'') is not null group by url) d) legacy on true
 order by l.received_at desc,l.id desc
$$;

create or replace function public.staff_website_leads_counts(p_today timestamptz,p_week timestamptz,p_month timestamptz)
returns jsonb language sql stable set search_path=public as $$
 select jsonb_build_object('total',count(*),'new',count(*) filter(where status='new' and archived_at is null),
 'pendingValuations',count(*) filter(where valuation_status in ('pending','processing','in_progress') and archived_at is null),
 'receivedToday',count(*) filter(where received_at>=p_today),'receivedThisWeek',count(*) filter(where received_at>=p_week),
 'purchasedThisMonth',count(*) filter(where status='purchased' and purchased_at>=p_month),
 'ready',count(*) filter(where archived_at is null and portal_ready_at is not null
   and status not in ('closed','declined','purchased','dealer_purchased','internal_buying') and coalesce(marketplace_status not in ('closed','cancelled','purchased'),true)
   and status not in ('dealer_pool_available','dealer_allocated','dealer_claimed','referred_to_dealer','accepted','purchase_agreed') and coalesce(marketplace_status not in ('live_to_dealers','offer_received','offer_accepted','purchase_pending'),true)
   and not exists(select 1 from public.dealer_lead_claims c where c.website_lead_id=l.id and c.status not in ('lost','returned_to_pool','purchased','purchased_later'))),
 'released',count(*) filter(where archived_at is null
   and status not in ('closed','declined','purchased','dealer_purchased','internal_buying') and coalesce(marketplace_status not in ('closed','cancelled','purchased'),true)
   and (status in ('dealer_pool_available','dealer_allocated','dealer_claimed','referred_to_dealer','accepted','purchase_agreed') or marketplace_status in ('live_to_dealers','offer_received','offer_accepted','purchase_pending')
     or exists(select 1 from public.dealer_lead_claims c where c.website_lead_id=l.id and c.status not in ('lost','returned_to_pool','purchased','purchased_later')))),
 'needsReview',count(*) filter(where archived_at is null and portal_ready_at is null
   and status not in ('closed','declined','purchased','dealer_purchased','internal_buying') and coalesce(marketplace_status not in ('closed','cancelled','purchased'),true)
   and status not in ('dealer_pool_available','dealer_allocated','dealer_claimed','referred_to_dealer','accepted','purchase_agreed') and coalesce(marketplace_status not in ('live_to_dealers','offer_received','offer_accepted','purchase_pending'),true)
   and not exists(select 1 from public.dealer_lead_claims c where c.website_lead_id=l.id and c.status not in ('lost','returned_to_pool','purchased','purchased_later'))),
 'live',count(*) filter(where archived_at is null
   and not (status in ('purchased','dealer_purchased') or coalesce(marketplace_status='purchased',false) or exists(select 1 from public.dealer_purchases p where p.website_lead_id=l.id))
   and status not in ('accepted','purchase_agreed')
   and coalesce(marketplace_status not in ('offer_received','offer_accepted','purchase_pending'),true)
   and (status in ('dealer_pool_available','dealer_allocated','dealer_claimed','referred_to_dealer') or marketplace_status='live_to_dealers'
     or exists(select 1 from public.dealer_lead_claims c where c.website_lead_id=l.id and c.status not in ('lost','returned_to_pool','purchased','purchased_later')))),
 'offers',count(*) filter(where archived_at is null and opportunity_mode='marketplace_offer' and marketplace_status='offer_received'),
 'dealsAgreed',count(*) filter(where archived_at is null
   and not (status in ('purchased','dealer_purchased') or coalesce(marketplace_status='purchased',false) or exists(select 1 from public.dealer_purchases p where p.website_lead_id=l.id))
   and (marketplace_status in ('offer_accepted','purchase_pending') or status in ('accepted','purchase_agreed'))),
 'completed',count(*) filter(where status in ('purchased','dealer_purchased') or marketplace_status='purchased' or exists(select 1 from public.dealer_purchases p where p.website_lead_id=l.id)),
 'closed',count(*) filter(where archived_at is null and (status in ('closed','declined','purchased','dealer_purchased','internal_buying') or marketplace_status in ('closed','cancelled','purchased'))),
 'archived',count(*) filter(where archived_at is not null),
 'sourceOptions',(select jsonb_agg(src) from (select distinct public.staff_lead_source(coalesce(lead_source,website)) src from public.website_leads) sources),
 'sourceCounts',jsonb_build_object('bikebuyeruk',count(*) filter(where public.staff_lead_source(coalesce(lead_source,website))='bike_buyer_uk'),
 'sellyourmotorbike',count(*) filter(where public.staff_lead_source(coalesce(lead_source,website))='sell_your_motorbike'),
 'motorcyclebuyer',count(*) filter(where public.staff_lead_source(coalesce(lead_source,website))='motorcyclebuyer'),
 'motorgeeks',count(*) filter(where public.staff_lead_source(coalesce(lead_source,website))='motorgeeks'))) from public.website_leads l
$$;

revoke all on function public.staff_website_leads_list(jsonb,timestamptz,bigint,int), public.staff_website_leads_counts(timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.staff_website_leads_list(jsonb,timestamptz,bigint,int), public.staff_website_leads_counts(timestamptz,timestamptz,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;

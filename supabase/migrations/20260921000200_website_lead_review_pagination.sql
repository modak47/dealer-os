-- REVIEW REQUIRED. Generated only: do not deploy the new list/queue before this migration.
-- No original date/status is overwritten. No lead is automatically reviewed, readied or released.
begin;
-- The live CRM schema declares team_member, and both existing internal users have
-- that role. Unknown/future roles must be explicitly reviewed before gaining access.
-- API staff-policy.ts mirrors this allowlist; both SQL entry points share this check.
create or replace function public.staff_actor_can_access(p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.dealer_users where id=p_actor and active=true and role in ('team_member'))
$$;
revoke all on function public.staff_actor_can_access(uuid) from public,anon,authenticated;
grant execute on function public.staff_actor_can_access(uuid) to service_role;
create or replace function public.crm_staff_can_access()
returns boolean language sql stable security definer set search_path='' as $$
 select public.staff_actor_can_access(auth.uid())
$$;

alter table public.website_leads
  add column if not exists received_at timestamptz,
  add column if not exists received_date_basis text,
  add column if not exists portal_reviewed_at timestamptz,
  add column if not exists portal_ready_at timestamptz,
  add column if not exists archived_at timestamptz;

create or replace function public.staff_lead_source(s text) returns text
language sql immutable set search_path=public as $$
 select case lower(coalesce(s,'')) when 'bikebuyeruk' then 'bike_buyer_uk' when 'sellyourmotorbike' then 'sell_your_motorbike' else lower(coalesce(s,'')) end
$$;

-- Conservative parser. Numeric dates with two plausible, unequal month/day values
-- are ambiguous, even for UK imports. Missing/invalid/ambiguous values use fallback.
create or replace function public.staff_lead_source_date(d text) returns jsonb
language plpgsql stable set search_path=public as $$
declare m text[]; dt timestamp; ts timestamptz; basis text;
begin
 if nullif(trim(d),'') is null then return jsonb_build_object('basis','missing_source'); end if;
 if trim(d) ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
   ts := trim(d)::timestamptz; basis := 'iso_offset';
 else
   m := regexp_match(trim(d),'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$');
   if m is null then return jsonb_build_object('basis','unrecognised_source'); end if;
   if m[1]::int <= 12 and m[2]::int <= 12 and m[1]::int <> m[2]::int then return jsonb_build_object('basis','ambiguous_source'); end if;
   dt := make_date(m[3]::int,m[2]::int,m[1]::int) + make_time(coalesce(m[4],'0')::int,coalesce(m[5],'0')::int,coalesce(m[6],'0')::int);
   ts := dt at time zone 'Europe/London';
   if ts at time zone 'Europe/London' <> dt or ((ts-interval '1 hour') at time zone 'Europe/London') = dt then
     return jsonb_build_object('basis','ambiguous_clock');
   end if;
   basis := 'unambiguous_dmy_london';
 end if;
 return jsonb_build_object('at',ts,'basis',basis);
exception when others then return jsonb_build_object('basis','invalid_source');
end $$;

create or replace function public.staff_set_lead_received_date() returns trigger
language plpgsql set search_path=public as $$
declare parsed jsonb;
begin
 parsed := public.staff_lead_source_date(new.date);
 new.received_at := coalesce((parsed->>'at')::timestamptz,new.submitted_at,new.created_at,now());
 new.received_date_basis := case when parsed->>'at' is not null then parsed->>'basis'
   else (parsed->>'basis') || case when new.submitted_at is not null then ':submitted_at' else ':created_at' end end;
 return new;
end $$;
-- ALTER TABLE above holds ACCESS EXCLUSIVE until COMMIT, so concurrent business
-- writes cannot run while the timestamp trigger is suspended. Fail closed if the
-- live trigger topology changes after preflight. Do not disable ALL/USER triggers.
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.website_leads'::regclass
   and tgname='set_website_leads_updated_at' and tgenabled='O'
   and tgfoid='public.crm_set_updated_at()'::regprocedure) then
   raise exception 'Unexpected website_leads timestamp trigger; review backfill before applying';
 end if;
 if exists(select 1 from pg_trigger where tgrelid='public.website_leads'::regclass
   and not tgisinternal and tgenabled<>'D' and tgname<>'set_website_leads_updated_at')
   or exists(select 1 from pg_rewrite where ev_class='public.website_leads'::regclass and rulename<>'_RETURN') then
   raise exception 'Additional website_leads hooks found; review backfill before applying';
 end if;
end $$;
create temporary table website_leads_backfill_versions on commit drop as
 select id,updated_at from public.website_leads;
alter table public.website_leads disable trigger set_website_leads_updated_at;
-- Backfill only new canonical columns; keep original submitted_at/date/updated_at.
update public.website_leads l set
 received_at=coalesce((public.staff_lead_source_date(l.date)->>'at')::timestamptz,l.submitted_at,l.created_at),
 received_date_basis=case when public.staff_lead_source_date(l.date)->>'at' is not null then public.staff_lead_source_date(l.date)->>'basis'
 else (public.staff_lead_source_date(l.date)->>'basis') || case when l.submitted_at is not null then ':submitted_at' else ':created_at' end end
where received_at is null;
alter table public.website_leads enable trigger set_website_leads_updated_at;
do $$ begin
 if exists(select 1 from public.website_leads l join website_leads_backfill_versions v using(id)
   where l.updated_at is distinct from v.updated_at) then
   raise exception 'Historical updated_at changed during canonical date backfill';
 end if;
end $$;
alter table public.website_leads alter column received_at set not null;
drop trigger if exists website_lead_received_date on public.website_leads;
create trigger website_lead_received_date before insert or update of date,submitted_at on public.website_leads
for each row execute function public.staff_set_lead_received_date();
-- Required for deterministic keyset traversal. Existing source/status/mode indexes are reused.
create index if not exists website_leads_received_cursor_idx on public.website_leads(received_at desc,id desc);

create or replace function public.staff_lead_is_blocked(l public.website_leads) returns boolean
language sql stable set search_path=public as $$
 select l.status in ('purchased','internal_buying','purchase_agreed','dealer_claimed','dealer_purchased','closed','declined','accepted')
 or coalesce(l.marketplace_status in ('offer_accepted','purchase_pending','purchased','closed','cancelled'),false)
 or l.marketplace_accepted_offer_id is not null
 or exists(select 1 from public.dealer_lead_claims c where c.website_lead_id=l.id and c.status not in ('lost','returned_to_pool'))
$$;
create or replace function public.staff_lead_is_distributed(l public.website_leads) returns boolean
language sql stable set search_path=public as $$
 select l.status in ('dealer_pool_available','dealer_allocated')
 or coalesce(l.marketplace_status in ('live_to_dealers','offer_received'),false)
 or exists(select 1 from public.dealer_lead_allocations a where a.website_lead_id=l.id and a.allocation_status='available')
$$;

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
 when 'needs_review' then l.archived_at is null and l.portal_reviewed_at is null and not public.staff_lead_is_blocked(l) and not public.staff_lead_is_distributed(l)
 when 'ready' then l.archived_at is null and l.portal_ready_at is not null and not public.staff_lead_is_blocked(l) and not public.staff_lead_is_distributed(l)
 when 'released' then l.marketplace_released_at is not null or exists(select 1 from public.dealer_lead_allocations a where a.website_lead_id=l.id and a.allocation_status<>'excluded')
 when 'active' then l.status='dealer_claimed' or l.marketplace_status in ('live_to_dealers','offer_received','offer_accepted','purchase_pending') or exists(select 1 from public.dealer_lead_claims c where c.website_lead_id=l.id and c.status not in ('lost','returned_to_pool','purchased','purchased_later'))
 when 'closed' then l.status in ('closed','declined','purchased','dealer_purchased') or l.marketplace_status in ('closed','cancelled','purchased')
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
 'ready',count(*) filter(where portal_ready_at is not null and archived_at is null and not public.staff_lead_is_blocked(l) and not public.staff_lead_is_distributed(l)),
 'released',count(*) filter(where l.marketplace_released_at is not null or exists(select 1 from public.dealer_lead_allocations a where a.website_lead_id=l.id and a.allocation_status<>'excluded')),
 'needsReview',count(*) filter(where portal_reviewed_at is null and archived_at is null and not public.staff_lead_is_blocked(l) and not public.staff_lead_is_distributed(l)),
 'sourceOptions',(select jsonb_agg(src) from (select distinct public.staff_lead_source(coalesce(lead_source,website)) src from public.website_leads) sources),
 'sourceCounts',jsonb_build_object('bikebuyeruk',count(*) filter(where public.staff_lead_source(coalesce(lead_source,website))='bike_buyer_uk'),
 'sellyourmotorbike',count(*) filter(where public.staff_lead_source(coalesce(lead_source,website))='sell_your_motorbike'),
 'motorcyclebuyer',count(*) filter(where public.staff_lead_source(coalesce(lead_source,website))='motorcyclebuyer'),
 'motorgeeks',count(*) filter(where public.staff_lead_source(coalesce(lead_source,website))='motorgeeks'))) from public.website_leads l
$$;

-- Row lock shared with existing claim/offer acceptance functions closes selection/release races.
create or replace function public.staff_website_lead_action(p_id bigint,p_action text,p_actor uuid)
returns jsonb language plpgsql set search_path=public as $$
declare l public.website_leads; n timestamptz:=now();
begin
 if not public.staff_actor_can_access(p_actor) then raise exception 'Staff access required'; end if;
 select * into l from public.website_leads where id=p_id for update;
 if not found then raise exception 'Lead not found'; end if;
 if p_action not in ('review','ready','archive') then raise exception 'Invalid action'; end if;
 if l.archived_at is not null then raise exception 'Lead is archived'; end if;
 if p_action='ready' and (public.staff_lead_is_blocked(l) or public.staff_lead_is_distributed(l)) then raise exception 'Active, distributed or terminal opportunity cannot be readied'; end if;
 if p_action='archive' and (public.staff_lead_is_distributed(l) or l.status in ('internal_buying','purchase_agreed','dealer_claimed') or l.marketplace_accepted_offer_id is not null or coalesce(l.marketplace_status in ('offer_accepted','purchase_pending'),false) or exists(select 1 from public.dealer_lead_claims where website_lead_id=p_id and status not in ('lost','returned_to_pool'))) then raise exception 'Active or accepted opportunity cannot be archived'; end if;
 if p_action='ready' and l.opportunity_mode not in ('direct_claim','marketplace_offer') then raise exception 'Unknown opportunity mode'; end if;
 if p_action='ready' and l.opportunity_mode='marketplace_offer' and coalesce(l.marketplace_status,'') not in ('submitted','under_review') then raise exception 'Marketplace submission is not reviewable'; end if;
 update public.website_leads set portal_reviewed_at=case when p_action in ('review','ready') then coalesce(portal_reviewed_at,n) else portal_reviewed_at end,
 portal_ready_at=case when p_action='ready' then n when p_action='archive' then null else portal_ready_at end,
 archived_at=case when p_action='archive' then n else archived_at end where id=p_id;
 insert into public.dealer_portal_audit_events(website_lead_id,dealer_user_id,event_type,event_data)
 values(p_id,p_actor,'staff_lead_'||p_action,jsonb_build_object('previous_reviewed_at',l.portal_reviewed_at,'previous_ready_at',l.portal_ready_at,'opportunity_mode',l.opportunity_mode));
 return jsonb_build_object('id',p_id,'ok',true,'action',p_action);
end $$;

-- The server computes matching; commit checks the locked lead, staff, dealer status,
-- previous-dealer restrictions and the exact version matching was calculated against.
create or replace function public.staff_release_website_lead(p_id bigint,p_actor uuid,p_expected_updated_at timestamptz,p_method text,p_allocations jsonb)
returns jsonb language plpgsql set search_path=public as $$
declare l public.website_leads; a jsonb; inserted jsonb; new_status text; n timestamptz:=now();
begin
 if not public.staff_actor_can_access(p_actor) then raise exception 'Staff access required'; end if;
 select * into l from public.website_leads where id=p_id for update;
 if not found then raise exception 'Lead not found'; end if;
 if l.updated_at is distinct from p_expected_updated_at then raise exception 'Lead changed; refresh and review before release'; end if;
 if l.archived_at is not null or l.portal_ready_at is null or public.staff_lead_is_blocked(l) or public.staff_lead_is_distributed(l) then raise exception 'Lead must be Ready, unarchived and inactive before release'; end if;
 if l.opportunity_mode not in ('direct_claim','marketplace_offer') then raise exception 'Unknown opportunity mode'; end if;
 if l.opportunity_mode='marketplace_offer' and coalesce(l.marketplace_status,'') not in ('submitted','under_review') then raise exception 'Marketplace opportunity is not ready for release'; end if;
 if p_method not in ('matching_pool','direct','dealer_group') or jsonb_array_length(p_allocations)=0 then raise exception 'Invalid allocation'; end if;
 if not exists(select 1 from jsonb_array_elements(p_allocations) x where x->>'allocation_status'='available') then raise exception 'No eligible dealer allocations'; end if;
 for a in select * from jsonb_array_elements(p_allocations) loop
   perform id from public.dealer_portal_accounts where id=(a->>'dealer_account_id')::uuid and account_status='active' for share;
   if not found then raise exception 'Dealer is no longer active'; end if;
   if a->>'allocation_status'='available' and exists(select 1 from public.dealer_lead_claims where website_lead_id=p_id and dealer_account_id=(a->>'dealer_account_id')::uuid and status in ('lost','returned_to_pool')) and coalesce((a->'match_reasons'->>'previous_dealer_reclaim_override')::boolean,false)=false then raise exception 'Previous dealer override required'; end if;
 end loop;
 -- Allocation rows are release history: the live schema has only the id PK,
 -- no (lead,dealer) unique constraint. Claims/notifications reference each row's
 -- identity. Preserve old rows and create a new release occurrence, not an upsert.
 with added as (
 insert into public.dealer_lead_allocations(website_lead_id,dealer_account_id,allocation_method,allocation_status,match_reasons,excluded_reasons,created_by,updated_by)
 select p_id,(x->>'dealer_account_id')::uuid,p_method,x->>'allocation_status',x->'match_reasons',x->'excluded_reasons',p_actor,p_actor from jsonb_array_elements(p_allocations) x returning *)
 select jsonb_agg(to_jsonb(added)) into inserted from added;
 new_status:=case when l.opportunity_mode='marketplace_offer' then l.status when p_method='direct' then 'dealer_allocated' else 'dealer_pool_available' end;
 update public.website_leads set status=new_status,portal_ready_at=null,
 marketplace_status=case when opportunity_mode='marketplace_offer' then 'live_to_dealers' else marketplace_status end,
 marketplace_released_at=case when opportunity_mode='marketplace_offer' then n else marketplace_released_at end where id=p_id;
 insert into public.dealer_portal_audit_events(website_lead_id,dealer_user_id,event_type,event_data)
 values(p_id,p_actor,'lead_released_to_dealers',jsonb_build_object('allocation_method',p_method,'opportunity_mode',l.opportunity_mode,'allocations',inserted));
 insert into public.dealer_portal_audit_events(website_lead_id,dealer_account_id,dealer_user_id,event_type,event_data)
 select p_id,(x->>'dealer_account_id')::uuid,p_actor,
 case when x->>'allocation_status'='excluded' then 'dealer_allocation_excluded' else 'dealer_allocation_created' end,
 jsonb_build_object('allocation_id',x->>'id','match_reasons_ref','dealer_lead_allocations.match_reasons') from jsonb_array_elements(inserted) x;
 if exists(select 1 from public.dealer_lead_claims where website_lead_id=p_id and status in ('lost','returned_to_pool')) then
 insert into public.dealer_portal_audit_events(website_lead_id,dealer_user_id,event_type,event_data) values(p_id,p_actor,'lead_rereleased_to_dealers',jsonb_build_object('allocation_method',p_method)); end if;
 if exists(select 1 from jsonb_array_elements(p_allocations) x where (x->'match_reasons'->>'previous_dealer_reclaim_override')::boolean is true) then
 insert into public.dealer_portal_audit_events(website_lead_id,dealer_user_id,event_type,event_data) values(p_id,p_actor,'previous_dealer_reclaim_override_recorded',jsonb_build_object('allocation_method',p_method,'allocation_ids',(select jsonb_agg(x->>'id') from jsonb_array_elements(inserted) x where (x->'match_reasons'->>'previous_dealer_reclaim_override')::boolean is true))); end if;
 return jsonb_build_object('allocations',inserted,'status',new_status);
end $$;

-- Never expose customer-search or lifecycle RPCs through anon/authenticated PostgREST.
revoke all on function public.staff_website_leads_list(jsonb,timestamptz,bigint,int), public.staff_website_leads_counts(timestamptz,timestamptz,timestamptz), public.staff_website_lead_action(bigint,text,uuid), public.staff_release_website_lead(bigint,uuid,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.staff_website_leads_list(jsonb,timestamptz,bigint,int), public.staff_website_leads_counts(timestamptz,timestamptz,timestamptz), public.staff_website_lead_action(bigint,text,uuid), public.staff_release_website_lead(bigint,uuid,timestamptz,text,jsonb) to service_role;
revoke all on function public.staff_lead_is_blocked(public.website_leads), public.staff_lead_is_distributed(public.website_leads) from public,anon,authenticated;
grant execute on function public.staff_lead_is_blocked(public.website_leads), public.staff_lead_is_distributed(public.website_leads) to service_role;
notify pgrst,'reload schema';
commit;

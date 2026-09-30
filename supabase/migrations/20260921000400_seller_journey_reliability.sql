-- Targeted seller reliability extension. Production: review first; NOT auto-applied.
begin;
alter table public.seller_valuation_drafts add column revision bigint not null default 0,
 add column provider_evidence jsonb not null default '{}'::jsonb;
alter table public.website_leads add column seller_draft_id uuid references public.seller_valuation_drafts(id);
create unique index website_leads_one_seller_draft on public.website_leads(seller_draft_id) where seller_draft_id is not null;
-- Existing links are retained; no historical opportunity is merged or rewritten.
create unique index seller_drafts_one_lead on public.seller_valuation_drafts(website_lead_id) where website_lead_id is not null;
alter table public.lead_photos add column upload_key text, add column upload_lease_until timestamptz;
create unique index seller_photos_one_upload on public.lead_photos(draft_id,upload_key) where upload_key is not null;

create table public.seller_email_deliveries (
 id uuid primary key, website_lead_id bigint not null references public.website_leads(id),
 token_id uuid not null references public.seller_access_tokens(id),
 status text not null default 'pending' check(status in ('pending','sending','accepted','failed','not_configured','unknown','expired')),
 attempts integer not null default 0, lease_until timestamptz, attempt_id uuid,
 provider_message_id text, safe_error text, created_at timestamptz not null default now(),
 accepted_at timestamptz, delivered_at timestamptz
);
create index seller_email_delivery_lead on public.seller_email_deliveries(website_lead_id,created_at desc);
create index seller_email_delivery_retry on public.seller_email_deliveries(created_at) where attempts<5 and status in ('pending','sending','unknown','failed','not_configured');
create table public.seller_rate_windows (key text primary key, started_at timestamptz not null, hits integer not null);
create index seller_rate_window_expiry on public.seller_rate_windows(started_at);
alter table public.seller_email_deliveries enable row level security;
alter table public.seller_rate_windows enable row level security;
revoke all on public.seller_email_deliveries,public.seller_rate_windows from public,anon,authenticated;
grant all on public.seller_email_deliveries,public.seller_rate_windows to service_role;

create function public.mg_rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.seller_rate_windows values(p_key,now(),1)
 on conflict(key) do update set hits=case when seller_rate_windows.started_at < now()-make_interval(secs=>p_seconds) then 1 else seller_rate_windows.hits+1 end,
 started_at=case when seller_rate_windows.started_at < now()-make_interval(secs=>p_seconds) then now() else seller_rate_windows.started_at end returning hits into n;
 delete from public.seller_rate_windows where started_at<now()-interval '2 days';
 return n<=p_limit;
end $$;

create function public.mg_clean_object(p_value jsonb,p_keys text[]) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(case when jsonb_typeof(p_value)='object' then p_value else '{}'::jsonb end)
 where key=any(p_keys) and jsonb_typeof(value) in ('string','number','boolean','null')
$$;

create function public.mg_draft_operation(p_hash text,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.seller_valuation_drafts; v jsonb; c jsonb; s jsonb; n timestamptz:=now(); lead_id bigint;
 delivery uuid; access_id uuid; evidence jsonb; key text;
begin
 if p_action='create' then
  insert into public.seller_valuation_drafts(draft_token_hash) values(p_hash) on conflict(draft_token_hash) do nothing;
 end if;
 select * into d from public.seller_valuation_drafts where draft_token_hash=p_hash and expires_at>n for update;
 if d.id is null then raise exception 'Draft access expired' using errcode='42501'; end if;
 if p_action in ('read','create') then return (to_jsonb(d)-'draft_token_hash'-'provider_evidence'); end if;
 if p_action='submit' and d.website_lead_id is not null then
  -- An authorized retry must reuse the original opportunity, regardless of revision.
  lead_id:=d.website_lead_id;
 else
  if d.submitted_at is not null then raise exception 'Profile already submitted' using errcode='PT409'; end if;
  if (p_data->>'version')::bigint is distinct from d.revision then raise exception 'Saved answers changed in another tab. Reload before continuing.' using errcode='PT409'; end if;
  if p_action='provider' then
   update public.seller_valuation_drafts set provider_evidence=p_data->'evidence',revision=revision+1 where id=d.id returning * into d;
   return to_jsonb(d)-'draft_token_hash'-'provider_evidence';
  end if;
  if p_action not in ('save','submit') then raise exception 'Unknown action'; end if;
  v:=public.mg_clean_object(p_data->'vehicle',array['registration','make','model','year','derivative','engineCapacity','colour']);
  c:=public.mg_clean_object(p_data->'condition',array['mileage','previousOwners','spareKeys','registeredKeeper','overallCondition','serviceHistory','running','writtenOff','writeOffCategory','outstandingFinance','mechanicalFaults','faultDescription','cosmeticDamage','damageDescription','lastServiceDate','mileageAtLastService','motExpiry','motAdvisories','fittedExtras','photosSkipped']);
  s:=public.mg_clean_object(p_data->'seller',array['firstName','lastName','email','mobile','postcode','consent']);
  if octet_length((v||c||s)::text)>20000 then raise exception 'Answers too large' using errcode='22023'; end if;
  if p_action='submit' then
   if coalesce(v->>'make','')='' or coalesce(v->>'model','')='' or coalesce(v->>'year','')!~'^\d{4}$' or coalesce(c->>'mileage','')!~'^\d+$'
    or coalesce(c->>'registeredKeeper','') not in ('yes','no') or coalesce(c->>'overallCondition','') not in ('Excellent','Good','Average','Poor','Non-runner')
    or coalesce(c->>'serviceHistory','') not in ('Full history','Part history','No history','Unknown')
    or coalesce(s->>'firstName','')='' or coalesce(s->>'lastName','')='' or coalesce(s->>'email','')!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or coalesce(s->>'mobile','')!~'^\+?[0-9 ()-]{10,20}$' or coalesce(s->>'postcode','')!~*'^[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}$'
    or s->'consent' is distinct from 'true'::jsonb then raise exception 'Complete the required answers and consent' using errcode='22023'; end if;
   if (v->>'year')::int<1900 or (v->>'year')::int>extract(year from now())+1 then raise exception 'Invalid year' using errcode='22023'; end if;
   foreach key in array array['running','writtenOff','outstandingFinance','mechanicalFaults','cosmeticDamage'] loop
    if coalesce(c->>key,'') not in ('yes','no') and not(key in ('writtenOff','outstandingFinance') and c->>key='unsure') then raise exception 'Complete condition questions' using errcode='22023'; end if;
   end loop;
   if (c->>'writtenOff'='yes' and coalesce(c->>'writeOffCategory','')='') or (c->>'mechanicalFaults'='yes' and coalesce(c->>'faultDescription','')='') or (c->>'cosmeticDamage'='yes' and coalesce(c->>'damageDescription','')='') then raise exception 'Add condition details' using errcode='22023'; end if;
  end if;
  update public.seller_valuation_drafts set registration=v->>'registration',vehicle_snapshot=v,condition_snapshot=c,seller_snapshot=s,
   current_step=least(4,greatest(1,coalesce((p_data->>'currentStep')::int,1))),revision=revision+1,last_autosaved_at=n where id=d.id returning * into d;
  if p_action='save' then return to_jsonb(d)-'draft_token_hash'-'provider_evidence'; end if;
  -- Only evidence written by the separate server provider action is authoritative.
  evidence:=case when d.provider_evidence->>'registration'=v->>'registration' then d.provider_evidence else '{}'::jsonb end;
  insert into public.website_leads(seller_draft_id,lead_source,website,form_name,opportunity_mode,marketplace_status,marketplace_submitted_at,status,
   reg,make,model,year,engine,colour,mileage,owners,spare_keys,owner,bike_condition,history,damage,customer_message,finance_information,extras,mot,
   fname,lname,email,phone,postcode,normalised_postcode,seller_vehicle_snapshot,seller_condition,seller_profile,seller_progress,
   autotrader_vehicle_lookup_data,autotrader_vehicle_check_data,vehicle_check_status,consent_terms,consent_source,submitted_at,date)
  values(d.id,'motorgeeks','motorgeeks','MotorGeeks seller valuation','marketplace_offer','submitted',n,'reviewing',
   v->>'registration',v->>'make',v->>'model',v->>'year',v->>'engineCapacity',v->>'colour',c->>'mileage',c->>'previousOwners',c->>'spareKeys',c->>'registeredKeeper',c->>'overallCondition',c->>'serviceHistory',c->>'damageDescription',c->>'faultDescription',c->>'outstandingFinance',c->>'fittedExtras',c->>'motExpiry',
   s->>'firstName',s->>'lastName',lower(s->>'email'),s->>'mobile',upper(s->>'postcode'),upper(s->>'postcode'),v,c,s,jsonb_build_object('submittedStep',4),
   coalesce(evidence->'lookupRaw','{}'),coalesce(evidence->'checkRaw','{}'),'not_checked',true,'motorgeeks_valuation_form',n,n::text) returning id into lead_id;
  update public.seller_valuation_drafts set website_lead_id=lead_id,submitted_at=n,current_step=4 where id=d.id;
  update public.lead_photos set website_lead_id=lead_id where draft_id=d.id and status='uploaded';
  insert into public.dealer_portal_audit_events(website_lead_id,event_type,event_data) values(lead_id,'motorgeeks_seller_profile_submitted',jsonb_build_object('source','motorgeeks','opportunity_mode','marketplace_offer','draft_id',d.id));
 end if;
 select id into delivery from public.seller_email_deliveries where website_lead_id=lead_id order by created_at desc limit 1;
 if delivery is null then
  delivery:=(p_data->>'deliveryId')::uuid;
  insert into public.seller_access_tokens(website_lead_id,token_hash,purpose,expires_at) values(lead_id,p_data->>'linkHash','seller_magic_link',n+interval '1 hour') returning id into access_id;
  insert into public.seller_email_deliveries(id,website_lead_id,token_id) values(delivery,lead_id,access_id);
 end if;
 insert into public.seller_access_tokens(website_lead_id,token_hash,purpose,expires_at) values(lead_id,p_data->>'sessionHash','seller_session',n+interval '7 days');
 return jsonb_build_object('leadId',lead_id,'deliveryId',delivery,'reference','MG-'||lpad(lead_id::text,6,'0'));
end $$;

create function public.mg_consume_link(p_hash text,p_session_hash text) returns bigint
language plpgsql security definer set search_path='' as $$
declare t public.seller_access_tokens;
begin
 select * into t from public.seller_access_tokens where token_hash=p_hash and purpose='seller_magic_link' and used_at is null and revoked_at is null and expires_at>now() for update;
 if t.id is null then raise exception 'Link unavailable' using errcode='42501'; end if;
 insert into public.seller_access_tokens(website_lead_id,token_hash,purpose,expires_at) values(t.website_lead_id,p_session_hash,'seller_session',now()+interval '7 days');
 update public.seller_access_tokens set used_at=now() where id=t.id;
 return t.website_lead_id;
end $$;

create function public.mg_issue_link(p_lead bigint,p_email text,p_delivery uuid,p_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare access_id uuid;
begin
 perform 1 from public.website_leads where id=p_lead and lower(email)=lower(p_email) and opportunity_mode='marketplace_offer' and lead_source='motorgeeks' for update;
 if not found then return null; end if;
 update public.seller_access_tokens set revoked_at=now() where website_lead_id=p_lead and purpose='seller_magic_link' and revoked_at is null;
 insert into public.seller_access_tokens(website_lead_id,token_hash,purpose,expires_at) values(p_lead,p_hash,'seller_magic_link',now()+interval '1 hour') returning id into access_id;
 insert into public.seller_email_deliveries(id,website_lead_id,token_id) values(p_delivery,p_lead,access_id);
 return p_delivery;
end $$;

create function public.mg_logout(p_hash text) returns void
language plpgsql security definer set search_path='' as $$
declare lead_id bigint;
begin
 update public.seller_access_tokens set revoked_at=now() where token_hash=p_hash and purpose='seller_session' returning website_lead_id into lead_id;
 update public.seller_valuation_drafts set expires_at=now() where website_lead_id=lead_id;
end $$;

create function public.mg_delivery(p_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.seller_email_deliveries; t public.seller_access_tokens; mail text;
begin
 select * into d from public.seller_email_deliveries where id=p_id for update;
 if d.id is null then raise exception 'Delivery unavailable'; end if;
 if p_action='claim' then
  select * into t from public.seller_access_tokens where id=d.token_id;
  if t.revoked_at is not null or t.used_at is not null or t.expires_at<=now() then return jsonb_build_object('status','expired'); end if;
  if d.status='accepted' or d.lease_until>now() then return jsonb_build_object('status',d.status); end if;
  select email into mail from public.website_leads where id=d.website_lead_id;
  update public.seller_email_deliveries set status='sending',attempts=attempts+1,lease_until=now()+interval '1 minute',attempt_id=(p_data->>'attemptId')::uuid where id=p_id;
  return jsonb_build_object('status','send','email',mail);
 end if;
 if p_action='finish' and d.attempt_id=(p_data->>'attemptId')::uuid then
  update public.seller_email_deliveries set status=p_data->>'status',provider_message_id=p_data->>'providerId',safe_error=p_data->>'error',lease_until=null,
   accepted_at=case when p_data->>'status'='accepted' then now() else accepted_at end where id=p_id;
 end if;
 return jsonb_build_object('status',coalesce(p_data->>'status',d.status));
end $$;

create function public.mg_photo_operation(p_hash text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.seller_valuation_drafts; l public.website_leads; ph public.lead_photos; lead_id bigint; edit_ok boolean; count_now int;
begin
 select website_lead_id into lead_id from public.seller_access_tokens where token_hash=p_hash and purpose='seller_session' and revoked_at is null and expires_at>now();
 select * into d from public.seller_valuation_drafts where (lead_id is not null and website_lead_id=lead_id) or (lead_id is null and draft_token_hash=p_hash and expires_at>now()) for update;
 if d.id is null then raise exception 'Photo access expired' using errcode='42501'; end if;
 if d.website_lead_id is not null then select * into l from public.website_leads where id=d.website_lead_id for update; end if;
 edit_ok:= coalesce(d.website_lead_id is null or (l.opportunity_mode='marketplace_offer' and l.lead_source='motorgeeks' and l.archived_at is null and l.marketplace_accepted_offer_id is null and l.marketplace_status in ('submitted','under_review') and coalesce(l.status,'') not in ('closed','purchased','dealer_purchased')),false);
 if p_action='list' then
  return jsonb_build_object('editable',edit_ok,'photos',coalesce((select jsonb_agg(to_jsonb(p)-'upload_key'-'upload_lease_until') from public.lead_photos p where draft_id=d.id and status='uploaded'),'[]'));
 end if;
 if not edit_ok then raise exception 'Photos are locked once the opportunity is live, accepted or closed. Contact MotorGeeks.' using errcode='PT409'; end if;
 if p_action='reserve' then
  select * into ph from public.lead_photos where draft_id=d.id and upload_key=p_data->>'key' for update;
  if ph.status='uploaded' then return to_jsonb(ph); end if;
  if ph.status='uploading' and ph.upload_lease_until>now() then raise exception 'This photo is still uploading. Retry shortly.' using errcode='PT409'; end if;
  update public.lead_photos set status='failed' where draft_id=d.id and status='uploading' and upload_lease_until<=now();
  select count(*) into count_now from public.lead_photos where draft_id=d.id and status in ('uploaded','uploading');
  if count_now>=20 then raise exception 'Maximum 20 photos' using errcode='22023'; end if;
  if (p_data->>'bytes')::int not between 1 and 4194304 or p_data->>'type' not in ('image/jpeg','image/png','image/webp') then raise exception 'Invalid photo format or size' using errcode='22023'; end if;
  if ph.id is null then
   insert into public.lead_photos(draft_id,website_lead_id,storage_bucket,storage_path,content_type,byte_size,original_filename,status,upload_key,upload_lease_until,sort_order)
   values(d.id,d.website_lead_id,'motorgeeks-seller-photos',d.id::text||'/'||(p_data->>'id')||'.jpg',p_data->>'type',(p_data->>'bytes')::int,left(p_data->>'filename',200),'uploading',p_data->>'key',now()+interval '2 minutes',count_now) returning * into ph;
  else update public.lead_photos set status='uploading',upload_lease_until=now()+interval '2 minutes' where id=ph.id returning * into ph; end if;
  return to_jsonb(ph);
 end if;
 select * into ph from public.lead_photos where id=(p_data->>'id')::uuid and draft_id=d.id for update;
 if ph.id is null then raise exception 'Photo not found' using errcode='42501'; end if;
 if p_action='finish' and ph.status='uploading' and ph.upload_lease_until>now() and ph.upload_lease_until=(p_data->>'lease')::timestamptz then
  update public.lead_photos set status='uploaded',website_lead_id=d.website_lead_id,upload_lease_until=null where id=ph.id returning * into ph;
 elsif p_action='remove' then update public.lead_photos set status='removed',upload_lease_until=null where id=ph.id returning * into ph;
 elsif p_action='fail' and ph.upload_lease_until=(p_data->>'lease')::timestamptz then update public.lead_photos set status='failed',upload_lease_until=null where id=ph.id and status='uploading' returning * into ph;
 else raise exception 'Upload expired; retry' using errcode='PT409'; end if;
 update public.seller_valuation_drafts set photo_count=(select count(*) from public.lead_photos where draft_id=d.id and status='uploaded') where id=d.id;
 insert into public.dealer_portal_audit_events(website_lead_id,event_type,event_data) values(d.website_lead_id,'seller_photo_'||p_action,jsonb_build_object('photo_id',ph.id,'draft_id',d.id));
 return to_jsonb(ph);
end $$;

-- No new function is browser-callable, even if the database default grants EXECUTE.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('mg_rate_limit','mg_clean_object','mg_draft_operation','mg_consume_link','mg_issue_link','mg_logout','mg_delivery','mg_photo_operation') loop
  execute format('revoke all on function %s from public, anon, authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
-- Existing objects remain private; existing files are not deleted or rewritten.
update storage.buckets set public=false,file_size_limit=4194304,allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='motorgeeks-seller-photos';
commit;

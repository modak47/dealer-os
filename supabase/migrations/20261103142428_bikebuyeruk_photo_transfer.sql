-- Server-only transfer bookkeeping in the EXISTING DealerOS database/bucket.
create table public.bikebuyeruk_photo_transfers (
  website_lead_id bigint primary key references public.website_leads(id) on delete cascade,
  external_submission_id text not null,
  manifest jsonb not null check (jsonb_typeof(manifest)='array' and jsonb_array_length(manifest) between 1 and 10),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  removed_at timestamptz
);
alter table public.bikebuyeruk_photo_transfers enable row level security;
revoke all on public.bikebuyeruk_photo_transfers from public, anon, authenticated;
grant select, insert, update on public.bikebuyeruk_photo_transfers to service_role;
create index bikebuyeruk_photo_retention on public.bikebuyeruk_photo_transfers(completed_at) where removed_at is null;

create or replace function public.bbuk_photo_transfer(p_lead_id bigint, p_external_id text, p_action text, p_photos jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare batch public.bikebuyeruk_photo_transfers; item jsonb; position int; total_bytes bigint;
begin
  if p_action not in ('reserve','ack','complete','expire') then raise exception 'Invalid action' using errcode='22023'; end if;
  -- No caller-supplied lead ID can attach photos to another source or submission.
  perform 1 from public.website_leads where id=p_lead_id and lead_source='bike_buyer_uk' and external_submission_id=p_external_id for update;
  if not found then raise exception 'Lead not found' using errcode='42501'; end if;
  if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) not between 1 and 10 then raise exception 'Invalid manifest' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_photos) loop
    if coalesce(item->>'id','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
      or coalesce(item->>'sha256','') !~ '^[a-f0-9]{64}$'
      or coalesce((item->>'byte_size')::int,0) not between 1 and 4194304
      or coalesce((item->>'width')::int,0) not between 1 and 2048
      or coalesce((item->>'height')::int,0) not between 1 and 2048
      then raise exception 'Invalid photo' using errcode='22023'; end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_photos)) <> jsonb_array_length(p_photos) then raise exception 'Duplicate photo' using errcode='22023'; end if;
  select * into batch from public.bikebuyeruk_photo_transfers where website_lead_id=p_lead_id for update;
  if p_action='reserve' and batch.website_lead_id is null then
    -- Serialize the BikeBuyer staging allowance, without touching MotorGeeks quota.
    perform pg_advisory_xact_lock(731104729);
    select coalesce(sum(byte_size),0) into total_bytes from public.lead_photos where storage_bucket='motorgeeks-seller-photos' and storage_path like 'bike-buyer-uk/%' and status<>'removed';
    if total_bytes+(select sum((value->>'byte_size')::int) from jsonb_array_elements(p_photos)) > 52428800 then raise exception 'Photo budget reached' using errcode='PT503'; end if;
    if exists(select 1 from public.lead_photos p join jsonb_array_elements(p_photos) v on p.id=(v->>'id')::uuid) then raise exception 'Photo ID conflict' using errcode='PT409'; end if;
    insert into public.bikebuyeruk_photo_transfers(website_lead_id,external_submission_id,manifest) values(p_lead_id,p_external_id,p_photos) returning * into batch;
    position:=0;
    for item in select value from jsonb_array_elements(p_photos) loop
      insert into public.lead_photos(id,website_lead_id,storage_bucket,storage_path,content_type,byte_size,width,height,sort_order,status,upload_key)
      values((item->>'id')::uuid,p_lead_id,'motorgeeks-seller-photos','bike-buyer-uk/'||p_lead_id||'/'||(item->>'id')||'-'||(item->>'sha256')||'.jpg','image/jpeg',(item->>'byte_size')::int,(item->>'width')::int,(item->>'height')::int,position,'uploading',item->>'sha256');
      position:=position+1;
    end loop;
  end if;
  if batch.website_lead_id is null or batch.external_submission_id<>p_external_id then raise exception 'Transfer not found' using errcode='42501'; end if;
  if p_action='ack' then
    if batch.removed_at is not null or jsonb_array_length(p_photos)<>1 or not batch.manifest @> p_photos then raise exception 'Photo conflict' using errcode='PT409'; end if;
    item:=p_photos->0;
    update public.lead_photos set status='uploaded' where id=(item->>'id')::uuid and website_lead_id=p_lead_id and upload_key=item->>'sha256' and status in ('uploading','uploaded');
    if not found then raise exception 'Photo conflict' using errcode='PT409'; end if;
  else
    if batch.manifest<>p_photos then raise exception 'Manifest conflict' using errcode='PT409'; end if;
    if p_action='complete' and batch.completed_at is null then
      if (select count(*) from public.lead_photos p join jsonb_array_elements(batch.manifest) v on p.id=(v->>'id')::uuid where p.website_lead_id=p_lead_id and p.status='uploaded' and p.upload_key=v->>'sha256') <> jsonb_array_length(batch.manifest) then raise exception 'Photos incomplete' using errcode='PT409'; end if;
      update public.bikebuyeruk_photo_transfers set completed_at=now() where website_lead_id=p_lead_id returning * into batch;
    elsif p_action='expire' then
      if batch.completed_at is null or batch.completed_at>now()-interval '30 days' then raise exception 'Retention not reached' using errcode='PT409'; end if;
      update public.lead_photos set status='removed' where website_lead_id=p_lead_id and id in (select (value->>'id')::uuid from jsonb_array_elements(batch.manifest));
      update public.bikebuyeruk_photo_transfers set removed_at=coalesce(removed_at,now()) where website_lead_id=p_lead_id returning * into batch;
    end if;
  end if;
  return jsonb_build_object('complete',batch.completed_at is not null,'removed',batch.removed_at is not null);
end $$;
revoke all on function public.bbuk_photo_transfer(bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.bbuk_photo_transfer(bigint,text,text,jsonb) to service_role;

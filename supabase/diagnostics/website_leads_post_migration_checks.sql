-- READ-ONLY. Dan: run AFTER applying the reviewed migration. Not executed by the agent.
select received_date_basis, count(*) from public.website_leads group by 1 order by 1;
select count(*) filter(where received_at is null) as missing_received,
 count(*) filter(where portal_ready_at is not null) as deliberately_ready,
 count(*) filter(where archived_at is not null) as archived from public.website_leads;
explain (analyze,buffers) select id,received_at from public.website_leads
 order by received_at desc,id desc limit 51;
explain (analyze,buffers) select id,received_at from public.website_leads
 where archived_at is null and portal_ready_at is not null order by received_at desc,id desc limit 51;
explain (analyze,buffers) select id from public.website_leads
 where position('ab12cde' in regexp_replace(lower(coalesce(reg,'')),'[^a-z0-9]','','g'))>0 limit 51;
select has_function_privilege('anon','public.staff_website_leads_list(jsonb,timestamptz,bigint,integer)','execute') as anon_list_must_be_false,
 has_function_privilege('authenticated','public.staff_release_website_lead(bigint,uuid,timestamptz,text,jsonb)','execute') as dealer_release_must_be_false;

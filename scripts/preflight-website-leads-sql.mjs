// Isolated, synthetic PostgreSQL (PGlite) test. No env file, network or Supabase access.
// Usage: node scripts/preflight-website-leads-sql.mjs <path-to-pglite-dist-index.js>
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
const migration = readFileSync('supabase/migrations/20260921000200_website_lead_review_pagination.sql','utf8');
const foundation = readFileSync('supabase/migrations/20260816000100_dealer_buying_portal_foundation.sql','utf8');
function functionSql(source,name) {
 const start=source.indexOf(`create or replace function public.${name}(`);
 assert.ok(start>=0,name);
 const body=source.indexOf('$$',start), end=source.indexOf('$$;',body+2);
 return source.slice(start,end+3);
}
function tableSql(name) {
 const start=foundation.indexOf(`create table if not exists public.${name} (`);
 return foundation.slice(start,foundation.indexOf('\n);',start)+3);
}
const results=[];
const check=(name)=>results.push({name,passed:true});
try {
 await db.exec(`create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table public.dealer_users(id uuid primary key references auth.users(id),role text,active boolean);
 create table public.dealer_portal_accounts(id uuid primary key,account_status text,attribution_period_days int);
 create table public.website_leads(id bigint primary key,date text,submitted_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),
 received_at timestamptz,received_date_basis text,portal_reviewed_at timestamptz,portal_ready_at timestamptz,archived_at timestamptz,
 status text,opportunity_mode text,marketplace_status text,marketplace_accepted_offer_id uuid,marketplace_released_at timestamptz,assigned_to text);
 create table public.dealer_portal_audit_events(id uuid default gen_random_uuid(),website_lead_id bigint,dealer_user_id uuid,dealer_account_id uuid,event_type text,event_data jsonb);
 create function public.crm_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
 create trigger set_website_leads_updated_at before update on public.website_leads for each row execute function public.crm_set_updated_at();`);
 await db.exec(tableSql('dealer_lead_allocations'));
 await db.exec(tableSql('dealer_lead_claims'));
 const idx=foundation.indexOf('create unique index if not exists dealer_lead_claims_one_active_claim_idx');
 await db.exec(foundation.slice(idx,foundation.indexOf(';',idx)+1));
 for(const name of ['staff_actor_can_access','crm_staff_can_access','staff_lead_source_date','staff_lead_is_blocked','staff_lead_is_distributed','staff_website_lead_action','staff_release_website_lead']) await db.exec(functionSql(migration,name));
 await db.exec(functionSql(foundation,'dealer_claim_lead'));
 const staff='00000000-0000-0000-0000-000000000001', dealerA='00000000-0000-0000-0000-000000000010', dealerB='00000000-0000-0000-0000-000000000020';
 const userA='00000000-0000-0000-0000-000000000011',userB='00000000-0000-0000-0000-000000000021';
 await db.exec(`insert into auth.users values ('${staff}'),('${userA}'),('${userB}');
 insert into dealer_users values ('${staff}','team_member',true),('${userA}','dealer_user',true),('${userB}','future_role',true);
 insert into dealer_portal_accounts values ('${dealerA}','active',60),('${dealerB}','active',60);
 insert into website_leads(id,date,submitted_at,updated_at,status,opportunity_mode) values
 (1,'30/04/2026 16:21','2026-07-10T17:52:45.575422Z','2026-07-10T17:52:45.575422Z','new','direct_claim'),
 (2,'11/05/2026 15:12','2026-07-10T17:52:45.575422Z','2026-07-10T17:52:45.575422Z','new','direct_claim');`);
 for(const [id,allowed] of [[staff,true],[userA,false],[userB,false]]) {
  assert.equal((await db.query('select staff_actor_can_access($1) as allowed',[id])).rows[0].allowed,allowed);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  assert.equal((await db.query('select crm_staff_can_access() as allowed')).rows[0].allowed,allowed);
 }
 await assert.rejects(db.query("select staff_website_lead_action(1,'ready',$1)",[userB]),/Staff access required/);
 await assert.rejects(db.query("select staff_website_lead_action(1,'ready',$1)",[userA]),/Staff access required/);
 check('SQL allows active team_member; dealer and unknown roles denied');
 const backfill=migration.slice(migration.indexOf('do $$ begin\n if not exists(select 1 from pg_trigger'),migration.indexOf('alter table public.website_leads alter column received_at set not null;'));
 const before=await db.query('select id,updated_at::text,date,submitted_at::text,status from website_leads order by id');
 await db.exec(`begin; lock table website_leads in access exclusive mode; ${backfill} commit;`);
 assert.deepEqual((await db.query('select id,updated_at::text,date,submitted_at::text,status from website_leads order by id')).rows,before.rows);
 assert.equal((await db.query('select count(*)::int as n from website_leads where received_at is not null')).rows[0].n,2);
 assert.equal((await db.query("select received_date_basis from website_leads where id=2")).rows[0].received_date_basis,'ambiguous_source:submitted_at');
 assert.equal((await db.query("select tgenabled from pg_trigger where tgname='set_website_leads_updated_at'")).rows[0].tgenabled,'O');
 check('Canonical backfill preserves original date, submitted_at, status and microsecond updated_at; trigger restored');
 await db.exec('create trigger unexpected_lead_hook before update on website_leads for each row execute function crm_set_updated_at();');
 await assert.rejects(db.exec(`begin; ${backfill} commit;`),/Additional website_leads hooks/);
 await db.exec('rollback; drop trigger unexpected_lead_hook on website_leads;');
 check('Unexpected enabled lead hook fails backfill closed');
 await db.exec('begin;');
 await db.exec(backfill);
 await assert.rejects(db.exec('select 1/0;'),/division by zero/);
 await db.exec('rollback;');
 assert.equal((await db.query("select tgenabled from pg_trigger where tgname='set_website_leads_updated_at'")).rows[0].tgenabled,'O');
 assert.deepEqual((await db.query('select id,updated_at::text,date,submitted_at::text,status from website_leads order by id')).rows,before.rows);
 check('Later transaction failure rolls back safely with timestamp trigger enabled');
 const allocation=(id,status='available',override=false)=>({dealer_account_id:id,allocation_status:status,match_reasons:{previous_dealer_reclaim_override:override},excluded_reasons:{}});
 const ready=()=>db.query("select staff_website_lead_action(1,'ready',$1)",[staff]);
 const release=async(allocations,actor=staff)=>db.query('select staff_release_website_lead(1,$1,(select updated_at from website_leads where id=1),$2,$3::jsonb) as result',[actor,'matching_pool',JSON.stringify(allocations)]);
 const claim=async(account,user)=>(await db.query('select * from dealer_claim_lead(1,$1,$2)',[account,user])).rows[0];
 const outcome=async(id,status)=>{await db.query('update dealer_lead_claims set status=$1 where id=$2',[status,id]);await db.query('update website_leads set status=$1 where id=1',[status==='lost'?'dealer_lost':'dealer_returned']);};
 await ready(); await assert.rejects(release([allocation(dealerA)],userB),/Staff access required/);
 await release([allocation(dealerA),allocation(dealerB)]);
 const firstClaim=await claim(dealerA,userA); assert.ok(firstClaim.id); await outcome(firstClaim.id,'lost');
 const oldAllocations=(await db.query('select * from dealer_lead_allocations order by id')).rows;
 await ready(); await assert.rejects(release([allocation(dealerA)]),/Previous dealer override required/);
 await release([allocation(dealerA,'excluded'),allocation(dealerB)]);
 for(const row of oldAllocations) assert.deepEqual((await db.query('select * from dealer_lead_allocations where id=$1',[row.id])).rows[0],row);
 const secondClaim=await claim(dealerB,userB); assert.ok(secondClaim.id); assert.notEqual(secondClaim.allocation_id,firstClaim.allocation_id);
 await outcome(secondClaim.id,'returned_to_pool');
 await ready(); await assert.rejects(release([allocation(dealerB)]),/Previous dealer override required/);
 await release([allocation(dealerA,'available',true)]);
 const thirdClaim=await claim(dealerA,userA); assert.ok(thirdClaim.id);assert.notEqual(thirdClaim.allocation_id,firstClaim.allocation_id);
 assert.equal((await db.query('select count(*)::int as n from dealer_lead_allocations where website_lead_id=1')).rows[0].n,5);
 assert.equal((await db.query("select count(*)::int as n from dealer_portal_audit_events where event_type='previous_dealer_reclaim_override_recorded'")).rows[0].n,1);
 await assert.rejects(ready(),/cannot be readied/);
 check('Release → claim → lost → re-release → claim → returned → explicit reclaim override → claim succeeds; old allocation identities retained');
 check('Lost/returned prior dealer denied without override; active claimed opportunity cannot be readied');
 await db.exec("update dealer_users set active=false where role='team_member';");
 assert.equal((await db.query('select staff_actor_can_access($1) as allowed',[staff])).rows[0].allowed,false);
 check('Inactive internal staff denied');
 const report={engine:'PGlite isolated PostgreSQL; synthetic schema/data; extracted functions and backfill block only, not the migration',supabaseWrites:0,results};
 writeFileSync('reports/website-leads/preflight-sql-tests.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
} finally { await db.close(); }

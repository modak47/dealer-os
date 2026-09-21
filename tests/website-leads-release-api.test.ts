import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import Module from "node:module";
const require=createRequire(import.meta.url);
const loader=Module as unknown as {_load:(name:string,parent:unknown,main:boolean)=>unknown};
const original=loader._load;
let authorised=true;
let lead:Record<string,unknown>={};
let commitCalls:Record<string,unknown>[]=[];
let conflict=false;
let previous=false;
const db={
 from:(table:string)=>{
  const query={select:()=>query,eq:()=>query,in:()=>query,maybeSingle:async()=>({data:lead,error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:table==='dealer_portal_accounts'?[{id:'dealer-1',account_status:'active',trading_name:'Example'}]:previous?[{id:'previous-claim',dealer_account_id:'dealer-1',status:'lost'}]:[],error:null}).then(resolve)};
  return query;
 },
 rpc:async(name:string,args:Record<string,unknown>)=>{assert.equal(name,'staff_release_website_lead');commitCalls.push(args);return conflict?{data:null,error:{code:'P0001',message:'Lead changed; refresh and review before release'}}:{data:{allocations:[],status:lead.opportunity_mode==='marketplace_offer'?'new':'dealer_pool_available'},error:null};}
};
loader._load=function(name,parent,main){
 if(name==='server-only')return {};
 if(name==='@/lib/auth/require-staff')return {requireStaffUser:async()=>authorised?{id:'staff-id'}:null};
 if(name==='@/lib/current-user')return {getCurrentUserId:async()=>'staff-id'};
 if(name==='@/lib/supabase-admin')return {getSupabaseAdminClient:()=>db};
 if(name==='@/lib/dealer-portal')return {withDealerPreferencesList:async(x:unknown)=>x};
 if(name==='@/lib/dealer-notifications')return {notifyDealerLeadAllocation:async()=>{throw new Error('No notification should be sent in this fixture');}};
 return original.call(this,name,parent,main);
};
const {POST}=require('../app/api/dealer-portal/admin/release/route.ts') as {POST:(r:Request)=>Promise<Response>};
loader._load=original;
function ready(){lead={id:1,status:'new',opportunity_mode:'direct_claim',portal_ready_at:'2026-09-21T12:00:00Z',updated_at:'2026-09-21T12:00:00.123456Z'};commitCalls=[];conflict=false;previous=false;authorised=true;}
function request(extra:Record<string,unknown>={}){return new Request('http://localhost/api/dealer-portal/admin/release',{method:'POST',body:JSON.stringify({website_lead_id:1,allocation_method:'matching_pool',...extra})});}
test('direct and marketplace release both use atomic commit with their existing opportunity mode',async()=>{
 for(const mode of ['direct_claim','marketplace_offer']){ready();lead.opportunity_mode=mode;lead.marketplace_status=mode==='marketplace_offer'?'submitted':null;
 const r=await POST(request());assert.equal(r.status,200);assert.equal(commitCalls.length,1);assert.equal(commitCalls[0].p_expected_updated_at,lead.updated_at);assert.equal(commitCalls[0].p_actor,'staff-id');
 const allocation=(commitCalls[0].p_allocations as {allocation_status:string}[])[0];assert.equal(allocation.allocation_status,'available');}
});
test('release is denied without staff, readiness, or for archived/terminal/claimed/accepted leads',async()=>{
 ready();authorised=false;assert.equal((await POST(request())).status,401);assert.equal(commitCalls.length,0);
 for(const change of [{portal_ready_at:null},{archived_at:'now'},{status:'dealer_claimed'},{status:'purchased'},{opportunity_mode:'unknown'},{opportunity_mode:'marketplace_offer',marketplace_status:'offer_accepted'}]){
 ready();Object.assign(lead,change);assert.equal((await POST(request())).status,409);assert.equal(commitCalls.length,0);}
});
test('stale release is refused by commit and previous-dealer override remains explicit',async()=>{
 ready();conflict=true;assert.equal((await POST(request())).status,409);
 ready();previous=true;assert.equal((await POST(request({allocation_method:'direct',dealer_account_ids:['dealer-1']}))).status,409);assert.equal(commitCalls.length,0);
 const r=await POST(request({allocation_method:'direct',dealer_account_ids:['dealer-1'],allow_previous_dealer_reclaim:true}));assert.equal(r.status,200);
 const a=(commitCalls[0].p_allocations as {match_reasons:{previous_dealer_reclaim_override:boolean}}[])[0];assert.equal(a.match_reasons.previous_dealer_reclaim_override,true);
});

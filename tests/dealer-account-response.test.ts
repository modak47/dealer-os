/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic module/query adapter around the real handlers and PostgreSQL results. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Module,{ createRequire } from 'node:module';
const require=createRequire(import.meta.url),loader=Module as unknown as {_load:(name:string,parent:unknown,main:boolean)=>any},original=loader._load;
const account={id:'test-dealer',trading_name:'Test dealership',account_status:'active',successful_purchase_fee:50,internal_notes:'PRIVATE-STAFF-SENTINEL',autotrader_dealer_ref:'PRIVATE-STAFF-SENTINEL',future_internal_field:'PRIVATE-STAFF-SENTINEL',buying_preferences:{makes_wanted:['Honda'],internal_notes:'PRIVATE-STAFF-SENTINEL'},geography_preferences:{england:true,staff_metadata:'PRIVATE-STAFF-SENTINEL'}};
let active=true;
const session={dealer:account,role:'dealer_admin',userId:'test-user'};
const chain=(table:string)=>{const q:any={select:()=>q,update:()=>q,eq:()=>q,order:()=>q,limit:()=>q,in:()=>q,maybeSingle:async()=>({data:table==='dealer_portal_accounts'?account:null,error:null}),then:(resolve:any)=>resolve({data:[],error:null})};return q;};
loader._load=function(name,parent,main){
 if(name==='server-only')return{};
 if(name==='@/lib/visual-test-mode')return{isVisualTestRequest:()=>false};
 if(name==='@/lib/dealer-portal')return{getCurrentDealerPortalAccount:async()=>active?session:null,getCurrentDealerPortalMembership:async()=>session,cleanDealerSelfAccountPayload:()=>({trading_name:'Test dealership'}),dealerSelfAccountChangeSummary:()=>({}),isDealerPortalAdmin:()=>true,saveDealerPreferencePayloads:async()=>{},withDealerPreferences:async()=>account};
 if(name==='@/lib/dealer-portal-audit')return{recordDealerPortalAuditEvent:async()=>{}};
 if(name==='@/lib/supabase-admin')return{getSupabaseAdminClient:()=>({from:chain})};
 if(name==='@/lib/marketplace-photos')return{signedMarketplacePhotoUrls:async()=>new Map()};
 return original.call(this,name,parent,main);
};
const routes=['leads','offer-leads','payments','account'].map(path=>[path,require(`../app/api/dealer-portal/${path}/route`)] as const);loader._load=original;
test('actual dealer HTTP responses allowlist account and preference data',async()=>{
 for(const [path,route] of routes){const request=new Request(`http://localhost/api/dealer-portal/${path}`,{method:path==='account'?'PATCH':'GET',...(path==='account'?{body:'{}',headers:{'content-type':'application/json'}}:{})});const response=await (route.GET||route.PATCH)(request);assert.equal(response.status,200,path);const body=await response.json();assert.equal(body.dealer.trading_name,account.trading_name);assert.equal(body.dealer.successful_purchase_fee,50);assert.ok(!JSON.stringify(body).includes('PRIVATE-STAFF-SENTINEL'),path);assert.deepEqual(body.dealer.buying_preferences,{makes_wanted:['Honda']});}
 active=false;const response=await routes[0][1].GET(new Request('http://localhost/api/dealer-portal/leads'));assert.equal(response.status,403);assert.ok(!(await response.text()).includes('PRIVATE-STAFF-SENTINEL'));
});

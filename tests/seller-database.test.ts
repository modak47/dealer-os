import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { sellerDatabase,rpc } from './support/seller-database';
const valid={version:0,currentStep:4,vehicle:{registration:'TEST123',make:'Honda',model:'CB500',year:'2020'},condition:{mileage:'1200',registeredKeeper:'yes',overallCondition:'Good',serviceHistory:'Unknown',running:'yes',writtenOff:'no',outstandingFinance:'no',mechanicalFaults:'no',cosmeticDamage:'no'},seller:{firstName:'Test',lastName:'Seller',email:'isolated@example.invalid',mobile:'07123456789',postcode:'SW1A 1AA',consent:true}};
export const finalInput=()=>({...structuredClone(valid),deliveryId:randomUUID(),linkHash:randomUUID(),sessionHash:randomUUID()});
test('isolated PostgreSQL: grants, atomic submission, retries, tokens, evidence and photos',async t=>{
 const db=await sellerDatabase();
 try{
  const call=(name:string,args:Record<string,unknown>)=>rpc(db,name,args);
  const draft=(hash:string,action='create',data={})=>call('mg_draft_operation',{p_hash:hash,p_action:action,p_data:data});
  await t.test('anon and authenticated cannot call privileged functions; server role can',async()=>{
   for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);
    for(const [name,args] of [['seller_accept_marketplace_offer',{p_website_lead_id:-1,p_offer_id:randomUUID()}],['dealer_submit_marketplace_offer',{p_website_lead_id:-1,p_dealer_account_id:randomUUID(),p_dealer_user_id:randomUUID(),p_amount_pence:100,p_note:''}],['marketplace_purchase_fee_amount',{p_website_lead_id:-1,p_dealer_account_id:randomUUID()}],['mg_draft_operation',{p_hash:'x',p_action:'create'}]] as const)await assert.rejects(call(name,args),/permission denied/);
    await db.exec('reset role');
   }
   await db.exec('set role service_role');
   assert.ok(await draft('A'));
   assert.equal(await call('marketplace_purchase_fee_amount',{p_website_lead_id:-1,p_dealer_account_id:randomUUID()}),null);
   await assert.rejects(call('seller_accept_marketplace_offer',{p_website_lead_id:-1,p_offer_id:randomUUID()}),/Offer is no longer available/);
   await assert.rejects(call('dealer_submit_marketplace_offer',{p_website_lead_id:-1,p_dealer_account_id:randomUUID(),p_dealer_user_id:randomUUID(),p_amount_pence:100,p_note:''}),/dealer_lead_allocations|not authorised/);
   await db.exec('reset role');
  });
  let lead:number;
  await t.test('concurrent and lost-response retries create one opportunity with latest values and untrusted evidence removed',async()=>{
   const input=finalInput();input.vehicle.model='Latest answer';Object.assign(input.vehicle,{checkRaw:{clear:true},lookupRaw:{trusted:true},vehicle_check_status:'clear'});
   const results=await Promise.all(Array.from({length:5},()=>draft('A','submit',{...input,sessionHash:randomUUID()})));
   lead=results[0].leadId;assert.ok(results.every(r=>r.leadId===lead));
   assert.equal((await draft('A','submit',finalInput())).leadId,lead);
   const rows=(await db.query<Record<string, unknown>>('select * from website_leads')).rows;assert.equal(rows.length,1);assert.equal(rows[0].model,'Latest answer');assert.equal(rows[0].opportunity_mode,'marketplace_offer');assert.equal(rows[0].lead_source,'motorgeeks');assert.equal(rows[0].vehicle_check_status,'not_checked');assert.deepEqual(rows[0].autotrader_vehicle_check_data,{});assert.equal((rows[0].seller_vehicle_snapshot as Record<string,unknown>).checkRaw,undefined);
   await assert.rejects(draft('A','save',valid),/already submitted/);
  });
  await t.test('every database step rolls back if an audit insert fails',async()=>{
   await draft('rollback');
   await db.exec("create function reject_audit() returns trigger language plpgsql as $$ begin raise exception 'Injected audit failure'; end $$; create trigger reject_audit before insert on dealer_portal_audit_events for each row execute function reject_audit();");
   const counts=await db.query('select (select count(*) from website_leads) as leads,(select count(*) from seller_access_tokens) as tokens,(select count(*) from seller_email_deliveries) as deliveries');
   await assert.rejects(draft('rollback','submit',finalInput()),/Injected audit failure/);
   assert.deepEqual((await db.query('select (select count(*) from website_leads) as leads,(select count(*) from seller_access_tokens) as tokens,(select count(*) from seller_email_deliveries) as deliveries')).rows,counts.rows);
   assert.equal((await draft('rollback','read')).website_lead_id,null);await db.exec('drop trigger reject_audit on dealer_portal_audit_events');
  });
  await t.test('optimistic revisions reject stale writes without losing answers',async()=>{
   await draft('B');await draft('B','save',valid);await assert.rejects(draft('B','save',{...valid,vehicle:{...valid.vehicle,model:'stale'}}),/another tab/);assert.equal((await draft('B','read')).vehicle_snapshot.model,'CB500');
  });
  await t.test('single-use/expired/revoked links and failed session insertion remain safe',async()=>{
   const issue=async(hash:string)=>call('mg_issue_link',{p_lead:lead,p_email:valid.seller.email,p_delivery:randomUUID(),p_hash:hash});
   await issue('replacement');await call('mg_consume_link',{p_hash:'replacement',p_session_hash:'session-A'});await assert.rejects(call('mg_consume_link',{p_hash:'replacement',p_session_hash:'session-2'}),/Link unavailable/);
   await issue('expired');await db.exec("update seller_access_tokens set expires_at=now()-interval '1 second' where token_hash='expired'");await assert.rejects(call('mg_consume_link',{p_hash:'expired',p_session_hash:'s'}),/Link unavailable/);
   await issue('revoked');await issue('latest');await assert.rejects(call('mg_consume_link',{p_hash:'revoked',p_session_hash:'s'}),/Link unavailable/);
   await assert.rejects(call('mg_consume_link',{p_hash:'latest',p_session_hash:'session-A'}),/unique/);assert.equal((await db.query<Record<string, unknown>>("select used_at from seller_access_tokens where token_hash='latest'")).rows[0].used_at,null);
   assert.equal(await call('mg_consume_link',{p_hash:'latest',p_session_hash:'session-new'}),lead);
  });
  await t.test('post-submit uploads reuse one row, protect cross-seller access, enforce 20 under concurrent calls, and freeze live edits',async()=>{
   const photo=(hash:string,action:string,data={})=>call('mg_photo_operation',{p_hash:hash,p_action:action,p_data:data});
   const reserve=(hash:string,key:string)=>photo(hash,'reserve',{id:randomUUID(),key,bytes:200,type:'image/jpeg',filename:'test.jpg'});
   const ph=await reserve('session-A','first');await photo('session-A','finish',{id:ph.id,lease:ph.upload_lease_until});assert.equal((await reserve('session-A','first')).id,ph.id);
   assert.equal((await photo('session-A','list')).photos[0].website_lead_id,lead);
   await assert.rejects(photo('B','remove',{id:ph.id}),/Photo not found/);assert.equal((await photo('B','list')).photos.length,0);
   const many=await Promise.allSettled(Array.from({length:25},(_,i)=>reserve('session-A',`photo-${i}`)));assert.equal(many.filter(r=>r.status==='fulfilled').length,19);
   assert.equal((await db.query<Record<string, unknown>>("select count(*)::int as n from lead_photos where status in ('uploaded','uploading')")).rows[0].n,20);
   await db.query("update website_leads set marketplace_status=null where id=$1",[lead]);await assert.rejects(photo('session-A','remove',{id:ph.id}),/locked/);
   await db.query("update website_leads set marketplace_status='live_to_dealers' where id=$1",[lead]);await assert.rejects(photo('session-A','remove',{id:ph.id}),/locked/);assert.equal((await photo('session-A','list')).editable,false);
   await call('mg_logout',{p_hash:'session-A'});await assert.rejects(photo('session-A','list'),/expired/);
  });
  await t.test('durable limits persist across caller instances',async()=>{for(let i=0;i<3;i++)assert.equal(await call('mg_rate_limit',{p_key:'limit',p_limit:2,p_seconds:60}),i<2);});
 }finally{await db.close();}
});

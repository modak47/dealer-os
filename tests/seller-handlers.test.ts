/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic module/query adapter around the real handlers and PostgreSQL results. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { sellerDatabase,rpc } from './support/seller-database';
const require=createRequire(import.meta.url);
const sharp=createRequire(resolve('apps/motorleads/package.json'))('sharp');
const loader=Module as unknown as {_load:(name:string,parent:unknown,main:boolean)=>any};
const original=loader._load;
const context=new AsyncLocalStorage<Map<string,string>>();
const jar=()=>({get:(key:string)=>{const value=context.getStore()!.get(key);return value?{value}:undefined;},set:(key:string,value:string)=>context.getStore()!.set(key,value),delete:(key:string)=>context.getStore()!.delete(key)});
let db:Awaited<ReturnType<typeof sellerDatabase>>;
const objects=new Map<string,Buffer>();let failStorage=false;let afterWork:Array<()=>Promise<void>>=[];
function query(table:string){
 const filters:string[]=[],params:unknown[]=[];let columns='*',order='',limit='';let single=false;
 const q:any={select:(value:string)=>{columns=value.includes(':')?'*':value;return q;},eq:(key:string,value:unknown)=>{params.push(value);filters.push(`${key}=$${params.length}`);return q;},gt:(key:string,value:unknown)=>{params.push(value);filters.push(`${key}>$${params.length}`);return q;},lt:(key:string,value:unknown)=>{params.push(value);filters.push(`${key}<$${params.length}`);return q;},is:(key:string)=>{filters.push(`${key} is null`);return q;},in:(key:string,values:unknown[])=>{params.push(values);filters.push(`${key}=any($${params.length})`);return q;},order:(key:string,options:any={})=>{order=` order by ${key} ${options.ascending===false?'desc':'asc'}`;return q;},limit:(n:number)=>{limit=` limit ${n}`;return q;},maybeSingle:()=>{single=true;return q;},then:(resolve:any)=>db.query(`select ${columns} from ${table}${filters.length?' where '+filters.join(' and '):''}${order}${limit}`,params).then(r=>resolve({data:single?r.rows[0]||null:r.rows,error:null})).catch(error=>resolve({data:null,error}))};return q;
}
const admin={rpc:async(name:string,args:Record<string,unknown>)=>{try{return{data:await rpc(db,name,args),error:null};}catch(error){return{data:null,error};}},from:query,storage:{from:()=>({upload:async(path:string,bytes:Buffer)=>{if(failStorage)return{error:{message:'Injected object storage failure'}};if(objects.has(path))return{error:{statusCode:'409',message:'Already exists'}};objects.set(path,Buffer.from(bytes));return{error:null};},createSignedUrl:async(path:string)=>({data:{signedUrl:`http://private-storage.invalid/${path}?controlled-signature=1`},error:objects.has(path)?null:{message:'Missing object'}})})}};
loader._load=function(name,parent,main){
 if(name==='server-only')return{};
 if(name==='next/headers')return{cookies:async()=>jar(),headers:async()=>new Headers({'x-real-ip':'127.0.0.1'})};
 if(name.endsWith('/supabase-server')||name==='./supabase-server')return{getSupabaseAdmin:()=>admin};
 if(name==='next/server')return{...original.call(this,name,parent,main),after:(work:()=>Promise<void>)=>afterWork.push(work)};
 return original.call(this,name,parent,main);
};
const draft=require('../apps/motorleads/app/api/valuation/draft/route');
const submit=require('../apps/motorleads/app/api/valuation/submit/route');
const photo=require('../apps/motorleads/app/lib/seller-photos');
const recovery=require('../apps/motorleads/app/api/seller/recover/route');
const access=require('../apps/motorleads/app/api/seller/access/route');
const preview=require('../apps/motorleads/app/seller/[token]/route');
const logout=require('../apps/motorleads/app/api/seller/logout/route');
const marketplace=require('../apps/motorleads/app/lib/marketplace');
const security=require('../apps/motorleads/app/lib/seller-security');
const delivery=require('../apps/motorleads/app/lib/seller-delivery');
const deliveryRetries=require('../apps/motorleads/app/api/internal/seller-deliveries/route');
loader._load=original;
const request=(path:string,body:unknown,method='POST')=>new Request(`http://localhost${path}`,{method,headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(body)});
const form={version:0,currentStep:4,vehicle:{registration:'TEST123',make:'Honda',model:'CB500',year:'2020',lookupRaw:{trusted:true},checkRaw:{clear:true}},condition:{mileage:'1200',registeredKeeper:'yes',overallCondition:'Good',serviceHistory:'Unknown',running:'yes',writtenOff:'no',outstandingFinance:'no',mechanicalFaults:'no',cosmeticDamage:'no'},seller:{firstName:'Test',lastName:'Seller',email:'api@example.invalid',mobile:'07123456789',postcode:'SW1A 1AA',consent:true}};
test('actual seller HTTP handlers with isolated PostgreSQL and local mail sink',async t=>{
 db=await sellerDatabase();process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-only-not-a-production-key';process.env.RESEND_API_KEY='isolated';process.env.RESEND_FROM_EMAIL='test@example.invalid';process.env.MOTORGEEKS_REPLY_TO='replies@example.invalid';
 let providerStatus=422,networkFailure=false;const messages:Array<{body:any,key:string|undefined}>=[];
 const sink=createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{messages.push({body:JSON.parse(body),key:req.headers['idempotency-key'] as string});res.writeHead(providerStatus,{'Content-Type':'application/json'});res.end(JSON.stringify(providerStatus===200?{id:'sink-message'}:{error:'controlled rejection'}));});});await new Promise<void>(resolve=>sink.listen(0,'127.0.0.1',resolve));
 const address=sink.address() as {port:number},nativeFetch=global.fetch;
 global.fetch=async(input,init)=>{if(String(input)==='https://api.resend.com/emails'){if(networkFailure)throw new Error('controlled network loss');return nativeFetch(`http://127.0.0.1:${address.port}/mail`,init);}throw new Error('Unexpected outbound request in isolated test');};
 const A=new Map<string,string>(),B=new Map<string,string>();let lead:number,deliveryId:string;
 try{
 await t.test('restore creates a scoped draft; blank required stages fail; malicious provider values are dropped',()=>context.run(A,async()=>{
  let response=await draft.GET();assert.equal(response.status,200);assert.equal((await response.json()).draft.revision,0);
  response=await submit.POST(request('/api/valuation/submit',{}));assert.equal(response.status,400);
  response=await draft.PATCH(request('/api/valuation/draft',form,'PATCH'));assert.equal(response.status,200);const data=await response.json();assert.equal(data.draft.vehicle_snapshot.checkRaw,undefined);
 }));
 await t.test('final edit, concurrent submits, response-loss retry and provider rejection retain one saved profile',()=>context.run(A,async()=>{
  const latest={...form,version:1,vehicle:{...form.vehicle,model:'Typed immediately before Submit'}};
  const responses=await Promise.all([submit.POST(request('/api/valuation/submit',latest)),submit.POST(request('/api/valuation/submit',latest))]);
  const data=await Promise.all(responses.map(r=>r.json()));assert.ok(data.every(p=>p.ok),JSON.stringify(data));lead=data[0].leadId;deliveryId=data[0].deliveryId;assert.ok(data.every(p=>p.leadId===lead));
  const retry=await (await submit.POST(request('/api/valuation/submit',latest))).json();assert.equal(retry.leadId,lead);assert.equal(retry.emailStatus,'failed');
  const saved=(await db.query<any>('select * from website_leads')).rows;assert.equal(saved.length,1);assert.equal(saved[0].model,latest.vehicle.model);assert.equal(saved[0].vehicle_check_status,'not_checked');assert.deepEqual(saved[0].autotrader_vehicle_check_data,{});assert.ok(A.has('mg_seller_session'));
 }));
 await t.test('mail network uncertainty, missing configuration and acceptance are distinct; retries use same provider key',async()=>{
  networkFailure=true;assert.equal(await delivery.sendSellerDelivery(deliveryId),'unknown');networkFailure=false;
  delete process.env.RESEND_API_KEY;assert.equal(await delivery.sendSellerDelivery(deliveryId),'not_configured');process.env.RESEND_API_KEY='isolated';providerStatus=200;
  assert.equal(await delivery.sendSellerDelivery(deliveryId),'accepted');const before=messages.length;assert.equal(await delivery.sendSellerDelivery(deliveryId),'accepted');assert.equal(messages.length,before);
  assert.equal(new Set(messages.map(m=>m.key)).size,1);assert.ok(messages.every(m=>m.body.html.includes('https://motorgeeks.co.uk/seller/')));assert.ok(messages.every(m=>m.body.reply_to==='replies@example.invalid'));
  const row=(await db.query<any>('select * from seller_email_deliveries where id=$1',[deliveryId])).rows[0];assert.ok(row.accepted_at);assert.equal(row.delivered_at,null);
 });
 await t.test('delivery retry GET and POST reject missing or incorrect cron secrets without processing rows',async()=>{
  delete process.env.CRON_SECRET;
  const unconfigured=await deliveryRetries.GET(new Request('http://localhost/api/internal/seller-deliveries'));
  assert.equal(unconfigured.status,401);
  process.env.CRON_SECRET='controlled-cron-secret-for-tests';
  const attemptsBefore=(await db.query<any>('select coalesce(sum(attempts),0)::int as n from seller_email_deliveries')).rows[0].n;
  const missing=await deliveryRetries.GET(new Request('http://localhost/api/internal/seller-deliveries'));
  const incorrect=await deliveryRetries.POST(new Request('http://localhost/api/internal/seller-deliveries',{method:'POST',headers:{authorization:'Bearer incorrect'}}));
  assert.equal(missing.status,401);assert.equal(incorrect.status,401);
  const attemptsAfter=(await db.query<any>('select coalesce(sum(attempts),0)::int as n from seller_email_deliveries')).rows[0].n;
  assert.equal(attemptsAfter,attemptsBefore);
  const valid=await deliveryRetries.GET(new Request('http://localhost/api/internal/seller-deliveries',{headers:{authorization:`Bearer ${process.env.CRON_SECRET}`}}));
  assert.equal(valid.status,200);assert.equal(typeof (await valid.json()).checked,'number');
 });
 await t.test('replacement is generic; preview does not consume; explicit POST opens original profile; reuse fails',()=>context.run(B,async()=>{
  const known=await recovery.POST(request('/api/seller/recover',{email:form.seller.email}));const unknown=await recovery.POST(request('/api/seller/recover',{email:'absent@example.invalid'}));assert.equal(known.status,200);assert.deepEqual(await known.json(),await unknown.json());
  for(const work of afterWork)await work();afterWork=[];
  const row=(await db.query<any>('select id from seller_email_deliveries order by created_at desc limit 1')).rows[0];const token=security.deliveryToken(row.id);
  await preview.GET(new Request('http://localhost/seller/redacted'),{params:Promise.resolve({token})});
  assert.equal((await db.query<any>('select used_at from seller_access_tokens where token_hash=$1',[require('../apps/motorleads/app/lib/secure-token').tokenHash(token)])).rows[0].used_at,null);
  // Pending cookie is set on the redirect response; emulate browser cookie handling.
  B.set('mg_pending_seller_link',token);
  const result=await access.POST(request('/api/seller/access',{}));assert.equal(result.headers.get('location'),'http://localhost/seller');
  const session=await marketplace.sellerLeadFromSession();assert.equal(session.lead.id,lead);
  B.set('mg_pending_seller_link',token);assert.match((await access.POST(request('/api/seller/access',{}))).headers.get('location'),/invalid/);
 }));
 await t.test('real JPEG/PNG/WebP decoded and re-encoded; fake images and HEIC/HEIF rejected explicitly',async()=>{
  for(const format of ['jpeg','png','webp'] as const){const bytes=await sharp({create:{width:4,height:4,channels:3,background:'blue'}})[format]().toBuffer();const output=await photo.normalizeSellerPhoto(new File([bytes],`test.${format}`,{type:`image/${format}`}));assert.equal((await sharp(output.bytes).metadata()).format,'jpeg');}
  for(const type of ['image/heic','image/heif','image/jpeg'])await assert.rejects(photo.normalizeSellerPhoto(new File(['not an image'],'invalid',{type})),/supported|HEIC/);
 });
 await t.test('post-submit upload, partial failure and retry preserve success without duplicate rows; scoped removal',()=>context.run(A,async()=>{
  const send=async(color:string)=>{const bytes=await sharp({create:{width:4,height:4,channels:3,background:color}}).png().toBuffer();const body=new FormData();body.set('photos',new File([bytes],`${color}.png`,{type:'image/png'}));return photo.POST(new Request('http://localhost/api/seller/photos',{method:'POST',headers:{origin:'http://localhost'},body}));};
  assert.equal((await send('red')).status,200);failStorage=true;assert.equal((await send('blue')).status,503);failStorage=false;assert.equal((await send('blue')).status,200);assert.equal((await send('red')).status,200);
  const rows=(await db.query<any>("select * from lead_photos where status='uploaded'")).rows;assert.equal(rows.length,2);assert.ok(rows.every(p=>p.website_lead_id===lead));assert.equal(objects.size,2);
  await context.run(new Map(),async()=>assert.equal((await photo.GET(new Request('http://localhost/api/seller/photos'))).status,401));
  const C=new Map<string,string>();await context.run(C,async()=>{await draft.GET();assert.equal((await photo.DELETE(request(`/api/valuation/photos?id=${rows[0].id}`,{},'DELETE'))).status,401);});
  assert.equal((await photo.DELETE(request(`/api/seller/photos?id=${rows[0].id}`,{},'DELETE'))).status,200);
 }));
 await t.test('a second seller cannot use supplied lead/photo IDs to cross the session boundary',async()=>{
  const D=new Map<string,string>();await context.run(D,async()=>{
   await draft.GET();const result=await (await submit.POST(request('/api/valuation/submit',{...form,seller:{...form.seller,email:'second@example.invalid'}}))).json();assert.ok(result.ok);assert.notEqual(result.leadId,lead);
   const own=await marketplace.sellerLeadFromSession();assert.equal(own.lead.id,result.leadId);
   const response=await photo.GET(new Request(`http://localhost/api/seller/photos?leadId=${lead}`));assert.deepEqual((await response.json()).photos,[]);
   const aPhoto=(await db.query<any>("select id from lead_photos where website_lead_id=$1 and status='uploaded'",[lead])).rows[0];
   assert.equal((await photo.DELETE(request(`/api/seller/photos?id=${aPhoto.id}&leadId=${lead}`,{},'DELETE'))).status,401);
  });
 });
 await t.test('failed session insertion in the access handler leaves the link unconsumed for retry',()=>context.run(B,async()=>{
  const id='00000000-0000-4000-8000-000000000999',token=security.deliveryToken(id),hash=require('../apps/motorleads/app/lib/secure-token').tokenHash(token);
  await rpc(db,'mg_issue_link',{p_lead:lead,p_email:form.seller.email,p_delivery:id,p_hash:hash});
  await db.exec("create function reject_session() returns trigger language plpgsql as $$ begin if new.purpose='seller_session' then raise exception 'Controlled session failure'; end if; return new; end $$; create trigger reject_session before insert on seller_access_tokens for each row execute function reject_session();");
  B.set('mg_pending_seller_link',token);assert.match((await access.POST(request('/api/seller/access',{}))).headers.get('location'),/invalid/);
  assert.equal((await db.query<any>('select used_at from seller_access_tokens where token_hash=$1',[hash])).rows[0].used_at,null);
  await db.exec('drop trigger reject_session on seller_access_tokens');B.set('mg_pending_seller_link',token);assert.match((await access.POST(request('/api/seller/access',{}))).headers.get('location'),/\/seller$/);
 }));
 await t.test('logout revokes the session and signed-out access does not create another profile',()=>context.run(A,async()=>{assert.equal((await logout.POST(request('/api/seller/logout',{}))).status,303);assert.equal(await marketplace.sellerLeadFromSession(),null);assert.equal((await db.query<any>('select count(*)::int as n from website_leads')).rows[0].n,2);}));
 }finally{global.fetch=nativeFetch;await new Promise<void>(resolve=>sink.close(()=>resolve()));await db.close();}
});

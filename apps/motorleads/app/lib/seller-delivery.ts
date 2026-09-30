import "server-only";
import { randomUUID } from "node:crypto";
import { deliveryToken, sellerRpc } from "./seller-security";
import { getSupabaseAdmin } from "./supabase-server";
export async function sendSellerDelivery(id:string){
 const attemptId=randomUUID();
 const claimed=await sellerRpc('mg_delivery',{p_id:id,p_action:'claim',p_data:{attemptId}});
 if(claimed.status!=='send')return claimed.status as string;
 let status='not_configured',providerId:string|undefined,error:string|undefined;
 const key=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL||process.env.MOTORGEEKS_RESEND_FROM;
 if(key&&from){
  try{
   // Host is deliberately canonical: never use a supplied Origin/Host for private links.
   const url=`https://motorgeeks.co.uk/seller/${deliveryToken(id)}`;
   const response=await sendEmail({key,from,to:claimed.email,idempotencyKey:`mg-seller-${id}`,subject:'Your MotorGeeks motorcycle profile',heading:'Your motorcycle profile has been saved',copy:'Use the secure link below to open your profile, manage photos and review dealer offers. This private link expires in one hour; you can request a replacement without submitting again.',action:'Open my secure profile',url});
   const body=await response.json().catch(()=>({}));
   if(response.ok&&typeof body.id==='string'){status='accepted';providerId=body.id;}
   else {status='failed';error=`Provider rejected request (${response.status}).`;}
  }catch{status='unknown';error='Provider acceptance could not be confirmed. Retry uses the same delivery key.';}
 }else error='Email provider configuration unavailable.';
 await sellerRpc('mg_delivery',{p_id:id,p_action:'finish',p_data:{attemptId,status,providerId,error}});
 return status;
}

export async function sendOfferAcceptedNotifications(websiteLeadId:number,offerId:string){
 const db=getSupabaseAdmin();
 const [leadResult,offerResult]=await Promise.all([
  db.from('website_leads').select('email,reg,make,model').eq('id',websiteLeadId).maybeSingle(),
  db.from('dealer_offers').select('id,dealer_account_id,amount_pence').eq('id',offerId).eq('website_lead_id',websiteLeadId).eq('status','accepted').maybeSingle(),
 ]);
 if(leadResult.error||offerResult.error||!leadResult.data||!offerResult.data)return;
 const key=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL||process.env.MOTORGEEKS_RESEND_FROM;
 if(!key||!from)return;
 const motorcycle=[leadResult.data.make,leadResult.data.model].filter(Boolean).join(' ')||leadResult.data.reg||'motorcycle';
 const amount=(Number(offerResult.data.amount_pence)/100).toLocaleString('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0});
 if(leadResult.data.email)await sendEmail({key,from,to:leadResult.data.email,idempotencyKey:`mg-offer-accepted-seller-${offerId}`,subject:`Your MotorGeeks offer has been accepted`,heading:'Your offer is accepted',copy:`You accepted the ${amount} offer for ${motorcycle}. The selected dealer can now contact you to confirm the motorcycle, payment and handover arrangements.`,action:'Open my profile',url:'https://motorgeeks.co.uk/seller'}).catch(()=>undefined);
 const users=await db.from('dealer_portal_users').select('user_id').eq('dealer_account_id',offerResult.data.dealer_account_id).eq('active',true);
 if(users.error||!users.data?.length)return;
 const wanted=new Set(users.data.map(row=>String(row.user_id)));
 const recipients=new Map<string,string>();
 for(let page=1;page<=10&&recipients.size<wanted.size;page+=1){
  const listed=await db.auth.admin.listUsers({page,perPage:1000});if(listed.error)break;
  for(const user of listed.data.users)if(wanted.has(user.id)&&user.email)recipients.set(user.id,user.email);
  if(listed.data.users.length<1000)break;
 }
 await Promise.all([...recipients].map(([userId,email])=>sendEmail({key,from,to:email,idempotencyKey:`mg-offer-won-${offerId}-${userId}`,subject:`Your MotorGeeks offer has been accepted`,heading:'Your offer has been accepted',copy:`The seller accepted your ${amount} offer for ${motorcycle}. Sign in to the Dealer Portal to view the active lead and the customer details now available at this lifecycle point.`,action:'Open Active Leads',url:'https://portal.motorgeeks.co.uk/dealer-portal/active'}).catch(()=>undefined)));
}

export async function sendNewOfferNotification(websiteLeadId:number,offerId:string){
 const db=getSupabaseAdmin();
 const [leadResult,offerResult]=await Promise.all([
  db.from('website_leads').select('email,reg,make,model').eq('id',websiteLeadId).eq('opportunity_mode','marketplace_offer').maybeSingle(),
  db.from('dealer_offers').select('id,amount_pence,status').eq('id',offerId).eq('website_lead_id',websiteLeadId).in('status',['submitted','viewed']).maybeSingle(),
 ]);
 if(leadResult.error||offerResult.error||!leadResult.data?.email||!offerResult.data)return {status:'skipped'};
 const key=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL||process.env.MOTORGEEKS_RESEND_FROM;
 if(!key||!from)return {status:'not_configured'};
 const motorcycle=[leadResult.data.make,leadResult.data.model].filter(Boolean).join(' ')||leadResult.data.reg||'your motorcycle';
 const amount=(Number(offerResult.data.amount_pence)/100).toLocaleString('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0});
 const response=await sendEmail({key,from,to:leadResult.data.email,idempotencyKey:`mg-offer-received-${offerId}`,subject:`New MotorGeeks offer for ${motorcycle}`,heading:'You have a new dealer offer',copy:`${amount} has been offered for ${motorcycle}. Sign in to your secure profile to review the offer and any seller-visible note.`,action:'Review my offer',url:'https://motorgeeks.co.uk/seller'});
 const provider=await response.json().catch(()=>({}));
 return response.ok?{status:'accepted',providerId:typeof provider.id==='string'?provider.id:undefined}:{status:'failed'};
}

async function sendEmail(input:{key:string;from:string;to:string;idempotencyKey:string;subject:string;heading:string;copy:string;action:string;url:string}){
 return fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${input.key}`,'Content-Type':'application/json','Idempotency-Key':input.idempotencyKey},body:JSON.stringify({from:input.from,to:[input.to],...(process.env.MOTORGEEKS_REPLY_TO?{reply_to:process.env.MOTORGEEKS_REPLY_TO}:{}),subject:input.subject,html:emailHtml(input.heading,input.copy,input.action,input.url)})});
}

function emailHtml(heading:string,copy:string,action:string,url:string){
 return `<div style="margin:0;background:#f4f8fc;padding:24px;font-family:Arial,sans-serif;color:#061b32"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #dbe6ef;border-radius:8px;overflow:hidden"><div style="background:#061b32;color:#fff;padding:24px 28px"><div style="font-size:28px;font-weight:900">Motor<span style="color:#0589ee">Geeks</span></div><div style="margin-top:8px;color:#d7e6f5;font-size:11px;font-weight:800;letter-spacing:.12em">CONNECTING SELLERS WITH TRUSTED DEALERS.</div></div><div style="padding:28px"><h1 style="margin:0 0 12px;font-size:24px">${escapeHtml(heading)}</h1><p style="margin:0;color:#30455f;line-height:1.6">${escapeHtml(copy)}</p><p style="margin:24px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0589ee;color:#fff;padding:13px 20px;border-radius:6px;text-decoration:none;font-weight:800">${escapeHtml(action)}</a></p></div></div></div>`;
}

function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]||char));}

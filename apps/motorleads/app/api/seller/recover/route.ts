import { after } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../../lib/supabase-server';
import { tokenHash } from '../../../lib/secure-token';
import { deliveryToken,limitSeller,readSellerJson,sameOrigin,sellerFailure,sellerRpc } from '../../../lib/seller-security';
import { sendSellerDelivery } from '../../../lib/seller-delivery';
export async function POST(request:Request){try{
 sameOrigin(request);const body=await readSellerJson(request);const email=String(body.email||'').trim().toLowerCase().slice(0,180);await limitSeller('replacement-link',5,3600,email);
 const message='If that email has a saved MotorGeeks profile, a secure link will be sent.';
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return Response.json({message});
 const {data,error}=await getSupabaseAdmin().from('website_leads').select('id').eq('email',email).eq('opportunity_mode','marketplace_offer').eq('lead_source','motorgeeks').order('submitted_at',{ascending:false}).limit(5);if(error)throw new Error('Recovery unavailable');
 const ids:string[]=[];for(const row of data||[]){const id=randomUUID();const created=await sellerRpc('mg_issue_link',{p_lead:row.id,p_email:email,p_delivery:id,p_hash:tokenHash(deliveryToken(id))});if(created)ids.push(id);}
 // Durable records survive an interrupted after-response attempt; maintenance can retry.
 after(async()=>{for(const id of ids){try{await sendSellerDelivery(id);}catch{/* Remains retryable. */}}});return Response.json({message});
 }catch(e){return sellerFailure(e);}}

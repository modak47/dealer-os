import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { createToken, tokenHash } from "./secure-token";
import { getSupabaseAdmin } from "./supabase-server";
import { sellerInput, sellerValidation, type SellerForm } from "./seller-input";
import { deliveryToken, limitSeller, SellerError, sellerRpc } from "./seller-security";
import { sendOfferAcceptedNotifications, sendSellerDelivery } from "./seller-delivery";
export const draftCookie="mg_valuation_draft";
export const sellerSessionCookie="mg_seller_session";
export const pendingLinkCookie="mg_pending_seller_link";
export const photoBucket="motorgeeks-seller-photos";
export type DraftPayload=SellerForm;
export async function setSellerSession(token:string){(await cookies()).set(sellerSessionCookie,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:7*86400});}
export async function ensureDraft(){
 const jar=await cookies(); const existing=jar.get(draftCookie)?.value;
 if(existing){try{return {token:existing,draft:await sellerRpc('mg_draft_operation',{p_hash:tokenHash(existing),p_action:'read'})};}catch(e){if(!(e instanceof SellerError)||e.status!==401)throw e;}}
 await limitSeller('draft-create',12);
 const token=createToken();const draft=await sellerRpc('mg_draft_operation',{p_hash:tokenHash(token),p_action:'create'});
 jar.set(draftCookie,token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:30*86400});return {token,draft};
}
export async function saveDraft(input:SellerForm){
 const {token}=await ensureDraft();return sellerRpc('mg_draft_operation',{p_hash:tokenHash(token),p_action:'save',p_data:sellerInput(input)});
}
export async function submitDraft(input:SellerForm){
 const {token,draft}=await ensureDraft();
 const clean=sellerInput(input),errors=sellerValidation(clean);
 if(!draft.website_lead_id&&errors.length)return {ok:false as const,errors};
 const deliveryId=randomUUID(),session=createToken();
 const result=await sellerRpc('mg_draft_operation',{p_hash:tokenHash(token),p_action:'submit',p_data:{...clean,deliveryId,linkHash:tokenHash(deliveryToken(deliveryId)),sessionHash:tokenHash(session)}});
 await setSellerSession(session);
 let emailStatus='unknown';try{emailStatus=await sendSellerDelivery(result.deliveryId);}catch{/* The profile/session are durable; recovery remains available. */}
 return {ok:true as const,...result,emailStatus};
}
export async function photoIdentity(sellerArea=false){const jar=await cookies();const value=jar.get(sellerArea?sellerSessionCookie:draftCookie)?.value;if(!value)throw new SellerError('Your secure access has expired.',401);return tokenHash(value);}
export async function sellerLeadFromSession() {
  const jar = await cookies();
  const token = jar.get(sellerSessionCookie)?.value;
  if (!token) return null;
  const { data: access, error } = await getSupabaseAdmin()
    .from("seller_access_tokens")
    .select("website_lead_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash(token))
    .eq("purpose", "seller_session")
    .gt("expires_at", new Date().toISOString())
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new SellerError("Your profile could not be loaded. Please retry.",503);
  if (!access) return null;
  const db = getSupabaseAdmin();
  const [lead, photos, offers] = await Promise.all([
    db.from("website_leads").select("*").eq("id", access.website_lead_id).maybeSingle(),
    db.from("lead_photos").select("id").eq("website_lead_id", access.website_lead_id).eq("status", "uploaded").order("sort_order"),
    db.from("dealer_offers").select("id,amount_pence,note,status,submitted_at,revised_at,dealer:dealer_portal_accounts(trading_name)").eq("website_lead_id", access.website_lead_id).in("status", ["submitted", "viewed", "accepted"]).order("submitted_at", { ascending: false }),
  ]);
  if (lead.error || photos.error || offers.error) throw new SellerError("Your profile could not be loaded. Please retry.",503);
  if (!lead.data) return null;
  return { lead: lead.data, photos: photos.data ?? [], offers: offers.data ?? [] };
}

export async function verifySellerMagicToken(token:string){
 const sessionToken=createToken();await sellerRpc('mg_consume_link',{p_hash:tokenHash(token),p_session_hash:tokenHash(sessionToken)});await setSellerSession(sessionToken);return true;
}
export async function acceptSellerOffer(offerId:string){
 const context=await sellerLeadFromSession();if(!context)return {ok:false as const,status:401,error:'Your secure seller session has expired.'};
 const {data,error}=await getSupabaseAdmin().rpc('seller_accept_marketplace_offer',{p_website_lead_id:context.lead.id,p_offer_id:offerId});
 if(error)return {ok:false as const,status:409,error:error.message};
 await sendOfferAcceptedNotifications(Number(context.lead.id),offerId).catch(()=>undefined);
 return {ok:true as const,offer:data};
}

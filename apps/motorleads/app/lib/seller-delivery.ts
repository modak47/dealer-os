import "server-only";
import { randomUUID } from "node:crypto";
import { deliveryToken, sellerRpc } from "./seller-security";
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
   const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`mg-seller-${id}`},body:JSON.stringify({from,to:[claimed.email],...(process.env.MOTORGEEKS_REPLY_TO?{reply_to:process.env.MOTORGEEKS_REPLY_TO}:{}),subject:'Your MotorGeeks motorcycle profile',html:`<p>Your motorcycle profile has been saved.</p><p><a href="${url}">Open your secure profile</a></p><p>This private link expires in one hour. Open it and choose Continue to sign in. You can request another link without submitting again.</p>`})});
   const body=await response.json().catch(()=>({}));
   if(response.ok&&typeof body.id==='string'){status='accepted';providerId=body.id;}
   else {status='failed';error=`Provider rejected request (${response.status}).`;}
  }catch{status='unknown';error='Provider acceptance could not be confirmed. Retry uses the same delivery key.';}
 }else error='Email provider configuration unavailable.';
 await sellerRpc('mg_delivery',{p_id:id,p_action:'finish',p_data:{attemptId,status,providerId,error}});
 return status;
}

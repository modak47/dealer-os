import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "./supabase-server";
export class SellerError extends Error { constructor(message:string,public status=400){super(message);} }
export async function sellerRpc(name:string,args:Record<string,unknown>){
 const {data,error}=await getSupabaseAdmin().rpc(name,args);
 if(error)throw new SellerError(['42501','PT409','22023'].includes(error.code)?error.message:'Unable to save securely. Please try again.',error.code==='42501'?401:error.code==='PT409'?409:error.code==='22023'?400:503);
 return data;
}
export function privateDigest(value:string){
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret)throw new SellerError('Secure access is temporarily unavailable.',503);
 return createHmac('sha256',secret).update('motorgeeks-seller-v1:'+value).digest('hex');
}
export function deliveryToken(id:string){return privateDigest('link:'+id);}
export async function limitSeller(action:string,limit:number,seconds=3600,identity?:string){
 const h=await headers();
 // Vercel supplies this header itself. Missing trusted proxy metadata shares a conservative bucket.
 const ip=process.env.VERCEL?h.get('x-vercel-forwarded-for')||'unknown':h.get('x-real-ip')||'local';
 if(!await sellerRpc('mg_rate_limit',{p_key:privateDigest(action+':ip:'+ip),p_limit:limit,p_seconds:seconds}))throw new SellerError('Too many requests. Please try again later.',429);
 if(identity&&!await sellerRpc('mg_rate_limit',{p_key:privateDigest(action+':identity:'+identity),p_limit:limit,p_seconds:seconds}))throw new SellerError('Too many requests. Please try again later.',429);
}
export function sameOrigin(request:Request){
 const origin=request.headers.get('origin');
 const expected=process.env.NODE_ENV==='production'?'https://motorgeeks.co.uk':new URL(request.url).origin;
 if(!origin||![expected,...(process.env.NODE_ENV==='production'?['https://www.motorgeeks.co.uk']:[])].includes(origin))throw new SellerError('Request origin is not permitted.',403);
}
export async function readSellerJson(request:Request){
 if(Number(request.headers.get('content-length'))>24000)throw new SellerError('Answers too large.',413);
 const reader=request.body?.getReader();if(!reader)throw new SellerError('Invalid request.');
 const parts:Uint8Array[]=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>24000){await reader.cancel();throw new SellerError('Answers too large.',413);}parts.push(value);}
 const body=Buffer.concat(parts).toString('utf8');
 try{return JSON.parse(body);}catch{throw new SellerError('Invalid request.');}
}
export function sellerFailure(error:unknown){return Response.json({error:error instanceof SellerError?error.message:'Unable to complete this securely. Please try again.'},{status:error instanceof SellerError?error.status:503});}

import { NextResponse } from 'next/server';
import { pendingLinkCookie } from '../../lib/marketplace';
// GET/HEAD previews never consume a token or create a database session.
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){const {token}=await params;const valid=/^(?:[a-f0-9]{64}|[A-Za-z0-9_-]{43})$/i.test(token);const response=NextResponse.redirect(new URL(valid?'/seller/verify':'/seller/invalid',request.url));response.headers.set('Referrer-Policy','no-referrer');response.headers.set('Cache-Control','no-store');response.headers.set('X-Robots-Tag','noindex, nofollow');if(valid)response.cookies.set(pendingLinkCookie,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:900});return response;}

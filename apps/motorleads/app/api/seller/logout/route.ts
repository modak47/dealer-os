import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { draftCookie,pendingLinkCookie,sellerSessionCookie } from '../../../lib/marketplace';
import { tokenHash } from '../../../lib/secure-token';
import { sameOrigin,sellerRpc,sellerFailure } from '../../../lib/seller-security';
export async function POST(request:Request){try{sameOrigin(request);const jar=await cookies();const token=jar.get(sellerSessionCookie)?.value;if(token)await sellerRpc('mg_logout',{p_hash:tokenHash(token)});for(const name of [sellerSessionCookie,draftCookie,pendingLinkCookie])jar.delete(name);return NextResponse.redirect(new URL('/seller/recover',request.url),303);}catch(e){return sellerFailure(e);}}

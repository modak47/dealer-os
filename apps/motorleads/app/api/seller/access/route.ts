import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { pendingLinkCookie, verifySellerMagicToken } from '../../../lib/marketplace';
import { limitSeller,sameOrigin } from '../../../lib/seller-security';
export async function POST(request:Request){const jar=await cookies();try{sameOrigin(request);await limitSeller('verify-link',20);const token=jar.get(pendingLinkCookie)?.value;if(!token)throw new Error('Missing link');await verifySellerMagicToken(token);jar.delete(pendingLinkCookie);return NextResponse.redirect(new URL('/seller',request.url),303);}catch{jar.delete(pendingLinkCookie);return NextResponse.redirect(new URL('/seller/invalid',request.url),303);}}

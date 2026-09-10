import { NextResponse } from "next/server";
import { sellerSessionCookie, verifySellerMagicToken } from "../../lib/marketplace";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await verifySellerMagicToken(token);
  if (!session) return NextResponse.redirect(new URL("/seller/invalid", _request.url));
  const response = NextResponse.redirect(new URL("/seller", _request.url));
  response.cookies.set(sellerSessionCookie, session.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expires,
  });
  return response;
}

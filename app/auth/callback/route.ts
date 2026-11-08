import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeAuthNext } from "@/lib/dealer-auth-navigation";

export async function GET(request: NextRequest) {
  const next = safeAuthNext(request.nextUrl.searchParams.get("next"));
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const result = await supabase?.auth.exchangeCodeForSession(code);
    if (!result || result.error) {
      const login = new URL(next.startsWith("/dealer-portal") ? "/dealer-login" : "/admin", request.url);
      login.searchParams.set("error", "link_expired");
      return NextResponse.redirect(login);
    }
  }
  return NextResponse.redirect(new URL(next, request.url));
}

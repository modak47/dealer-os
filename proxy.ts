import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

const protectedApiPaths=new Set(["/api/vrm-lookup","/api/hpi-test"]);

export async function proxy(request:NextRequest){
  const pathname=request.nextUrl.pathname;
  const isLogin=pathname==="/admin";
  const isAdmin=pathname.startsWith("/admin/");
  const isProtectedApi=protectedApiPaths.has(pathname);
  if(!isLogin&&!isAdmin&&!isProtectedApi)return NextResponse.next();

  if(!isSupabaseConfigured){
    if(isProtectedApi)return NextResponse.json({error:"DealerOS authentication is not configured."},{status:503});
    if(isAdmin)return NextResponse.redirect(new URL("/admin?setup=required",request.url));
    return NextResponse.next();
  }

  let response=NextResponse.next({request});
  const supabase=createServerClient(supabaseUrl,supabaseAnonKey,{cookies:{
    getAll(){return request.cookies.getAll()},
    setAll(cookiesToSet){cookiesToSet.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});cookiesToSet.forEach(({name,value,options})=>response.cookies.set(name,value,options))},
  }});
  const {data:{user}}=await supabase.auth.getUser();

  if(!user&&(isAdmin||isProtectedApi)){
    if(isProtectedApi)return NextResponse.json({error:"Authentication required."},{status:401});
    const loginUrl=new URL("/admin",request.url);loginUrl.searchParams.set("next",pathname+request.nextUrl.search);return NextResponse.redirect(loginUrl);
  }
  if(user&&isLogin)return NextResponse.redirect(new URL("/admin/dashboard",request.url));
  return response;
}

export const config={matcher:["/admin/:path*","/api/vrm-lookup","/api/hpi-test"]};

import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "./config";

export async function createClient(){
  if(!supabaseUrl||!supabaseAnonKey)return null;
  const cookieStore=await cookies();
  return createServerClient(supabaseUrl,supabaseAnonKey,{cookies:{
    getAll(){return cookieStore.getAll()},
    setAll(cookiesToSet){try{cookiesToSet.forEach(({name,value,options})=>cookieStore.set(name,value,options))}catch{/* Proxy refreshes cookies for Server Components. */}},
  }});
}

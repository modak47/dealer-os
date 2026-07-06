import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./config";

export function createClient(){
  if(!supabaseUrl||!supabaseAnonKey)throw new Error("Supabase authentication is not configured.");
  return createBrowserClient(supabaseUrl,supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
}

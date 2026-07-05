import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

let adminClient:SupabaseClient|null=null;

export function getSupabaseAdmin():SupabaseClient{
  if(adminClient)return adminClient;
  const serviceRoleKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!supabaseUrl||!serviceRoleKey)throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for DealerOS operations modules.");
  adminClient=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
  return adminClient;
}

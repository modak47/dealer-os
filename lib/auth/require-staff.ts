import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isInternalStaffMembership } from "@/lib/auth/staff-policy";

export async function requireStaffUser(){
  const supabase=await createClient();
  if(!supabase)return null;
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return null;
  const {data,error}=await supabase.from("dealer_users").select("id,role,active").eq("id",user.id).eq("active",true).maybeSingle();
  if(error||!data)return null;
  if(!isInternalStaffMembership(data))return null;
  return user;
}

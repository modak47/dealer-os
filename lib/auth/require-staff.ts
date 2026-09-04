import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function requireStaffUser(){
  const supabase=await createClient();
  if(!supabase)return null;
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return null;
  const {data,error}=await supabase.from("dealer_users").select("id,role").eq("id",user.id).eq("active",true).maybeSingle();
  if(error||!data)return null;
  if(["dealer_admin","dealer_user"].includes(String(data.role)))return null;
  return user;
}

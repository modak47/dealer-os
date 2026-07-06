import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface AdminIdentity {
  name:string;
  firstName:string;
  email:string;
  role:string;
  initials:string;
}

const clean=(value:unknown)=>typeof value==="string"?value.trim():"";
const titleCase=(value:string)=>value.split(/[._\-\s]+/).filter(Boolean).map(part=>part.charAt(0).toUpperCase()+part.slice(1).toLowerCase()).join(" ");

export async function getAdminIdentity():Promise<AdminIdentity|null>{
  const supabase=await createClient();
  if(!supabase)return null;
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return null;
  const metadata=user.user_metadata??{};
  const email=user.email??"";
  const metadataName=clean(metadata.full_name)||clean(metadata.name)||clean(metadata.display_name);
  const combinedName=[clean(metadata.first_name),clean(metadata.last_name)].filter(Boolean).join(" ");
  const name=metadataName||combinedName||titleCase(email.split("@")[0]||"Team Member");
  const role=clean(metadata.role)||clean(user.app_metadata?.role)||"Team member";
  const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join("")||"YM";
  return {name,firstName:name.split(/\s+/)[0]||name,email,role,initials};
}

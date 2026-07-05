import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(){const {data,error}=await getSupabaseAdmin().from("retail_checks").select("*").order("id",{ascending:false});if(error)return Response.json({error:error.message},{status:500});return Response.json((data??[]).map(record=>({...record,createdTime:record.created_at})))}

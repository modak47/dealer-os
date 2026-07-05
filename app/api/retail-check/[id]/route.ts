import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const {data,error}=await getSupabaseAdmin().from("retail_checks").select("*").eq("id",id).single();if(error)return Response.json({error:error.message},{status:404});return Response.json({...data,createdTime:data.created_at})}

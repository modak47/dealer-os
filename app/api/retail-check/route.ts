import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request:Request){
  const body=await request.json();
  const {data,error}=await getSupabaseAdmin().from("retail_checks").insert([{Registration:body.registration,Make:body.make,Model:body.model,Year:String(body.year),Mileage:String(body.mileage),"Asking Price":String(body.askingPrice),Status:"Pending"}]).select().single();
  if(error){console.error(error);return Response.json({error:error.message},{status:500})}
  return Response.json({recordId:data.id});
}

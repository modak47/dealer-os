import { createRetailCheck } from "@/lib/retail-checks";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request:Request){
  try{
    const body=await request.json();
    const data=await createRetailCheck({registration:body.registration,make:body.make,model:body.model,year:body.year,mileage:body.mileage,askingPrice:body.askingPrice,requestId:body.requestId});
    if(body.leadId){
      await getSupabaseAdmin().from("website_leads").update({retail_check_id:String(data.id),valuation_status:"processing",valuation_started_at:new Date().toISOString(),valuation_error:null,updated_at:new Date().toISOString()}).eq("id",body.leadId);
    }
    return Response.json({recordId:data.id,requestId:data["Request ID"],record:data});
  }catch(error){
    console.error(error);
    return Response.json({error:error instanceof Error?error.message:"Unable to create Retail Check"},{status:500});
  }
}

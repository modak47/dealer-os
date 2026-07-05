import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const editableFields=new Set(["registration","make","model","variant","year","mileage","colour","engine_cc","vin","status","location","notes","primary_image_url","price","vat_status","pricing","description","service_history","features"]);
const numericFields=new Set(["year","mileage","engine_cc","price"]);
const jsonFields=new Set(["pricing","features"]);

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const {data,error}=await getSupabaseAdmin().from("stock_bikes").select("*").eq("id",id).maybeSingle();
  if(error){console.error("Unable to load stock bike",error);return NextResponse.json({error:"Unable to load stock bike."},{status:500})}
  if(!data)return NextResponse.json({error:"Stock bike not found."},{status:404});
  return NextResponse.json({stock:data});
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const body=await request.json() as Record<string,unknown>;
    const updates:Record<string,unknown>={};
    for(const [key,value] of Object.entries(body)){
      if(!editableFields.has(key))continue;
      if(numericFields.has(key)){updates[key]=value===""||value===null?null:Number(value);if(updates[key]!==null&&!Number.isFinite(updates[key] as number))return NextResponse.json({error:`${key} must be a valid number.`},{status:400});continue}
      if(jsonFields.has(key)){if(key==="features"&&!Array.isArray(value))return NextResponse.json({error:"Features must be an array."},{status:400});if(key==="pricing"&&(typeof value!=="object"||value===null||Array.isArray(value)))return NextResponse.json({error:"Pricing must be an object."},{status:400});updates[key]=value;continue}
      updates[key]=typeof value==="string"?(value.trim()||null):value;
    }
    if(Object.keys(updates).length===0)return NextResponse.json({error:"No editable fields supplied."},{status:400});
    const {data,error}=await getSupabaseAdmin().from("stock_bikes").update(updates).eq("id",id).select("*").maybeSingle();
    if(error){console.error("Unable to update stock bike",error);return NextResponse.json({error:"Unable to update stock bike."},{status:500})}
    if(!data)return NextResponse.json({error:"Stock bike not found."},{status:404});
    return NextResponse.json({stock:data});
  }catch(error){console.error("Invalid stock update request",error);return NextResponse.json({error:"Invalid stock data."},{status:400})}
}

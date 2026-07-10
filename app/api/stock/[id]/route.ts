import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSupabaseStockBike } from "@/lib/supabase-stock";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import { sanitiseStockPayload } from "@/lib/stock-payload";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const {data,error}=await getSupabaseAdmin().from("stock_bikes").select("*").eq("id",id).maybeSingle();
  if(error){console.error("Unable to load stock bike",error);return NextResponse.json({error:"Unable to load stock bike."},{status:500})}
  if(!data)return NextResponse.json({error:"Stock bike not found."},{status:404});
  return NextResponse.json({stock:normalizeSupabaseStockBike(data as SupabaseStockBike)});
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const body=await request.json() as Record<string,unknown>;
    const updates=sanitiseStockPayload(body);
    if(Object.keys(updates).length===0)return NextResponse.json({error:"No editable fields supplied."},{status:400});
    if("status" in updates){const current=await getSupabaseAdmin().from("stock_bikes").select("status").eq("id",id).maybeSingle();if(current.error)return NextResponse.json({error:"Unable to validate stock status transition."},{status:500});if(current.data?.status==="Purchase Pending"&&["Sold","Sale Completed","Reserved"].includes(String(updates.status)))return NextResponse.json({error:"Purchase Pending bikes must be confirmed arrived before they can be reserved or sold."},{status:400});if(updates.status==="Purchase Pending"){updates.show_on_website=false;updates.reserve_enabled=false;}}
    const {data,error}=await getSupabaseAdmin().from("stock_bikes").update(updates).eq("id",id).select("*").maybeSingle();
    if(error){console.error("Unable to update stock bike",error);const migrationMissing=/column|schema cache|advert_sections|show_on_website|reservation_amount/i.test(`${error.message} ${error.details??""}`);return NextResponse.json({error:migrationMissing?"Stock advert migration is not installed. Run 20260705000300_stock_advert_builder.sql in Supabase, then try again.":`Unable to update stock bike: ${error.message}`},{status:500})}
    if(!data)return NextResponse.json({error:"Stock bike not found."},{status:404});
    return NextResponse.json({stock:normalizeSupabaseStockBike(data as SupabaseStockBike)});
  }catch(error){console.error("Invalid stock update request",error);return NextResponse.json({error:"Invalid stock data."},{status:400})}
}

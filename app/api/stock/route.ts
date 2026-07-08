import { NextResponse } from "next/server";
import type { StockApiResponse } from "@/lib/stock-bike-types";
import { getSupabaseStockBikes } from "@/lib/supabase-stock";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSupabaseStockBike } from "@/lib/supabase-stock";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import { sanitiseStockPayload } from "@/lib/stock-payload";
import {advertDefaults,getAdvertTemplateSettings} from "@/lib/advert-template-settings";

export async function GET(){
  const result=await getSupabaseStockBikes();
  return NextResponse.json<StockApiResponse>(result,{status:result.error&&result.configured?500:200});
}

export async function POST(request:Request){
  try{
    const body=await request.json() as Record<string,unknown>;
    const make=cleanText(body.make);const model=cleanText(body.model);
    if(!make||!model)return NextResponse.json({error:"Make and model are required."},{status:400});
    const settings=await getAdvertTemplateSettings(),sanitised=sanitiseStockPayload(body),suppliedSections=sanitised.advert_sections&&typeof sanitised.advert_sections==="object"?sanitised.advert_sections as Record<string,unknown>:{};const suppliedImages=Array.isArray(sanitised.image_urls)?sanitised.image_urls as string[]:[];const placeholders=settings.placeholderImages.filter(image=>image.enabled).sort((a,b)=>a.display_order-b.display_order).map(image=>image.image_url);const images=suppliedImages.length?suppliedImages:placeholders;const payload={...sanitised,make,model,status:cleanText(body.status)||"In Stock",advert_sections:{...advertDefaults(settings.templates),...suppliedSections},image_urls:images,primary_image_url:images[0]??null};
    const {data,error}=await getSupabaseAdmin().from("stock_bikes").insert(payload).select("*").single();
    if(error){console.error("Unable to create stock bike",error);return NextResponse.json({error:"Unable to create stock bike."},{status:500})}
    return NextResponse.json({stock:normalizeSupabaseStockBike(data as SupabaseStockBike)},{status:201});
  }catch(error){console.error("Invalid stock create request",error);return NextResponse.json({error:"Invalid stock data."},{status:400})}
}

function cleanText(value:unknown){if(typeof value!=="string")return null;const cleaned=value.trim();return cleaned||null}

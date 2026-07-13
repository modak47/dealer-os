import { NextResponse } from "next/server";
import type { StockApiResponse } from "@/lib/stock-bike-types";
import { getSupabaseStockBikes } from "@/lib/supabase-stock";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSupabaseStockBike } from "@/lib/supabase-stock";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import { sanitiseStockPayload } from "@/lib/stock-payload";
import {getAdvertTemplateSettings} from "@/lib/advert-template-settings";
import { createAdvertSectionsFromTemplates } from "@/lib/advert-sections";
import { getDealerSettings } from "@/lib/dealer-settings";

export async function GET(){
  const result=await getSupabaseStockBikes();
  return NextResponse.json<StockApiResponse>(result,{status:result.error&&result.configured?500:200});
}

export async function POST(request:Request){
  try{
    const body=await request.json() as Record<string,unknown>;
    const make=cleanText(body.make);const model=cleanText(body.model);
    if(!make||!model)return NextResponse.json({error:"Make and model are required."},{status:400});
    const [settings,dealer]=await Promise.all([getAdvertTemplateSettings(),getDealerSettings()]),sanitised=sanitiseStockPayload(body),suppliedSections=sanitised.advert_sections&&typeof sanitised.advert_sections==="object"?sanitised.advert_sections as Record<string,unknown>:{};const suppliedImages=Array.isArray(sanitised.image_urls)?sanitised.image_urls as string[]:[];const placeholders=settings.placeholderImages.filter(image=>image.enabled).sort((a,b)=>a.display_order-b.display_order).map(image=>image.image_url);const images=suppliedImages.length?suppliedImages:placeholders;const status=cleanText(body.status)||"In Stock";const pending=status==="Purchase Pending";const draftBike={...sanitised,make,model,dealer_name:dealer.business_name,phone:dealer.website_contact_phone||dealer.phone,reservation_amount:Number(sanitised.reservation_amount??dealer.reservation_amount)};const payload={...sanitised,make,model,status,show_on_website:pending?false:sanitised.show_on_website,reserve_enabled:pending?false:sanitised.reserve_enabled,advert_sections:createAdvertSectionsFromTemplates(settings.templates,draftBike,suppliedSections),image_urls:images,primary_image_url:images[0]??null};
    const {data,error}=await getSupabaseAdmin().from("stock_bikes").insert(payload).select("*").single();
    if(error){console.error("Unable to create stock bike",error);return NextResponse.json({error:"Unable to create stock bike."},{status:500})}
    if(!pending){const workflow=await getSupabaseAdmin().rpc("stock_workflow_create_defaults",{p_stock_bike_id:String(data.id)});
    if(workflow.error&&!["42883","PGRST202"].includes(workflow.error.code))console.warn("Unable to create default workflow tasks",workflow.error.message);}
    return NextResponse.json({stock:normalizeSupabaseStockBike(data as SupabaseStockBike)},{status:201});
  }catch(error){console.error("Invalid stock create request",error);return NextResponse.json({error:"Invalid stock data."},{status:400})}
}

function cleanText(value:unknown){if(typeof value!=="string")return null;const cleaned=value.trim();return cleaned||null}

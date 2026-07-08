import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import { StockEditor } from "./stock-editor";
import { normalizeSupabaseStockBike } from "@/lib/supabase-stock";
import {getAdvertTemplateSettings} from "@/lib/advert-template-settings";

export const dynamic="force-dynamic";

export default async function StockDetailPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const [{data,error},settings]=await Promise.all([getSupabaseAdmin().from("stock_bikes").select("*").eq("id",id).maybeSingle(),getAdvertTemplateSettings()]);
  if(error)throw new Error("Unable to load stock bike.");
  if(!data)notFound();
  return <StockEditor initialBike={normalizeSupabaseStockBike(data as SupabaseStockBike)} advertTemplates={settings.templates} placeholderImages={settings.placeholderImages.filter(image=>image.enabled).map(image=>image.image_url)}/>;
}

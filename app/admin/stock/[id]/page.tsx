import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import { StockEditor } from "./stock-editor";
import { normalizeSupabaseStockBike } from "@/lib/supabase-stock";
import {getAdvertTemplateSettings} from "@/lib/advert-template-settings";
import { getVehicleWorkspace } from "@/lib/vehicle-workspace";
import { VehicleWorkspace } from "./vehicle-workspace";

export const dynamic="force-dynamic";

export default async function StockDetailPage({params,searchParams}:{params:Promise<{id:string}>;searchParams?:Promise<{edit?:string}>}){
  const {id}=await params;
  const edit=(await searchParams)?.edit==="1";
  const [{data,error},settings]=await Promise.all([getSupabaseAdmin().from("stock_bikes").select("*").eq("id",id).maybeSingle(),getAdvertTemplateSettings()]);
  if(error)throw new Error("Unable to load stock bike.");
  if(!data)notFound();
  const bike=normalizeSupabaseStockBike(data as SupabaseStockBike);
  if(edit)return <StockEditor initialBike={bike} advertTemplates={settings.templates} placeholderImages={settings.placeholderImages.filter(image=>image.enabled).map(image=>image.image_url)}/>;
  const workspace=await getVehicleWorkspace(Number(bike.id));
  return <VehicleWorkspace bike={bike} workspace={workspace}/>;
}

import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import { StockEditor } from "./stock-editor";

export const dynamic="force-dynamic";

export default async function StockDetailPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const {data,error}=await getSupabaseAdmin().from("stock_bikes").select("*").eq("id",id).maybeSingle();
  if(error)throw new Error("Unable to load stock bike.");
  if(!data)notFound();
  return <StockEditor initialBike={data as SupabaseStockBike}/>;
}

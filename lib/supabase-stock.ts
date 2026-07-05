import "server-only";

import type { StockBike } from "@/lib/airtable";
import type { StockApiResponse, SupabaseStockBike } from "@/lib/stock-bike-types";
import { createClient } from "@/lib/supabase/server";

export async function getSupabaseStockBikes():Promise<StockApiResponse>{
  const supabase=await createClient();
  if(!supabase)return {stock:[],configured:false,error:"Supabase is not configured."};
  const {data,error}=await supabase.from("stock_bikes").select("*").order("created_at",{ascending:false});
  if(error){
    console.error("Unable to load Supabase stock",error);
    return {stock:[],configured:true,error:"Unable to load stock."};
  }
  return {stock:(data??[]) as SupabaseStockBike[],configured:true};
}

export function toAdminStockBike(bike:SupabaseStockBike):StockBike{
  const status=bike.status||"Unknown";
  const normalizedStatus=status.trim().toLowerCase().replace(/[_-]+/g," ");
  const images=Array.isArray(bike.image_urls)?bike.image_urls.filter(Boolean):[];
  const primaryImage=bike.primary_image_url||images[0]||"/bike-placeholder.svg";
  return {
    id:bike.id,
    createdTime:bike.created_at,
    registration:bike.registration??"",
    make:bike.make??"",
    model:bike.model??"",
    year:bike.year??0,
    mileage:bike.mileage??0,
    price:bike.price??0,
    purchasePrice:0,
    status,
    workshopStatus:bike.workshop_status??"",
    readyForSale:["in stock","on forecourt","reserved"].includes(normalizedStatus),
    purchaseDate:bike.date_in_stock??"",
    saleDate:bike.sold_date??"",
    profit:0,
    notes:bike.notes??"",
    image:primaryImage,
    imageUrls:images.length?images:[primaryImage],
  };
}

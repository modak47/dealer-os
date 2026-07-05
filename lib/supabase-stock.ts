import "server-only";

import type { StockBike } from "@/lib/airtable";
import type { StockApiResponse, SupabaseStockBike } from "@/lib/stock-bike-types";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

export async function getSupabaseStockBikes():Promise<StockApiResponse>{
  if(!isSupabaseConfigured)return {stock:[],configured:false,error:"Supabase is not configured."};
  const supabase=createClient(supabaseUrl,supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await supabase.from("stock_bikes").select("*").order("created_at",{ascending:false});
  if(error){
    console.error("Unable to load Supabase stock",error);
    return {stock:[],configured:true,error:"Unable to load stock."};
  }
  return {stock:(data??[]).map(row=>normalizeSupabaseStockBike(row as SupabaseStockBike)),configured:true};
}

const cleanText=(value:unknown)=>typeof value==="string"?value.trim():typeof value==="number"?String(value):"";
const empty=(value:unknown)=>value===null||value===undefined||cleanText(value)==="";
const numberValue=(value:unknown)=>{if(typeof value==="number"&&Number.isFinite(value))return value;const parsed=Number(cleanText(value).replace(/[^0-9.-]/g,""));return Number.isFinite(parsed)?parsed:null};

export function normalizeSupabaseStockBike(bike:SupabaseStockBike):SupabaseStockBike{
  const dealer5=bike.dealer5_data&&typeof bike.dealer5_data==="object"?bike.dealer5_data:{};
  const nested=(dealer5 as {fields?:unknown}).fields;
  const fields=nested&&typeof nested==="object"&&!Array.isArray(nested)?nested as Record<string,unknown>:{};
  const field=(...names:string[])=>{for(const name of names){const value=fields[name];if(!empty(value))return value}return null};
  const imageUrls=Array.from(new Set((Array.isArray(bike.image_urls)?bike.image_urls:[]).filter((value):value is string=>typeof value==="string").map(value=>value.trim()).filter(Boolean)));
  const genuineImages=imageUrls.filter(value=>!/awaiting.?preparation|awaiting.?prep|placeholder|coming.?soon|no.?image/i.test(value));
  const displayImages=genuineImages.length?genuineImages:imageUrls;
  const requestedPrimary=cleanText(bike.primary_image_url);
  const primaryIsPreparation=/awaiting.?preparation|awaiting.?prep|placeholder|coming.?soon|no.?image/i.test(requestedPrimary);
  const cd5Image=displayImages.find(value=>/cd5/i.test(value));
  const durableImage=displayImages.find(value=>!/airtableusercontent\.com/i.test(value));
  const primaryImage=(/cd5/i.test(requestedPrimary)&&!primaryIsPreparation?requestedPrimary:cd5Image)||(requestedPrimary&&!primaryIsPreparation&&!/airtableusercontent\.com/i.test(requestedPrimary)?requestedPrimary:durableImage)||(!primaryIsPreparation?requestedPrimary:"")||displayImages[0]||null;
  return {
    ...bike,
    image_urls:displayImages,
    primary_image_url:primaryImage,
    description:empty(bike.description)?cleanText(field("Confirm Spec"))||null:bike.description,
    mot_expiry:empty(bike.mot_expiry)?cleanText(field("MOT Expiry Date"))||null:bike.mot_expiry,
    body_style:empty(bike.body_style)?cleanText(field("Body Type"))||null:bike.body_style,
    fuel:empty(bike.fuel)?cleanText(field("Fuel"))||null:bike.fuel,
    transmission:empty(bike.transmission)?cleanText(field("Transmission"))||null:bike.transmission,
    colour:empty(bike.colour)?cleanText(field("Colour"))||null:bike.colour,
    engine_cc:empty(bike.engine_cc)?numberValue(field("Engine Size")):bike.engine_cc,
    registration_date:cleanText(field("Registration Date"))||null,
    previous_owners:empty(bike.previous_owners)?numberValue(field("Previous Owners")):bike.previous_owners,
    engine_number:cleanText(field("Engine Number"))||null,
    derivative_id:cleanText(field("Derivative ID"))||null,
    display_status:cleanText(field("Display Status"))||null,
    attention_grabber:cleanText(field("Attention Grabber (30 Chars - Autotrader/Website)","Attention Grabber"))||null,
  };
}

export function toAdminStockBike(bike:SupabaseStockBike):StockBike{
  const status=bike.status||"Unknown";
  const normalizedStatus=status.trim().toLowerCase().replace(/[_-]+/g," ");
  const mapped=normalizeSupabaseStockBike(bike);
  const images=mapped.image_urls;
  const primaryImage=mapped.primary_image_url||images[0]||"/bike-placeholder.svg";
  const dealer5Fields=mapped.dealer5_data&&typeof mapped.dealer5_data==="object"&&typeof (mapped.dealer5_data as {fields?:unknown}).fields==="object"?(mapped.dealer5_data as {fields:Record<string,unknown>}).fields:{};
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
    imageUrls:Array.from(new Set([primaryImage,...images])).filter(Boolean),
    description:mapped.description??"",
    colour:mapped.colour??"",
    engineCc:mapped.engine_cc??0,
    motExpiry:mapped.mot_expiry??"",
    registrationDate:mapped.registration_date??"",
    previousOwners:mapped.previous_owners==null?"":String(mapped.previous_owners),
    engineNumber:mapped.engine_number??"",
    derivativeId:mapped.derivative_id??"",
    displayStatus:mapped.display_status??"",
    attentionGrabber:mapped.attention_grabber??"",
    bodyStyle:mapped.body_style??"",
    fuel:mapped.fuel??"",
    transmission:mapped.transmission??"",
    variant:mapped.variant??"",
    category:mapped.category??"",
    specifications:{...(mapped.specifications??{}),BHP:mapped.bhp,Torque:mapped.torque,CO2:mapped.co2,"Road Tax":mapped.road_tax,"Top Speed":mapped.top_speed,Length:mapped.length_mm,Width:mapped.width_mm,Weight:mapped.weight_kg,"Euro Emissions":mapped.euro_emissions,"HPI Category":mapped.hpi_category},
    dealer5Fields,
    advertSections:mapped.advert_sections??{},
  };
}

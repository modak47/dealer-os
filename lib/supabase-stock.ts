import "server-only";

import type { StockBike } from "@/lib/airtable";
import type { StockApiResponse, SupabaseStockBike } from "@/lib/stock-bike-types";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const publicSlug=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const imageKey=(value:string)=>{try{const url=new URL(value);return `${url.origin}${url.pathname}`.toLowerCase()}catch{return value.trim().toLowerCase().split("?")[0]}};
const dedupeImages=(values:string[])=>{const seen=new Set<string>();return values.filter(value=>{const key=imageKey(value);if(!key||seen.has(key))return false;seen.add(key);return true})};
const PUBLIC_DETAIL_FIELDS="id,dealer5_id,registration,make,model,variant,year,mileage,colour,engine_cc,price,status,advert_title,stock_number,category,body_style,fuel,transmission,description,service_history,vat_status,specifications,dealer5_data,image_urls,primary_image_url,mot_expiry,notes,created_at,plate,engine_number,number_of_gears,previous_owners,registration_date,display_status,show_on_website,reserve_enabled,reservation_amount,advert_sections,bhp,torque,co2,road_tax,top_speed,length_mm,width_mm,weight_kg,euro_emissions,hpi_category,workshop_status,date_in_stock,sold_date,mot_status,valeting_status,photo_status,location,updated_at,source_url,dealer5_updated_at";

export async function getSupabaseStockBikeByPublicIdentifier(identifier:string):Promise<{bike:SupabaseStockBike|null;method:string}>{
  if(!isSupabaseConfigured)return {bike:null,method:"supabase-not-configured"};
  const requested=identifier.trim().toLowerCase();let supabase;try{supabase=getSupabaseAdmin()}catch{supabase=createClient(supabaseUrl,supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false}})}
  const index=await supabase.from("stock_bikes").select("id,dealer5_id,registration,make,model,status,price").in("status",["In Stock","ON FORECOURT","Available","Reserved"]);
  if(index.error){console.error("[Public bike lookup] index failed",{requestedSlug:identifier,code:index.error.code});return {bike:null,method:"index-error"}}
  const rows=index.data??[];
  let match=rows.find(row=>publicSlug([row.make,row.model,row.registration].filter(Boolean).join("-"))===requested);let method="exact-slug";
  if(!match){const directId=/^\d+$/.test(requested)?requested:requested.match(/(?:^|-)(\d+)$/)?.[1];if(directId){match=rows.find(row=>String(row.id)===directId||String(row.dealer5_id??"")===directId);method="stock-or-listing-id"}}
  if(!match){const suffix=requested.split("-").at(-1)?.replace(/[^a-z0-9]/g,"")??"";match=rows.find(row=>String(row.registration??"").toLowerCase().replace(/[^a-z0-9]/g,"")===suffix)||rows.find(row=>String(row.dealer5_id??"").toLowerCase()===suffix);method=match?"registration-or-dealer-id":"not-found"}
  if(!match)return {bike:null,method};
  const detail=await supabase.from("stock_bikes").select(PUBLIC_DETAIL_FIELDS).eq("id",match.id).maybeSingle();
  if(detail.error){console.error("[Public bike lookup] detail failed",{requestedSlug:identifier,method,code:detail.error.code});return {bike:null,method:`${method}-detail-error`}}
  return {bike:detail.data?normalizeSupabaseStockBike(detail.data as unknown as SupabaseStockBike):null,method};
}

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

export async function getSupabasePublicStockBikes():Promise<StockApiResponse>{
  if(!isSupabaseConfigured)return {stock:[],configured:false,error:"Supabase is not configured."};
  const supabase=createClient(supabaseUrl,supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const fields="id,dealer5_id,registration,make,model,variant,year,mileage,colour,engine_cc,price,status,category,body_style,fuel,transmission,primary_image_url,created_at,show_on_website,reserve_enabled,reservation_amount";
  const {data,error}=await supabase.from("stock_bikes").select(fields).in("status",["In Stock","ON FORECOURT","Available","Reserved"]).order("created_at",{ascending:false});
  if(error){console.error("Unable to load public Supabase stock",{code:error.code,message:error.message});return {stock:[],configured:true,error:"Unable to load stock."}}
  return {stock:(data??[]).map(row=>normalizeSupabaseStockBike(row as unknown as SupabaseStockBike)),configured:true};
}

const cleanText=(value:unknown)=>typeof value==="string"?value.trim():typeof value==="number"?String(value):"";
const empty=(value:unknown)=>value===null||value===undefined||cleanText(value)==="";
const numberValue=(value:unknown)=>{if(typeof value==="number"&&Number.isFinite(value))return value;const parsed=Number(cleanText(value).replace(/[^0-9.-]/g,""));return Number.isFinite(parsed)?parsed:null};
const internalVariant=(value:unknown)=>{const text=cleanText(value);return !text||/^[a-f0-9]{20,}$/i.test(text)||/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(text)||/derivative|stock.?id|uuid/i.test(text)};

export function normalizeSupabaseStockBike(bike:SupabaseStockBike):SupabaseStockBike{
  const dealer5=bike.dealer5_data&&typeof bike.dealer5_data==="object"?bike.dealer5_data:{};
  const nested=(dealer5 as {fields?:unknown}).fields;
  const fields=nested&&typeof nested==="object"&&!Array.isArray(nested)?nested as Record<string,unknown>:{};
  const field=(...names:string[])=>{for(const name of names){const value=fields[name];if(!empty(value))return value}return null};
  const sourceImages=dedupeImages((Array.isArray(bike.image_urls)?bike.image_urls:[]).filter((value):value is string=>typeof value==="string").map(value=>value.trim()).filter(Boolean));
  const imageUrls=sourceImages;
  const primaryImage=imageUrls[0]||null;
  return {
    ...bike,
    image_urls:imageUrls,
    primary_image_url:primaryImage,
    variant:internalVariant(bike.variant)?cleanText(field("Variant","Trim"))||null:bike.variant,
    description:empty(bike.description)?cleanText(field("Confirm Spec","Advert Description","Full Description","Description"))||null:bike.description,
    mot_expiry:empty(bike.mot_expiry)?cleanText(field("MOT Expiry Date"))||null:bike.mot_expiry,
    body_style:empty(bike.body_style)?cleanText(field("Body Type"))||null:bike.body_style,
    fuel:empty(bike.fuel)?cleanText(field("Fuel"))||null:bike.fuel,
    transmission:empty(bike.transmission)?cleanText(field("Transmission"))||null:bike.transmission,
    colour:empty(bike.colour)?cleanText(field("Colour"))||null:bike.colour,
    engine_cc:empty(bike.engine_cc)?numberValue(field("Engine Size")):bike.engine_cc,
    plate:empty(bike.plate)?cleanText(field("Plate"))||null:bike.plate,
    registration_date:empty(bike.registration_date)?cleanText(field("Registration Date"))||null:bike.registration_date,
    previous_owners:empty(bike.previous_owners)?numberValue(field("Previous Owners")):bike.previous_owners,
    engine_number:empty(bike.engine_number)?cleanText(field("Engine Number"))||null:bike.engine_number,
    number_of_gears:empty(bike.number_of_gears)?numberValue(field("Number of Gears","Gears")):bike.number_of_gears,
    derivative_id:empty(bike.derivative_id)?cleanText(field("Derivative ID"))||null:bike.derivative_id,
    display_status:empty(bike.display_status)?cleanText(field("Display Status"))||null:bike.display_status,
    attention_grabber:empty(bike.attention_grabber)?cleanText(field("Attention Grabber (30 Chars - Autotrader/Website)","Attention Grabber"))||null:bike.attention_grabber,
    bhp:empty(bike.bhp)?numberValue(field("BHP","Max Power","Power")):bike.bhp,
    torque:empty(bike.torque)?cleanText(field("Max Torque","Torque"))||null:bike.torque,
    co2:empty(bike.co2)?cleanText(field("CO2","CO2 Emissions"))||null:bike.co2,
    road_tax:empty(bike.road_tax)?cleanText(field("Road Tax","Tax"))||null:bike.road_tax,
    top_speed:empty(bike.top_speed)?cleanText(field("Top Speed"))||null:bike.top_speed,
    length_mm:empty(bike.length_mm)?numberValue(field("Length")):bike.length_mm,
    width_mm:empty(bike.width_mm)?numberValue(field("Width")):bike.width_mm,
    weight_kg:empty(bike.weight_kg)?numberValue(field("Weight","Kerb Weight","Dry Weight")):bike.weight_kg,
    euro_emissions:empty(bike.euro_emissions)?cleanText(field("Euro Emissions","Euro Status","Emission Class"))||null:bike.euro_emissions,
  };
}

export function toAdminStockBike(bike:SupabaseStockBike):StockBike{
  const status=bike.status||"Unknown";
  const normalizedStatus=status.trim().toLowerCase().replace(/[_-]+/g," ");
  const mapped=normalizeSupabaseStockBike(bike);
  const images=mapped.image_urls;
  const primaryImage=images[0]||"/bike-placeholder.svg";
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

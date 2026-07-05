import "server-only";
import { getAirtableStock, type StockBike } from "@/lib/airtable";
import { bikes as mockBikes } from "@/lib/mock-data";
import { getSupabaseStockBikes, toAdminStockBike } from "@/lib/supabase-stock";

export type { StockBike } from "@/lib/airtable";
export type CustomerStatus="In Stock"|"Reserved";
export interface PublicStockBike {
  id:string; slug:string; createdTime:string; make:string; model:string; year:number; mileage:string; mileageValue:number;
  price:number; status:CustomerStatus; image:string; imageUrls:string[]; monthly:number; description:string;
  colour:string; engineCc:number; motExpiry:string; registrationDate:string; previousOwners:string;
  attentionGrabber:string;
  bodyStyle:string; fuel:string; transmission:string;
  variant:string; category:string;
}
export interface PublicStockDetailBike extends PublicStockBike {specifications:Record<string,unknown>;dealer5Fields:Record<string,unknown>;advertSections:Record<string,unknown>}
export type StockStats={totalStock:number;liveStock:number;reserved:number;sold:number;prep:number;totalRetailValue:number};

export const normaliseStockStatus=(value:string)=>value.trim().toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ");
const PUBLIC_STATUSES=new Set(["in stock","on forecourt","reserved"]);
const ACTIVE_STATUSES=new Set(["in stock","on forecourt","reserved","prep"]);
const SOLD_STATUSES=new Set(["sold","sale completed"]);
export const isSold=(bike:StockBike)=>SOLD_STATUSES.has(normaliseStockStatus(bike.status));
export const isReserved=(bike:StockBike)=>normaliseStockStatus(bike.status)==="reserved";
export const isActive=(bike:StockBike)=>ACTIVE_STATUSES.has(normaliseStockStatus(bike.status));
export const isPublic=(bike:StockBike)=>PUBLIC_STATUSES.has(normaliseStockStatus(bike.status))&&bike.price>0&&Boolean(bike.make.trim())&&Boolean(bike.model.trim());
export const customerStatus=(bike:StockBike):CustomerStatus=>isReserved(bike)?"Reserved":"In Stock";
const slugify=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const text=(value:unknown)=>typeof value==="string"?value.trim():"";
const looksInternal=(value:string)=>!value||/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)||/\b(?:dealer5|derivative|stock[_ -]?id|uuid)\b/i.test(value)||(!/\s/.test(value)&&value.length>22)||value.length>60;
const customerText=(value:unknown,internalValue="")=>{const cleaned=text(value);return cleaned&&cleaned!==internalValue&&!looksInternal(cleaned)?cleaned:""};

function mockStock():StockBike[]{return mockBikes.map((bike,index)=>({
  id:bike.id,createdTime:new Date(Date.UTC(2026,0,mockBikes.length-index)).toISOString(),registration:bike.vrm,
  make:bike.make,model:bike.model,year:bike.year,mileage:Number(bike.mileage.replace(/[^0-9]/g,"")),price:bike.price,
  purchasePrice:0,status:bike.status,workshopStatus:bike.status==="Prep"?"In workshop":"",readyForSale:bike.status!=="Prep",
  purchaseDate:"",saleDate:bike.status==="Sold"?"mock":"",profit:0,notes:"",image:bike.image,imageUrls:[bike.image]
}))}

export async function getAllStockBikes():Promise<StockBike[]>{
  try{const supabase=await getSupabaseStockBikes();if(supabase.stock.length)return supabase.stock.map(toAdminStockBike)}
  catch(error){console.error("Unable to load stock from Supabase; trying fallback stock.",error)}
  try{const stock=await getAirtableStock();return stock?.length?stock:mockStock()}
  catch(error){console.error("Unable to load Motorcycle Stock fallback; using mock stock.",error);return mockStock()}
}

export function toPublicBike(bike:StockBike):PublicStockBike{const images=Array.from(new Set((bike.imageUrls??[]).filter(value=>value&&value!=="/bike-placeholder.svg")));const image=(bike.image&&bike.image!=="/bike-placeholder.svg"?bike.image:images[0])||"/bike-placeholder.svg";const confirmSpec=text(bike.dealer5Fields?.["Confirm Spec"]);const safeVariant=customerText(bike.variant,bike.derivativeId);return{
  id:bike.id,slug:slugify([bike.make,bike.model,bike.registration].filter(Boolean).join("-"))||bike.id,createdTime:bike.createdTime,
  make:customerText(bike.make)||"Unknown",model:customerText(bike.model)||"Motorcycle",year:bike.year,
  mileage:bike.mileage?`${bike.mileage.toLocaleString("en-GB")} miles`:"Mileage unavailable",mileageValue:bike.mileage,
  price:bike.price,status:customerStatus(bike),image,imageUrls:images.length?images:[image],
  monthly:Math.max(0,Math.round(bike.price/53)),description:confirmSpec||bike.description||bike.notes,
  colour:bike.colour??"",engineCc:bike.engineCc??0,motExpiry:bike.motExpiry??"",registrationDate:bike.registrationDate??"",previousOwners:bike.previousOwners??"",
  attentionGrabber:customerText(bike.attentionGrabber),
  bodyStyle:customerText(bike.bodyStyle),fuel:customerText(bike.fuel),transmission:customerText(bike.transmission),variant:safeVariant,category:customerText(bike.category)
}}
export async function getActiveStockBikes():Promise<StockBike[]>{return(await getAllStockBikes()).filter(isActive)}
export async function getPublicStockBikes():Promise<PublicStockBike[]>{return(await getAllStockBikes()).filter(isPublic).map(toPublicBike)}
export async function getSoldStockBikes():Promise<StockBike[]>{return(await getAllStockBikes()).filter(isSold)}
export async function getFeaturedBikes(limit=4):Promise<PublicStockBike[]>{
  const stock=(await getAllStockBikes()).filter(isPublic).sort((a,b)=>Date.parse(b.createdTime||"0")-Date.parse(a.createdTime||"0"));
  return stock.slice(0,limit).map(toPublicBike)
}
export async function getBikeBySlugOrId(value:string):Promise<PublicStockDetailBike|null>{
  const stock=(await getAllStockBikes()).filter(isPublic);
  const bike=stock.find(b=>b.id===value||toPublicBike(b).slug===value);return bike?{...toPublicBike(bike),specifications:bike.specifications??{},dealer5Fields:bike.dealer5Fields??{},advertSections:bike.advertSections??{}}:null
}
export async function getStockStats():Promise<StockStats>{const all=await getAllStockBikes();const active=all.filter(isActive);return{
  totalStock:active.length,liveStock:active.filter(b=>["in stock","on forecourt"].includes(normaliseStockStatus(b.status))).length,
  reserved:active.filter(isReserved).length,sold:all.filter(isSold).length,
  prep:active.filter(b=>normaliseStockStatus(b.status)==="prep").length,
  totalRetailValue:active.reduce((sum,b)=>sum+b.price,0)
}}

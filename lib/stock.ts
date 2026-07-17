import "server-only";
import { getAirtableStock, type StockBike } from "@/lib/airtable";
import { bikes as mockBikes } from "@/lib/mock-data";
import { getSupabasePublicStockBikes, getSupabaseStockBikeByPublicIdentifier, getSupabaseStockBikes, toAdminStockBike } from "@/lib/supabase-stock";

export type { StockBike } from "@/lib/airtable";
export type CustomerStatus="In Stock"|"Reserved";
export interface PublicStockBike {
  id:string; slug:string; createdTime:string; make:string; model:string; year:number; mileage:string; mileageValue:number;
  price:number; status:CustomerStatus; image:string; imageUrls:string[]; monthly:number; description:string;
  photoReady:boolean;
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
const isTestRecord=(bike:StockBike)=>bike.isTestRecord===true;
export const isSold=(bike:StockBike)=>SOLD_STATUSES.has(normaliseStockStatus(bike.status));
export const isReserved=(bike:StockBike)=>normaliseStockStatus(bike.status)==="reserved";
export const isActive=(bike:StockBike)=>ACTIVE_STATUSES.has(normaliseStockStatus(bike.status));
export const isPublic=(bike:StockBike)=>!isTestRecord(bike)&&bike.showOnWebsite!==false&&PUBLIC_STATUSES.has(normaliseStockStatus(bike.status))&&bike.price>0&&Boolean(bike.make.trim())&&Boolean(bike.model.trim());
export const customerStatus=(bike:StockBike):CustomerStatus=>isReserved(bike)?"Reserved":"In Stock";
const slugify=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const text=(value:unknown)=>typeof value==="string"?value.trim():"";
const looksInternal=(value:string)=>!value||/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)||/\b(?:dealer5|derivative|stock[_ -]?id|uuid)\b/i.test(value)||(!/\s/.test(value)&&value.length>22)||value.length>60;
const customerText=(value:unknown,internalValue="")=>{const cleaned=text(value);return cleaned&&cleaned!==internalValue&&!looksInternal(cleaned)?cleaned:""};
const stockPlaceholder="/bike-placeholder.svg";

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

export function toPublicBike(bike:StockBike):PublicStockBike{const fields=bike.dealer5Fields??{};const field=(...names:string[])=>{for(const name of names){const value=text(fields[name]);if(value)return value}return ""};const numeric=(value:unknown,fallback=0)=>{const raw=String(value??"").replace(/[^0-9.-]/g,"");if(!raw)return fallback;const parsed=Number(raw);return Number.isFinite(parsed)?parsed:fallback};const detailedYear=numeric(field("Year of Manufacture","Year"),bike.year);const detailedMileage=numeric(field("Mileage"),bike.mileage);const detailedPrice=numeric(field("Price"),bike.price);const allImages=Array.from(new Set((bike.imageUrls??[]).filter(value=>value&&value!==stockPlaceholder)));const customerImages=allImages.filter(value=>!/awaiting.?preparation|awaiting.?prep|placeholder|coming.?soon|no.?image|finance.banner|warranty.banner|reserve.online/i.test(value));const photoReady=customerImages.length>=6;const images=(photoReady?customerImages:[stockPlaceholder]).concat(stockPlaceholder);const image=images[0]||stockPlaceholder;const confirmSpec=field("Confirm Spec","Advert Description","Full Description","Description");const safeVariant=customerText(bike.variant,bike.derivativeId);return{
  id:bike.id,slug:slugify([bike.make,bike.model,bike.registration].filter(Boolean).join("-"))||bike.id,createdTime:bike.createdTime,
  make:customerText(field("Make")||bike.make)||"Unknown",model:customerText(field("Model")||bike.model)||"Motorcycle",year:detailedYear,
  mileage:detailedMileage?`${detailedMileage.toLocaleString("en-GB")} miles`:"Mileage unavailable",mileageValue:detailedMileage,
  price:detailedPrice,status:customerStatus(bike),image,imageUrls:images.length?images:[image],
  photoReady,
  monthly:Math.max(0,Math.round(detailedPrice/53)),description:confirmSpec||bike.description||bike.notes,
  colour:field("Colour")||bike.colour||"",engineCc:numeric(field("Engine Size"),bike.engineCc??0),motExpiry:field("MOT Expiry Date")||bike.motExpiry||"",registrationDate:field("Registration Date")||bike.registrationDate||"",previousOwners:field("Previous Owners")||bike.previousOwners||"",
  attentionGrabber:customerText(field("Attention Grabber (30 Chars - Autotrader/Website)","Attention Grabber")||bike.attentionGrabber),
  bodyStyle:customerText(field("Body Type")||bike.bodyStyle),fuel:customerText(field("Fuel")||bike.fuel),transmission:customerText(field("Transmission")||bike.transmission),variant:safeVariant,category:customerText(bike.category)
}}
export async function getActiveStockBikes():Promise<StockBike[]>{return(await getAllStockBikes()).filter(bike=>!isTestRecord(bike)).filter(isActive)}
export async function getPublicStockBikes():Promise<PublicStockBike[]>{try{const result=await getSupabasePublicStockBikes();if(result.stock.length)return result.stock.map(toAdminStockBike).filter(isPublic).map(toPublicBike)}catch(error){console.error("Unable to load optimised public stock",error)}return(await getAllStockBikes()).filter(isPublic).map(toPublicBike)}
export async function getSoldStockBikes():Promise<StockBike[]>{return(await getAllStockBikes()).filter(bike=>!isTestRecord(bike)).filter(isSold)}
export async function getFeaturedBikes(limit=4):Promise<PublicStockBike[]>{
  const stock=(await getPublicStockBikes()).sort((a,b)=>Date.parse(b.createdTime||"0")-Date.parse(a.createdTime||"0"));
  return stock.slice(0,limit)
}
const toPublicDetail=(bike:StockBike):PublicStockDetailBike=>{const raw=bike.advertSections??{};const section=(...keys:string[])=>{for(const key of keys){const value=text(raw[key]);if(value)return value}return ""};const advertSections={...raw,headline:section("headline","advert_headline"),intro:section("intro","intro_description"),key_details:section("key_details"),fitted_extras:section("fitted_extras"),preparation:section("preparation","preparation_work"),included:section("included","included_before_delivery"),why_buy:section("why_buy","why_buy_from_yesmoto"),finance:section("finance","finance_options")};return {...toPublicBike(bike),specifications:bike.specifications??{},dealer5Fields:bike.dealer5Fields??{},advertSections}};
export async function getBikeBySlugOrId(value:string):Promise<PublicStockDetailBike|null>{
  const direct=await getSupabaseStockBikeByPublicIdentifier(value);console.info("[Public bike lookup]",{requestedSlug:value,lookupMethod:direct.method,found:Boolean(direct.bike)});
  if(direct.bike){const mapped=toAdminStockBike(direct.bike);if(isPublic(mapped))return toPublicDetail(mapped)}
  if(!["supabase-not-configured","index-error"].includes(direct.method)){console.info("[Public bike lookup] all lookup methods exhausted",{requestedSlug:value});return null}
  const fallback=(await getAllStockBikes()).filter(isPublic).find(b=>b.id===value||toPublicBike(b).slug===value);
  console.info("[Public bike lookup fallback]",{requestedSlug:value,found:Boolean(fallback)});return fallback?toPublicDetail(fallback):null;
}
export async function getStockStats():Promise<StockStats>{const all=(await getAllStockBikes()).filter(bike=>!isTestRecord(bike));const active=all.filter(isActive);return{
  totalStock:active.length,liveStock:active.filter(b=>["in stock","on forecourt"].includes(normaliseStockStatus(b.status))).length,
  reserved:active.filter(isReserved).length,sold:all.filter(isSold).length,
  prep:active.filter(b=>normaliseStockStatus(b.status)==="prep").length,
  totalRetailValue:active.reduce((sum,b)=>sum+b.price,0)
}}

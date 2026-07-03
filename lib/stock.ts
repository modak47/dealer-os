import "server-only";
import { getAirtableStock, type StockBike } from "@/lib/airtable";
import { bikes as mockBikes } from "@/lib/mock-data";

export type { StockBike } from "@/lib/airtable";
export type CustomerStatus="In Stock"|"Reserved";
export interface PublicStockBike {
  id:string; slug:string; make:string; model:string; year:number; mileage:string; mileageValue:number;
  price:number; status:CustomerStatus; image:string; imageUrls:string[]; monthly:number; description:string;
}
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

function mockStock():StockBike[]{return mockBikes.map((bike,index)=>({
  id:bike.id,createdTime:new Date(Date.UTC(2026,0,mockBikes.length-index)).toISOString(),registration:bike.vrm,
  make:bike.make,model:bike.model,year:bike.year,mileage:Number(bike.mileage.replace(/[^0-9]/g,"")),price:bike.price,
  purchasePrice:0,status:bike.status,workshopStatus:bike.status==="Prep"?"In workshop":"",readyForSale:bike.status!=="Prep",
  purchaseDate:"",saleDate:bike.status==="Sold"?"mock":"",profit:0,notes:"",image:bike.image,imageUrls:[bike.image]
}))}

export async function getAllStockBikes():Promise<StockBike[]>{
  try{const stock=await getAirtableStock();return stock?.length?stock:mockStock()}
  catch(error){console.error("Unable to load Motorcycle Stock from Airtable; using mock stock.",error);return mockStock()}
}

export function toPublicBike(bike:StockBike):PublicStockBike{return{
  id:bike.id,slug:slugify([bike.make,bike.model,bike.registration].filter(Boolean).join("-"))||bike.id,
  make:bike.make||"Unknown",model:bike.model||"Motorcycle",year:bike.year,
  mileage:bike.mileage?`${bike.mileage.toLocaleString("en-GB")} miles`:"Mileage unavailable",mileageValue:bike.mileage,
  price:bike.price,status:customerStatus(bike),image:bike.image,imageUrls:bike.imageUrls,
  monthly:Math.max(0,Math.round(bike.price/53)),description:bike.notes
}}
export async function getActiveStockBikes():Promise<StockBike[]>{return(await getAllStockBikes()).filter(isActive)}
export async function getPublicStockBikes():Promise<PublicStockBike[]>{return(await getAllStockBikes()).filter(isPublic).map(toPublicBike)}
export async function getSoldStockBikes():Promise<StockBike[]>{return(await getAllStockBikes()).filter(isSold)}
export async function getFeaturedBikes(limit=4):Promise<PublicStockBike[]>{
  const stock=(await getAllStockBikes()).filter(isPublic).sort((a,b)=>Date.parse(b.createdTime||"0")-Date.parse(a.createdTime||"0"));
  return stock.slice(0,limit).map(toPublicBike)
}
export async function getBikeBySlugOrId(value:string):Promise<PublicStockBike|null>{
  const stock=(await getAllStockBikes()).filter(isPublic);
  const bike=stock.find(b=>b.id===value||toPublicBike(b).slug===value);return bike?toPublicBike(bike):null
}
export async function getStockStats():Promise<StockStats>{const all=await getAllStockBikes();const active=all.filter(isActive);return{
  totalStock:active.length,liveStock:active.filter(b=>["in stock","on forecourt"].includes(normaliseStockStatus(b.status))).length,
  reserved:active.filter(isReserved).length,sold:all.filter(isSold).length,
  prep:active.filter(b=>normaliseStockStatus(b.status)==="prep").length,
  totalRetailValue:active.reduce((sum,b)=>sum+b.price,0)
}}

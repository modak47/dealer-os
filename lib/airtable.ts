import "server-only";

export interface StockBike {
  id: string;
  createdTime: string;
  registration: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  price: number;
  purchasePrice: number;
  status: string;
  workshopStatus: string;
  readyForSale: boolean;
  purchaseDate: string;
  saleDate: string;
  profit: number;
  notes: string;
  image: string;
  imageUrls: string[];
  description?: string;
  colour?: string;
  engineCc?: number;
  motExpiry?: string;
  registrationDate?: string;
  previousOwners?: string;
  engineNumber?: string;
  derivativeId?: string;
  displayStatus?: string;
  attentionGrabber?: string;
  bodyStyle?: string;
  fuel?: string;
  transmission?: string;
  variant?: string;
  category?: string;
  specifications?: Record<string,unknown>;
  dealer5Fields?: Record<string,unknown>;
  advertSections?: Record<string,unknown>;
  showOnWebsite?: boolean;
  reserveEnabled?: boolean;
  isTestRecord?: boolean;
}

type AirtableRecord = { id:string; createdTime?:string; fields?:Record<string,unknown> };
type AirtablePage = { records?:AirtableRecord[]; offset?:string };
const STOCK_FIELDS=["Registration Number","Make","Model","Year","Mileage","Purchase Price","Sale Price","Current Status","Workshop Status","Ready For Sale","Sale Date","Profit Margin","Condition and Notes","Stock Image","Purchase Date"];

const text=(value:unknown)=>typeof value==="string"?value.trim():typeof value==="number"?String(value):"";
const number=(value:unknown)=>{const parsed=typeof value==="number"?value:Number(text(value).replace(/[^0-9.-]/g,""));return Number.isFinite(parsed)?parsed:0};
const boolean=(value:unknown)=>typeof value==="boolean"?value:["true","yes","1","checked"].includes(text(value).toLowerCase());
const images=(value:unknown):string[]=>Array.isArray(value)?value.map(item=>typeof item==="string"?item:item&&typeof item==="object"?text((item as {url?:unknown}).url):"").filter(Boolean):[];

function mapRecord(record:AirtableRecord):StockBike {
  const fields=record.fields??{};
  const imageUrls=images(fields["Stock Image"]);
  return {
    id:record.id,
    createdTime:record.createdTime??"",
    registration:text(fields["Registration Number"]),
    make:text(fields.Make),
    model:text(fields.Model),
    year:number(fields.Year),
    mileage:number(fields.Mileage),
    price:number(fields["Sale Price"]),
    purchasePrice:number(fields["Purchase Price"]),
    status:text(fields["Current Status"]),
    workshopStatus:text(fields["Workshop Status"]),
    readyForSale:boolean(fields["Ready For Sale"]),
    purchaseDate:text(fields["Purchase Date"]),
    saleDate:text(fields["Sale Date"]),
    profit:number(fields["Profit Margin"]),
    notes:text(fields["Condition and Notes"]),
    image:imageUrls[0]??"/bike-placeholder.svg",
    imageUrls:imageUrls.length?imageUrls:["/bike-placeholder.svg"],
  };
}

export async function getAirtableStock():Promise<StockBike[]|null> {
  const apiKey=process.env.AIRTABLE_API_KEY;
  const baseId=process.env.AIRTABLE_BASE_ID;
  const tableName=process.env.AIRTABLE_STOCK_TABLE_NAME||"Motorcycle Stock";
  if(!apiKey||!baseId)return null;

  const records:AirtableRecord[]=[];
  let offset:string|undefined;
  do {
    const url=new URL(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`);
    // Attachment metadata makes large Airtable pages exceed Next's 2 MB cache limit.
    url.searchParams.set("pageSize","25");
    STOCK_FIELDS.forEach(field=>url.searchParams.append("fields[]",field));
    if(offset)url.searchParams.set("offset",offset);
    // Airtable attachment metadata can exceed Next's 2 MB data-cache entry limit.
    // Fetch it server-side without the Next data cache; public pages themselves are
    // still ISR-cached, while every regeneration receives fresh signed image URLs.
    const response=await fetch(url,{headers:{Authorization:`Bearer ${apiKey}`},cache:"no-store"});
    if(!response.ok)throw new Error(`Airtable Motorcycle Stock request failed (${response.status})`);
    const page=await response.json() as AirtablePage;
    records.push(...(page.records??[]));
    offset=page.offset;
  } while(offset);
  return records.map(mapRecord);
}

export async function syncAirtableStockImageOrder(registration:string,imageUrls:string[]):Promise<"updated"|"not-configured"|"not-found">{
  const apiKey=process.env.AIRTABLE_API_KEY;const baseId=process.env.AIRTABLE_BASE_ID;const tableName=process.env.AIRTABLE_STOCK_TABLE_NAME||"Motorcycle Stock";
  if(!apiKey||!baseId)return "not-configured";
  const endpoint=`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`;
  const headers={Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"};
  const lookup=new URL(endpoint);lookup.searchParams.set("maxRecords","1");lookup.searchParams.set("filterByFormula",`UPPER({Registration Number})='${registration.trim().toUpperCase().replace(/'/g,"\\'")}'`);lookup.searchParams.append("fields[]","Registration Number");
  const found=await fetch(lookup,{headers,cache:"no-store"});if(!found.ok)throw new Error(`Airtable image-order lookup failed (${found.status}).`);
  const record=(await found.json() as AirtablePage).records?.[0];if(!record)return "not-found";
  const saved=await fetch(`${endpoint}/${record.id}`,{method:"PATCH",headers,body:JSON.stringify({fields:{"Stock Image":imageUrls.map(url=>({url}))}}),cache:"no-store"});
  if(!saved.ok)throw new Error(`Airtable image-order update failed (${saved.status}).`);return "updated";
}

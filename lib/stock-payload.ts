import "server-only";

const textFields=["registration","make","model","variant","plate","colour","body_style","transmission","fuel","vin","engine_number","vat_status","status","display_status","primary_image_url","description","service_history","torque","co2","road_tax","top_speed","euro_emissions","hpi_category","location","notes"];
const dateFields=["mot_expiry","registration_date"];
const numberFields=["year","mileage","engine_cc","number_of_gears","previous_owners","price","reservation_amount","bhp","length_mm","width_mm","weight_kg"];
const booleanFields=["show_on_website","reserve_enabled"];
const objectFields=["advert_sections","pricing","specifications"];

export function sanitiseStockPayload(body:Record<string,unknown>){
  const payload:Record<string,unknown>={};
  for(const key of textFields)if(key in body)payload[key]=typeof body[key]==="string"?(body[key] as string).trim()||null:body[key]??null;
  for(const key of dateFields)if(key in body)payload[key]=normaliseDate(body[key],key);
  for(const key of numberFields)if(key in body){const value=body[key];if(value===""||value===null||value===undefined)payload[key]=null;else{const parsed=Number(value);if(!Number.isFinite(parsed))throw new Error(`${key} must be a valid number.`);payload[key]=parsed}}
  for(const key of booleanFields)if(key in body)payload[key]=Boolean(body[key]);
  for(const key of objectFields)if(key in body){const value=body[key];if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(`${key} must be an object.`);payload[key]=value}
  if("features" in body){if(!Array.isArray(body.features))throw new Error("features must be an array.");payload.features=body.features}
  if("image_urls" in body){if(!Array.isArray(body.image_urls))throw new Error("image_urls must be an array.");const seen=new Set<string>();const images=body.image_urls.filter((value):value is string=>typeof value==="string").map(value=>value.trim()).filter(value=>{if(!value)return false;let key=value.toLowerCase();try{const url=new URL(value);key=`${url.origin}${url.pathname}`.toLowerCase().replace("/w200/","/")}catch{key=key.split("?")[0].replace("/w200/","/")}if(seen.has(key))return false;seen.add(key);return true});payload.image_urls=images;payload.primary_image_url=images[0]??null}
  return payload;
}

function normaliseDate(value:unknown,key:string){
  if(value===null||value===undefined||value==="")return null;
  const raw=String(value).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  const uk=raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if(uk)return `${uk[3]}-${uk[2].padStart(2,"0")}-${uk[1].padStart(2,"0")}`;
  throw new Error(`${key} must be a valid date.`);
}

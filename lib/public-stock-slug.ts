const text=(value:unknown)=>typeof value==="string"?value.trim():typeof value==="number"?String(value):"";
const compact=(value:unknown)=>text(value).toLowerCase().replace(/[^a-z0-9]/g,"");

export const publicSlug=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

const looksLikeUkRegistration=(value:unknown)=>{
  const vrm=compact(value);
  return /^[a-z]{2}\d{2}[a-z]{3}$/.test(vrm)||/^[a-z]\d{1,3}[a-z]{3}$/.test(vrm)||/^[a-z]{3}\d{1,3}[a-z]$/.test(vrm)||/^\d{1,4}[a-z]{1,3}$/.test(vrm);
};

const shortHash=(value:string)=>{
  let hash=2166136261;
  for(let index=0;index<value.length;index++){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619)}
  return (hash>>>0).toString(36);
};

export function publicStockIdentifier(item:{id?:unknown;dealer5Id?:unknown;dealer5_id?:unknown;stockNumber?:unknown;stock_number?:unknown;registration?:unknown;createdTime?:unknown;created_at?:unknown;make?:unknown;model?:unknown;price?:unknown}){
  const registration=compact(item.registration);
  const candidates=[item.stockNumber,item.stock_number,item.dealer5Id,item.dealer5_id,item.id].map(text);
  const safe=candidates.find(candidate=>{
    const cleaned=compact(candidate);
    return cleaned&&cleaned!==registration&&!looksLikeUkRegistration(cleaned);
  });
  if(safe)return safe;
  return `stock-${shortHash([item.id,item.createdTime,item.created_at,item.make,item.model,item.price].map(text).join("|"))}`;
}

export function publicStockSlug(item:{id?:unknown;dealer5Id?:unknown;dealer5_id?:unknown;stockNumber?:unknown;stock_number?:unknown;registration?:unknown;createdTime?:unknown;created_at?:unknown;make?:unknown;model?:unknown;price?:unknown}){
  return publicSlug([text(item.make),text(item.model),publicStockIdentifier(item)].filter(Boolean).join("-"));
}

export function legacyRegistrationSlug(item:{make?:unknown;model?:unknown;registration?:unknown}){
  return publicSlug([text(item.make),text(item.model),text(item.registration)].filter(Boolean).join("-"));
}

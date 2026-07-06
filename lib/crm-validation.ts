export const cleanText=(value:unknown,max=5000)=>typeof value==="string"?value.trim().slice(0,max):"";
export const cleanEmail=(value:unknown)=>cleanText(value,320).toLowerCase();
export const cleanPhone=(value:unknown)=>cleanText(value,40).replace(/[^0-9+ ()-]/g,"");
export const uuid=(value:unknown)=>{const text=cleanText(value,40);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)?text:null};
export const stockId=(value:unknown)=>{const text=cleanText(value,30);return /^\d+$/.test(text)&&Number(text)>0?Number(text):null};
export const optionalNumber=(value:unknown)=>{if(value===null||value===undefined||value==="")return null;const parsed=Number(value);if(!Number.isFinite(parsed))throw new Error("Invalid number.");return parsed};
export function requireContact(email:string,phone:string){if(!email&&!phone)throw new Error("Email or phone is required.")}

export type SellerForm = { currentStep?: number; version?: number; registration?: string; vehicle?: Record<string, unknown>; condition?: Record<string, unknown>; seller?: Record<string, unknown> };
const vehicleKeys = ["registration", "make", "model", "year", "derivative", "engineCapacity", "fuelType", "colour"];
const conditionKeys = ["mileage", "previousOwners", "spareKeys", "registeredKeeper", "overallCondition", "serviceHistory", "running", "writtenOff", "writeOffCategory", "outstandingFinance", "mechanicalFaults", "faultDescription", "cosmeticDamage", "damageDescription", "lastServiceDate", "mileageAtLastService", "motExpiry", "motAdvisories", "fittedExtras", "photosSkipped"];
const sellerKeys = ["firstName", "lastName", "email", "mobile", "postcode", "consent"];
function pick(value: unknown, keys: string[]) {
 const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
 return Object.fromEntries(keys.filter(key => key in source).map(key => [key, ["consent", "photosSkipped"].includes(key) ? source[key] === true : typeof source[key] === "string" || typeof source[key] === "number" ? String(source[key]).trim().slice(0, key.includes("Description") || key === "fittedExtras" ? 2000 : 250) : ""]));
}
export function sellerInput(value: unknown): SellerForm {
 const input = value && typeof value === "object" ? value as SellerForm : {};
 const vehicle = pick(input.vehicle, vehicleKeys);
 const registration = String(input.registration ?? vehicle.registration ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0,12);
 return { currentStep: Math.max(1,Math.min(4,Number(input.currentStep)||1)), version: Number.isSafeInteger(input.version) ? input.version : -1, registration, vehicle:{...vehicle,registration}, condition:pick(input.condition,conditionKeys), seller:pick(input.seller,sellerKeys) };
}
export function sellerValidation(value: SellerForm, step = 4): string[] {
 const input=sellerInput(value),v=input.vehicle!,c=input.condition!,s=input.seller!,errors:string[]=[];
 const positiveInteger=(x:unknown)=>typeof x==='string'&&/^\d+$/.test(x)&&Number.isSafeInteger(Number(x));
 if (!v.make || !v.model || !positiveInteger(v.year) || Number(v.year)<1900 || Number(v.year)>new Date().getFullYear()+1) errors.push("Add your bike's make, model and year. Use Find my bike or open Add or correct your bike details.");
 if (!positiveInteger(c.mileage)) errors.push("Enter the mileage in miles, using whole numbers. Enter 0 if the bike has not covered any miles.");
 if (!['yes','no'].includes(String(c.registeredKeeper))) errors.push("Tell us whether your name is on the V5C logbook.");
 if (step>=2) {
  if (!['Excellent','Good','Average','Poor','Non-runner'].includes(String(c.overallCondition))) errors.push("Choose the motorcycle's condition.");
  if (!['Full history','Part history','No history','Unknown'].includes(String(c.serviceHistory))) errors.push("Choose the service history.");
  const questions:Record<string,string>={running:"Tell us whether the bike starts and can be ridden.",writtenOff:"Tell us whether an insurer has recorded the bike as a write-off. Choose Unsure if you do not know.",outstandingFinance:"Tell us whether there is money still owed on finance. Choose Unsure if you do not know.",mechanicalFaults:"Tell us whether the bike has any mechanical or electrical faults.",cosmeticDamage:"Tell us whether there are any scratches, dents, rust or damaged bodywork."};
  for(const key of Object.keys(questions)) if(!(['writtenOff','outstandingFinance'].includes(key)?['yes','no','unsure']:['yes','no']).includes(String(c[key])))errors.push(questions[key]);
  const details:Record<string,string>={writeOffCategory:"Enter the write-off category, or enter Not known if you are unsure.",faultDescription:"Describe the faults you know about.",damageDescription:"Describe the damage you know about."};
  for(const [question,detail] of [['writtenOff','writeOffCategory'],['mechanicalFaults','faultDescription'],['cosmeticDamage','damageDescription']])if(c[question]==='yes'&&!c[detail])errors.push(details[detail]);
 }
 if(step>=4){
  if(!s.firstName||!s.lastName)errors.push("Enter your first and last name.");
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s.email||'')))errors.push("Enter a valid email address.");
  if(!/^\+?[\d ()-]{10,20}$/.test(String(s.mobile||'')))errors.push("Enter a valid telephone number.");
  if(!/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(String(s.postcode||'')))errors.push("Enter a valid UK postcode.");
  if(s.consent!==true)errors.push("Please read and agree to the privacy and terms notice.");
 }
 return errors;
}
export const sellerPhotoLimit=20;
export const sellerPhotoMaxBytes=4*1024*1024;
export const sellerPhotoAccept='image/jpeg,image/png,image/webp';

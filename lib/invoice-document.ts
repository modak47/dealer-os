import "server-only";
import {getInvoice} from "@/lib/accounts";
import {dealerAddress,getDealerSettings} from "@/lib/dealer-settings";

const text=(value:unknown)=>typeof value==="string"?value:"";
const one=<T,>(value:T|T[]|null|undefined):T|undefined=>Array.isArray(value)?value[0]:value??undefined;
export async function getInvoiceDocument(id:string){
  const [data,settings]=await Promise.all([getInvoice(id),getDealerSettings()]);const invoice=data.invoice as typeof data.invoice&{customer?:Record<string,unknown>|Record<string,unknown>[];bike?:Record<string,unknown>|Record<string,unknown>[]};
  const customer=one(invoice.customer)??invoice.customer_snapshot??{};const bike=one(invoice.bike)??invoice.bike_snapshot??{};
  const customerName=[text(customer.title),text(customer.first_name),text(customer.last_name)].filter(Boolean).join(" ");
  const address=[text(customer.house_name_number),text(customer.address_line_1),text(customer.address_line_2),text(customer.address_line_3),text(customer.city),text(customer.county),text(customer.postcode),text(customer.country)].filter(Boolean);
  const bikeName=[bike.year,bike.make,bike.model,bike.variant].filter(Boolean).join(" ");
  const paymentConfigured=Boolean(settings.bank_account_name&&settings.bank_sort_code&&settings.bank_account_number);
  const paymentReference=`${settings.payment_reference_prefix||"YM"}-${invoice.invoice_number}`;
  const dealership={dealerName:settings.business_name,tradingName:settings.legal_name||settings.trading_name,domain:settings.website,phone:settings.phone,email:settings.email,address:dealerAddress(settings)};
  return {...data,customer,bike,customerName,address,bikeName,settings,payment:{configured:paymentConfigured,accountName:settings.bank_account_name||"Bank details available from YesMoto",sortCode:settings.bank_sort_code,accountNumber:settings.bank_account_number,reference:paymentReference,instructions:settings.payment_instructions},dealership};
}
export const money=(value:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(Number(value||0));

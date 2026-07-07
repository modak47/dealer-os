import "server-only";
import {dealership} from "@/config/dealership";
import {getInvoice} from "@/lib/accounts";

const text=(value:unknown)=>typeof value==="string"?value:"";
const one=<T,>(value:T|T[]|null|undefined):T|undefined=>Array.isArray(value)?value[0]:value??undefined;
export async function getInvoiceDocument(id:string){
  const data=await getInvoice(id);const invoice=data.invoice as typeof data.invoice&{customer?:Record<string,unknown>|Record<string,unknown>[];bike?:Record<string,unknown>|Record<string,unknown>[]};
  const customer=one(invoice.customer)??invoice.customer_snapshot??{};const bike=one(invoice.bike)??invoice.bike_snapshot??{};
  const customerName=[text(customer.title),text(customer.first_name),text(customer.last_name)].filter(Boolean).join(" ");
  const address=[text(customer.house_name_number),text(customer.address_line_1),text(customer.address_line_2),text(customer.address_line_3),text(customer.city),text(customer.county),text(customer.postcode),text(customer.country)].filter(Boolean);
  const bikeName=[bike.year,bike.make,bike.model,bike.variant].filter(Boolean).join(" ");
  const paymentConfigured=Boolean(process.env.YESMOTO_BANK_ACCOUNT_NAME&&process.env.YESMOTO_BANK_SORT_CODE&&process.env.YESMOTO_BANK_ACCOUNT_NUMBER);
  const paymentReference=`${process.env.YESMOTO_PAYMENT_REFERENCE_PREFIX??"YM"}-${invoice.invoice_number}`;
  return {...data,customer,bike,customerName,address,bikeName,payment:{configured:paymentConfigured,accountName:process.env.YESMOTO_BANK_ACCOUNT_NAME??"Bank details available from YesMoto",sortCode:process.env.YESMOTO_BANK_SORT_CODE??"",accountNumber:process.env.YESMOTO_BANK_ACCOUNT_NUMBER??"",reference:paymentReference},dealership};
}
export const money=(value:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(Number(value||0));

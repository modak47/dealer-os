import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type InvoiceStatus="draft"|"sent"|"partially_paid"|"paid"|"overdue"|"cancelled"|"credited";
export type InvoiceRow={id:string;invoice_number:string;customer_id:string;stock_bike_id:number;reservation_id:string|null;subtotal:number;total:number;paid:number;balance:number;status:InvoiceStatus;issued_at:string;due_at:string|null;delivery_charge:number;notes:string|null;customer_snapshot:Record<string,unknown>;bike_snapshot:Record<string,unknown>;customer?:{first_name:string;last_name:string;email:string|null;phone:string|null;postcode:string|null}|null;bike?:{make:string|null;model:string|null;variant:string|null;registration:string|null;year:number|null}|null};
export type InvoiceItem={id:string;description:string;quantity:number;unit_price:number;line_total:number;item_type:string;sort_order:number};
export type InvoicePayment={id:string;amount:number;method:string;payment_type:string;receipt_number:string|null;paid_at:string;status:string;notes:string|null};

export async function getInvoices(status="all",q=""){
  const supabase=getSupabaseAdmin();
  let query=supabase.from("crm_invoices").select("*,customer:crm_customers(first_name,last_name,email,phone,postcode),bike:stock_bikes(make,model,variant,registration,year)").is("deleted_at",null).neq("is_test_record",true).order("created_at",{ascending:false});
  if(status!=="all")query=query.eq("status",status);
  const {data,error}=await query;
  if(error){if(error.code==="42P01"||error.code==="42703")return {data:[] as InvoiceRow[],migrationReady:false};throw error}
  const term=q.trim().toLowerCase();
  const rows=(data??[]) as unknown as InvoiceRow[];
  return {data:term?rows.filter(i=>[i.invoice_number,i.customer?.first_name,i.customer?.last_name,i.customer?.email,i.bike?.registration,i.bike?.make,i.bike?.model].some(v=>String(v??"").toLowerCase().includes(term))):rows,migrationReady:true};
}

export async function getInvoice(id:string){
  const supabase=getSupabaseAdmin();
  const {data,error}=await supabase.from("crm_invoices").select("*,customer:crm_customers(*),bike:stock_bikes(id,make,model,variant,registration,year,price,primary_image_url),reservation:crm_reservations(*)").eq("id",id).is("deleted_at",null).single();
  if(error)throw error;
  const [{data:items,error:itemsError},{data:payments,error:paymentsError},{data:emails,error:emailsError}]=await Promise.all([
    supabase.from("crm_invoice_items").select("*").eq("invoice_id",id).order("sort_order"),
    supabase.from("crm_payments").select("id,amount,method,payment_type,receipt_number,paid_at,status,notes").eq("invoice_id",id).is("deleted_at",null).order("paid_at",{ascending:false}),
    supabase.from("crm_email_logs").select("id,to_email,subject,status,provider,sent_at,created_at").eq("invoice_id",id).order("created_at",{ascending:false}).limit(10)
  ]);
  if(itemsError)throw itemsError;if(paymentsError)throw paymentsError;if(emailsError&&emailsError.code!=="42P01")throw emailsError;
  return {invoice:data as InvoiceRow&Record<string,unknown>,items:(items??[]) as InvoiceItem[],payments:(payments??[]) as InvoicePayment[],emails:emails??[]};
}

export async function getInvoiceableReservations(){
  const {data,error}=await getSupabaseAdmin().from("crm_reservations").select("id,deposit_amount,delivery_option,delivery_charge,reserved_at,customer:crm_customers(id,first_name,last_name,email,phone,address_line_1,address_line_2,city,county,postcode),bike:stock_bikes(id,make,model,variant,registration,year,price,status)").neq("is_test_record",true).in("status",["Active","Deposit Taken","Converted"]).order("reserved_at",{ascending:false});
  if(error)throw error;
  const {data:used}=await getSupabaseAdmin().from("crm_invoices").select("reservation_id").not("reservation_id","is",null).is("deleted_at",null);
  const usedIds=new Set((used??[]).map(x=>x.reservation_id));
  return (data??[]).filter(r=>!usedIds.has(r.id));
}

export function invoiceStats(rows:InvoiceRow[]){return rows.reduce((s,i)=>({invoiced:s.invoiced+Number(i.total||0),paid:s.paid+Number(i.paid||0),outstanding:s.outstanding+(i.status==="cancelled"?0:Number(i.balance||0)),overdue:s.overdue+(i.status==="overdue"?Number(i.balance||0):0)}),{invoiced:0,paid:0,outstanding:0,overdue:0})}

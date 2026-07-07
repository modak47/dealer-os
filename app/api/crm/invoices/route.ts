import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabase/admin";
import {getInvoices} from "@/lib/accounts";

export async function GET(request:Request){try{const url=new URL(request.url),saleId=url.searchParams.get("sale_id");if(saleId){const {data,error}=await getSupabaseAdmin().from("crm_invoices").select("id").eq("sale_id",saleId).is("deleted_at",null).maybeSingle();if(error)throw error;if(!data)return NextResponse.json({error:"Invoice not found for this sale."},{status:404});const {getInvoice}=await import("@/lib/accounts");return NextResponse.json(await getInvoice(data.id))}return NextResponse.json(await getInvoices(url.searchParams.get("status")??"all",url.searchParams.get("q")??""))}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load invoices."},{status:500})}}
export async function POST(request:Request){try{
  const body=await request.json() as {reservation_id?:string;delivery_charge?:number;due_at?:string};
  if(!body.reservation_id)return NextResponse.json({error:"A reservation is required."},{status:400});
  const db=getSupabaseAdmin();
  const {data:r,error:rError}=await db.from("crm_reservations").select("*,customer:crm_customers(*),bike:stock_bikes(id,make,model,variant,registration,year,price)").eq("id",body.reservation_id).single();
  if(rError||!r)return NextResponse.json({error:"Reservation could not be found."},{status:404});
  const {data:existing}=await db.from("crm_invoices").select("id").eq("reservation_id",r.id).is("deleted_at",null).maybeSingle();
  if(existing)return NextResponse.json({invoice_id:existing.id,existing:true});
  const customer=Array.isArray(r.customer)?r.customer[0]:r.customer;const bike=Array.isArray(r.bike)?r.bike[0]:r.bike;
  const {data:number,error:numberError}=await db.rpc("crm_next_invoice_number");if(numberError)throw numberError;
  const delivery=Math.max(0,Number(body.delivery_charge??r.delivery_charge??0));const price=Math.max(0,Number(bike?.price??0));
  const {data:invoice,error}=await db.from("crm_invoices").insert({invoice_number:number,sale_id:null,reservation_id:r.id,customer_id:r.customer_id,stock_bike_id:r.stock_bike_id,subtotal:price+delivery,total:price+delivery,paid:0,balance:price+delivery,status:"draft",due_at:body.due_at||new Date(Date.now()+7*86400000).toISOString(),delivery_charge:delivery,customer_snapshot:customer??{},bike_snapshot:bike??{}}).select("id").single();
  if(error)throw error;
  const bikeName=[bike?.year,bike?.make,bike?.model,bike?.variant,bike?.registration&&`(${bike.registration})`].filter(Boolean).join(" ");
  const items=[{invoice_id:invoice.id,description:bikeName||"Motorcycle",quantity:1,unit_price:price,item_type:"motorcycle",sort_order:0},...(delivery>0?[{invoice_id:invoice.id,description:"Motorcycle delivery",quantity:1,unit_price:delivery,item_type:"delivery",sort_order:10}]:[])];
  const {error:itemError}=await db.from("crm_invoice_items").insert(items);if(itemError)throw itemError;
  await db.from("crm_payments").update({invoice_id:invoice.id}).eq("reservation_id",r.id).eq("status","Completed");
  await db.rpc("crm_refresh_invoice",{p_invoice_id:invoice.id});
  return NextResponse.json({invoice_id:invoice.id},{status:201});
}catch(error){console.error("Invoice creation failed",error instanceof Error?error.message:error);return NextResponse.json({error:error instanceof Error?error.message:"Unable to create invoice."},{status:500})}}

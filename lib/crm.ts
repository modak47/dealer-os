import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface CrmCustomer {
  id:string; title:string|null; first_name:string; last_name:string; email:string|null; phone:string|null;
  house_name_number?:string|null;address_line_1?:string|null;address_line_2?:string|null;address_line_3?:string|null;city?:string|null;county?:string|null;postcode:string|null;country?:string|null;latitude?:number|null;longitude?:number|null; tags:string[]; notes:string|null; assigned_user_id:string|null; created_at:string; updated_at:string;
  portal_access_code?: string | null;
}
export interface CrmLead {
  id:string; customer_id:string|null; source:string; status:string; interest_level:string|null; budget_min:number|null; budget_max:number|null;
  preferred_bike_id:string|null; preferred_bike_notes:string|null; trade_in:boolean; trade_in_registration:string|null; lost_reason:string|null; notes:string|null; assigned_user_id:string|null;
  created_at:string; updated_at:string; customer?:Pick<CrmCustomer,"id"|"first_name"|"last_name"|"email"|"phone">|null;
  bike?:{id:string;make:string|null;model:string|null;registration:string|null}|null;
}
export interface CrmEnquiry {id:string;customer_id:string;lead_id:string|null;stock_bike_id:string|null;source:string;subject:string|null;message:string;status:string;created_at:string;customer?:Pick<CrmCustomer,"id"|"first_name"|"last_name">|null;bike?:{id:string;make:string|null;model:string|null}|null}
export interface CrmActivity {id:string;activity_type:string;subject:string;body:string|null;status:string;priority:string;due_at:string|null;completed_at:string|null;created_at:string}
export interface CrmReservation {id:string;customer_id:string;stock_bike_id:string;deposit_amount:number;reserved_at:string;expires_at:string;status:string;notes:string|null;bike?:{id:string;make:string|null;model:string|null;registration:string|null}|null;customer?:Pick<CrmCustomer,"id"|"first_name"|"last_name">|null}

export type CrmResult<T>={data:T;migrationReady:boolean;error?:string};
const missing=(error:{message?:string}|null)=>Boolean(error&&/does not exist|schema cache|relation .*crm_/i.test(error.message??""));

export async function getCrmCustomers(query=""):Promise<CrmResult<CrmCustomer[]>>{
  let request=getSupabaseAdmin().from("crm_customers").select("*").is("archived_at",null).neq("is_test_record",true).order("updated_at",{ascending:false}).limit(100);
  if(query.trim())request=request.or(`first_name.ilike.%${query.trim()}%,last_name.ilike.%${query.trim()}%,email.ilike.%${query.trim()}%,phone.ilike.%${query.trim()}%,house_name_number.ilike.%${query.trim()}%,address_line_1.ilike.%${query.trim()}%,address_line_2.ilike.%${query.trim()}%,address_line_3.ilike.%${query.trim()}%,city.ilike.%${query.trim()}%,county.ilike.%${query.trim()}%,postcode.ilike.%${query.trim()}%`);
  const {data,error}=await request;if(error)return {data:[],migrationReady:!missing(error),error:error.message};return {data:(data??[]) as CrmCustomer[],migrationReady:true};
}
export async function getCrmCustomer(id:string){
  const {data,error}=await getSupabaseAdmin().from("crm_customers").select("*").eq("id",id).maybeSingle();
  if(error)return {data:null,migrationReady:!missing(error),error:error.message} as CrmResult<CrmCustomer|null>;
  return {data:data as CrmCustomer|null,migrationReady:true} as CrmResult<CrmCustomer|null>;
}
export async function getCrmLeads(status=""):Promise<CrmResult<CrmLead[]>>{
  let request=getSupabaseAdmin().from("crm_leads").select("*,customer:crm_customers(id,first_name,last_name,email,phone),bike:stock_bikes(id,make,model,registration)").neq("is_test_record",true).order("updated_at",{ascending:false}).limit(100);
  if(status)request=request.eq("status",status);
  const {data,error}=await request;if(error)return {data:[],migrationReady:!missing(error),error:error.message};return {data:(data??[]) as unknown as CrmLead[],migrationReady:true};
}
export async function getCrmLead(id:string){const {data,error}=await getSupabaseAdmin().from("crm_leads").select("*,customer:crm_customers(*),bike:stock_bikes(id,make,model,variant,registration,primary_image_url,price)").eq("id",id).maybeSingle();return {data:data as unknown as CrmLead|null,migrationReady:!missing(error),error:error?.message};}
export async function getCustomerTimeline(customerId:string){
  const db=getSupabaseAdmin();const [activities,enquiries,reservations,leads,sales]=await Promise.all([
    db.from("crm_activities").select("*").eq("customer_id",customerId).order("created_at",{ascending:false}).limit(100),
    db.from("crm_enquiries").select("*,bike:stock_bikes(id,make,model)").eq("customer_id",customerId).order("created_at",{ascending:false}),
    db.from("crm_reservations").select("*,bike:stock_bikes(id,make,model,registration)").eq("customer_id",customerId).order("created_at",{ascending:false}),
    db.from("crm_leads").select("*").eq("customer_id",customerId).order("created_at",{ascending:false}),
    db.from("crm_sales").select("id,status,invoice_number,sale_price,created_at,bike:stock_bikes!crm_sales_stock_bike_id_fkey(id,make,model,registration)").eq("customer_id",customerId).order("created_at",{ascending:false}),
  ]);
  return {activities:(activities.data??[]) as CrmActivity[],enquiries:(enquiries.data??[]) as unknown as CrmEnquiry[],reservations:(reservations.data??[]) as unknown as CrmReservation[],leads:(leads.data??[]) as CrmLead[],sales:(sales.data??[]) as unknown as Array<{id:string;status:string;invoice_number:string|null;sale_price:number|null;created_at:string;bike?:{make:string|null;model:string|null;registration:string|null}|null}>};
}
export async function getCrmDashboard(){
  const db=getSupabaseAdmin();await db.rpc("crm_expire_reservations");const today=new Date();today.setHours(0,0,0,0);const month=new Date(today.getFullYear(),today.getMonth(),1).toISOString();
  const [newLeads,enquiries,reservations,activities,overdue,finance,sales]=await Promise.all([
    db.from("crm_leads").select("id",{count:"exact",head:true}).eq("status","New").neq("is_test_record",true),db.from("crm_enquiries").select("id",{count:"exact",head:true}).gte("created_at",today.toISOString()),
    db.from("crm_reservations").select("id",{count:"exact",head:true}).in("status",["Active","Deposit Taken"]).neq("is_test_record",true),db.from("crm_activities").select("id",{count:"exact",head:true}).eq("status","Open").gte("due_at",today.toISOString()).lt("due_at",new Date(today.getTime()+86400000).toISOString()),
    db.from("crm_activities").select("id",{count:"exact",head:true}).eq("status","Open").lt("due_at",new Date().toISOString()),db.from("crm_finance_applications").select("id",{count:"exact",head:true}).in("status",["Submitted","Referred"]),
    db.from("crm_sales").select("id",{count:"exact",head:true}).gte("created_at",month).neq("status","Cancelled").neq("is_test_record",true)]);
  const errors=[newLeads.error,enquiries.error,reservations.error,activities.error,overdue.error,finance.error,sales.error].filter(Boolean);
  return {migrationReady:!errors.some(error=>missing(error)),newLeads:newLeads.count??0,recentEnquiries:enquiries.count??0,reservations:reservations.count??0,todayActivities:activities.count??0,overdue:overdue.count??0,financePending:finance.count??0,salesThisMonth:sales.count??0};
}
export async function searchCrm(query:string){const term=query.trim();if(!term)return {customers:[] as CrmCustomer[],leads:[] as CrmLead[],stock:[] as {id:string;make:string|null;model:string|null;registration:string|null;vin:string|null;stock_number:string|null}[],reservations:[] as CrmReservation[],sales:[] as {id:string;status:string;customer?:{first_name:string;last_name:string}|null;bike?:{make:string|null;model:string|null}|null}[]};const db=getSupabaseAdmin(),pattern=`%${term}%`;const [customers,leads,stock,reservations,sales]=await Promise.all([db.from("crm_customers").select("*").neq("is_test_record",true).or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},postcode.ilike.${pattern}`).limit(20),db.from("crm_leads").select("*,customer:crm_customers(id,first_name,last_name,email,phone),bike:stock_bikes(id,make,model,registration)").neq("is_test_record",true).or(`preferred_bike_notes.ilike.${pattern},notes.ilike.${pattern}`).limit(20),db.from("stock_bikes").select("id,make,model,registration,vin,stock_number").neq("is_test_record",true).or(`make.ilike.${pattern},model.ilike.${pattern},registration.ilike.${pattern},vin.ilike.${pattern},stock_number.ilike.${pattern}`).limit(20),db.from("crm_reservations").select("*,customer:crm_customers(id,first_name,last_name),bike:stock_bikes(id,make,model,registration)").neq("is_test_record",true).or(`notes.ilike.${pattern}`).limit(20),db.from("crm_sales").select("id,status,customer:crm_customers(first_name,last_name),bike:stock_bikes!crm_sales_stock_bike_id_fkey(make,model)").neq("is_test_record",true).limit(20)]);return {customers:(customers.data??[]) as CrmCustomer[],leads:(leads.data??[]) as unknown as CrmLead[],stock:(stock.data??[]) as {id:string;make:string|null;model:string|null;registration:string|null;vin:string|null;stock_number:string|null}[],reservations:(reservations.data??[]) as unknown as CrmReservation[],sales:(sales.data??[]) as unknown as {id:string;status:string;customer?:{first_name:string;last_name:string}|null;bike?:{make:string|null;model:string|null}|null}[]}}

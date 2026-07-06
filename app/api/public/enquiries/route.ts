import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cleanEmail,cleanPhone,cleanText,requireContact,stockId } from "@/lib/crm-validation";

export async function POST(request:Request){
  try{
    const body=await request.json() as Record<string,unknown>;const email=cleanEmail(body.email),phone=cleanPhone(body.phone);requireContact(email,phone);
    const suppliedName=cleanText(body.name,200).split(/\s+/);const firstName=cleanText(body.firstName||body.first_name,100)||suppliedName.shift()||"Website";const lastName=cleanText(body.lastName||body.last_name,100)||suppliedName.join(" ")||"Enquiry";
    const db=getSupabaseAdmin();let customerId:string|undefined;
    if(email){const existing=await db.from("crm_customers").select("id").is("archived_at",null).eq("email",email).limit(1);if(existing.error)throw existing.error;customerId=existing.data?.[0]?.id}
    if(!customerId&&phone){const existing=await db.from("crm_customers").select("id").is("archived_at",null).eq("phone",phone).limit(1);if(existing.error)throw existing.error;customerId=existing.data?.[0]?.id}
    if(!customerId){const created=await db.from("crm_customers").insert({first_name:firstName,last_name:lastName,email:email||null,phone:phone||null,postcode:cleanText(body.postcode,20)||null,marketing_email:false,marketing_sms:false,marketing_phone:false,marketing_whatsapp:false}).select("id").single();if(created.error)throw created.error;customerId=created.data.id}
    const stockBikeId=stockId(body.stock_bike_id);const subject=cleanText(body.subject,300)||cleanText(body.enquiry_type,100)||"Website enquiry";const message=cleanText(body.message)||`Customer submitted a ${subject.toLowerCase()} request.`;
    const leadInsert=await db.from("crm_leads").insert({customer_id:customerId,source:"Website",status:"New",preferred_bike_id:stockBikeId,preferred_bike_notes:cleanText(body.bike,300)||null,trade_in:/part exchange|sell/i.test(subject),trade_in_registration:cleanText(body.vrm,20)||null,notes:message}).select("id").single();if(leadInsert.error)throw leadInsert.error;
    const enquiryInsert=await db.from("crm_enquiries").insert({customer_id:customerId,lead_id:leadInsert.data.id,stock_bike_id:stockBikeId,source:"Website",subject,message,status:"New",consent:Boolean(body.consent),metadata:{form:cleanText(body.enquiry_type,100)||"Website",submitted_fields:Object.keys(body).filter(key=>!["email","phone","firstName","lastName","name","message"].includes(key))}}).select("id").single();if(enquiryInsert.error)throw enquiryInsert.error;
    await db.from("crm_activities").insert({activity_type:"Follow Up",subject:`Follow up: ${subject}`,body:message,status:"Open",priority:"High",due_at:new Date().toISOString(),customer_id:customerId,lead_id:leadInsert.data.id,stock_bike_id:stockBikeId});
    return NextResponse.json({enquiryId:enquiryInsert.data.id,leadId:leadInsert.data.id},{status:201});
  }catch(error){console.error("Unable to create public CRM enquiry",error);const unavailable=/crm_|schema cache|does not exist/i.test(error instanceof Error?error.message:"");return NextResponse.json({error:unavailable?"Our enquiry system is being configured. Please call or WhatsApp us.":"Unable to send your enquiry. Please try again."},{status:unavailable?503:400})}
}

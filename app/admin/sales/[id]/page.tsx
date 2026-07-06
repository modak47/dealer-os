import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage } from "../../dashboard/page";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SaleEditor } from "./sale-editor";
export const dynamic = "force-dynamic";
export default async function SaleDetail({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const { data } = await getSupabaseAdmin().from("crm_sales").select("*,customer:crm_customers(id,first_name,last_name,email,phone),bike:stock_bikes(id,make,model,variant,registration,status,primary_image_url),delivery:crm_deliveries(*),payments:crm_payments(*)").eq("id", id).maybeSingle(); if (!data) notFound(); const customer = Array.isArray(data.customer) ? data.customer[0] : data.customer, bike = Array.isArray(data.bike) ? data.bike[0] : data.bike; return <AdminPage title={`Sale ${data.invoice_number ?? "record"}`} sub={`${bike?.make ?? ""} ${bike?.model ?? ""} · ${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`} actions={<div className="quick-actions"><Link href={`/admin/customers/${customer?.id}`}>Customer profile</Link><Link href={`/admin/stock/${bike?.id}`}>Stock record</Link></div>}><SaleEditor sale={data as Record<string, any>} /></AdminPage>; }

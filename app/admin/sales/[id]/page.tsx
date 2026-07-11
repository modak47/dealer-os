import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage } from "../../dashboard/page";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SaleEditor } from "./sale-editor";

export const dynamic = "force-dynamic";

export default async function SaleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await getSupabaseAdmin()
    .from("crm_sales")
    .select("*,customer:crm_customers(id,first_name,last_name,email,phone,postcode),bike:stock_bikes(id,stock_number,make,model,variant,year,registration,status,price,primary_image_url,purchase_price,total_stock_cost),delivery:crm_deliveries(*),payments:crm_payments(*),invoice:crm_invoices(*)")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const customer = Array.isArray(data.customer) ? data.customer[0] : data.customer;
  const bike = Array.isArray(data.bike) ? data.bike[0] : data.bike;
  const bikeName = [bike?.year, bike?.make, bike?.model, bike?.variant].filter(Boolean).join(" ");
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ");

  return <AdminPage
    title={`Deal ${data.invoice_number ?? ""}`.trim()}
    sub={`${bikeName || "Motorcycle"} · ${customerName || "Customer"}`}
    actions={<div className="quick-actions"><Link href="/admin/sales">Pipeline</Link><Link href={`/admin/customers/${customer?.id}`}>Customer</Link><Link href={`/admin/stock/${bike?.id}`}>Stock</Link></div>}
  >
    <SaleEditor sale={data as Record<string, unknown>} />
  </AdminPage>;
}

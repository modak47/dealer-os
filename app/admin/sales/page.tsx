import Link from "next/link";
import { AdminPage } from "../dashboard/page";
import { getSalesPipeline } from "@/lib/sales-deals";
import { money } from "@/lib/mock-data";
import { SalesPipeline } from "./sales-pipeline";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const pipeline = await getSalesPipeline();

  return <AdminPage
    title="Sales Pipeline"
    sub="Track reserved bikes, open deals, invoices, payments, finance and handover from one place."
    actions={<div className="quick-actions"><Link href="/admin/sales/new">+ New Sale</Link><Link href="/admin/accounts/invoices">Invoices</Link></div>}
  >
    {!pipeline.migrationReady && <div className="crm-setup"><b>Sales pipeline migration required</b><span>Run 20260711000200_sales_deal_pipeline.sql in Supabase.</span></div>}
    <div className="sales-kpis">
      <Kpi label="Open deals" value={pipeline.kpis.openDeals} />
      <Kpi label="Active reservations" value={pipeline.kpis.reserved} />
      <Kpi label="Awaiting payment" value={pipeline.kpis.awaitingPayment} />
      <Kpi label="Finance cases" value={pipeline.kpis.finance} />
      <Kpi label="Ready for handover" value={pipeline.kpis.delivery} />
      <Kpi label="Sold this month" value={pipeline.kpis.completedThisMonth} />
      <Kpi label="Open deal value" value={money(pipeline.kpis.openValue)} />
      <Kpi label="Outstanding balance" value={money(pipeline.kpis.outstandingBalance)} alert={pipeline.kpis.outstandingBalance > 0} />
    </div>
    <SalesPipeline deals={pipeline.deals} reservations={pipeline.reservations} />
  </AdminPage>;
}

function Kpi({ label, value, alert = false }: { label: string; value: string | number; alert?: boolean }) {
  return <article className={alert ? "sales-kpi alert" : "sales-kpi"}><span>{label}</span><strong>{value}</strong></article>;
}

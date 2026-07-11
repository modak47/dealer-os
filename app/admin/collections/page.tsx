import Link from "next/link";
import { AdminPage } from "../dashboard/page";
import { getCollections } from "@/lib/collections";
import { CollectionsClient } from "./collections-client";

export const dynamic = "force-dynamic";

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<{ view?: string; stockId?: string }> }) {
  const params = await searchParams;
  const data = await getCollections(params.view || "upcoming", params.stockId, "all");

  return <AdminPage
    title="Collection Planner"
    sub="Schedule incoming Purchase Pending bikes, assign staff, confirm customers and receive bikes into stock."
    actions={<div className="quick-actions"><Link href="/admin/collections/my">My Collections</Link><Link href="/admin/stock?filter=pending">Purchase Pending</Link></div>}
  >
    {!data.migrationReady && <div className="crm-setup"><b>Collection planner migration required</b><span>Run 20260711000300_stock_collections_phase6.sql in Supabase.</span></div>}
    <CollectionsClient initial={data} initialView={params.view || "upcoming"} initialStockId={params.stockId || ""} driverMode={false} />
  </AdminPage>;
}

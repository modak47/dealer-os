import Link from "next/link";
import { AdminPage } from "../../dashboard/page";
import { getCurrentUserId } from "@/lib/current-user";
import { getCollections } from "@/lib/collections";
import { CollectionsClient } from "../collections-client";

export const dynamic = "force-dynamic";

export default async function MyCollectionsPage() {
  const userId = await getCurrentUserId();
  const data = await getCollections("today", null, userId || "unassigned");

  return <AdminPage
    title="My Collections"
    sub="Mobile-friendly driver view for today’s assigned collections."
    actions={<div className="quick-actions"><Link href="/admin/collections">Planner</Link></div>}
  >
    <CollectionsClient initial={data} initialView="today" initialAssigned={userId || "unassigned"} driverMode />
  </AdminPage>;
}

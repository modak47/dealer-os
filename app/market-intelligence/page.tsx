import { AdminPage } from "@/app/admin/dashboard/page";
import { AdminShell } from "@/app/admin/admin-shell";
import { getAdminIdentity } from "@/lib/admin-identity";
import { MarketIntelligenceClient } from "./market-intelligence-client";

export const dynamic = "force-dynamic";

export default async function MarketIntelligencePage() {
  const identity = await getAdminIdentity();
  return <AdminShell identity={identity}>
    <AdminPage
      title="AutoTrader Market Intelligence"
      sub="Analyse live and removed AutoTrader listings, dealer movement, sold trends and pricing."
      hint="Source: Supabase autotrader_listings"
    >
      <MarketIntelligenceClient />
    </AdminPage>
  </AdminShell>;
}

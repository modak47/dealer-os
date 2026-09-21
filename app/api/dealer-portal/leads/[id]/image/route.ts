import { NextResponse } from "next/server";
import { getCurrentDealerPortalAccount } from "@/lib/dealer-portal";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { serveLeadImage } from "@/lib/lead-image-server";
import { combineLeadImages } from "@/lib/website-leads";
import type { WebsiteLead } from "@/types/website-lead";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentDealerPortalAccount();
  if (!session) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid lead." }, { status: 400 });
  const db = getSupabaseAdminClient();
  const [allocation, claim, offer, lead] = await Promise.all([
    db.from("dealer_lead_allocations").select("id").eq("website_lead_id", id).eq("dealer_account_id", session.dealer.id).eq("allocation_status", "available").limit(1),
    db.from("dealer_lead_claims").select("id").eq("website_lead_id", id).eq("dealer_account_id", session.dealer.id).limit(1),
    db.from("dealer_offers").select("id").eq("website_lead_id", id).eq("dealer_account_id", session.dealer.id).limit(1),
    db.from("website_leads").select("status,opportunity_mode,marketplace_status,images,Images,image1,image2,image3,image4,image5,image6,image7,image8,image9,image10").eq("id", id).maybeSingle(),
  ]);
  if ([allocation, claim, offer, lead].some(r => r.error) || !lead.data) return NextResponse.json({ error: "Image unavailable." }, { status: 404 });
  const record = lead.data;
  const available = allocation.data?.length && (record.opportunity_mode === "marketplace_offer" ? ["live_to_dealers", "offer_received"].includes(record.marketplace_status) : ["dealer_pool_available", "dealer_allocated", "referred_to_dealer"].includes(record.status));
  if (!available && !claim.data?.length && !(record.opportunity_mode === "marketplace_offer" && offer.data?.length)) return NextResponse.json({ error: "Image unavailable." }, { status: 403 });
  const url = new URL(request.url).searchParams.get("url");
  if (!url || !combineLeadImages(record as WebsiteLead).includes(`/api/website-leads/image?url=${encodeURIComponent(url)}`)) return NextResponse.json({ error: "Image unavailable." }, { status: 404 });
  return serveLeadImage(request);
}

import { NextResponse } from "next/server";
import { getDealerClaimForSession } from "@/lib/dealer-portal";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText } from "@/lib/website-leads";
import type { DealerLeadClaimStatus } from "@/types/dealer-portal";

export const dynamic = "force-dynamic";

const statuses = new Set<DealerLeadClaimStatus>(["claimed", "attempting_contact", "contacted", "offer_made", "negotiating", "agreed_to_purchase", "collection_booked", "lost", "returned_to_pool"]);
const leadStatusByClaimStatus: Partial<Record<DealerLeadClaimStatus, string>> = {
  lost: "dealer_lost",
  returned_to_pool: "dealer_returned",
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, claim } = await getDealerClaimForSession(id);
    if (!session) return NextResponse.json({ error: "Dealer portal access is not available for this user." }, { status: 401 });
    if (!claim) return NextResponse.json({ error: "Claim not found for this dealer." }, { status: 404 });
    const body = await request.json() as Record<string, unknown>;
    const status = cleanText(body.status, 60) as DealerLeadClaimStatus | null;
    if (!status || !statuses.has(status)) return NextResponse.json({ error: "Status is not available for dealer update." }, { status: 400 });
    const lostReason = status === "lost" ? cleanText(body.lost_reason, 300) : null;
    if (status === "lost" && !lostReason) return NextResponse.json({ error: "Select a lost reason." }, { status: 400 });
    const now = new Date().toISOString();
    const updates = {
      status,
      lost_reason: lostReason,
      outcome_at: status === "lost" || status === "returned_to_pool" ? now : null,
      returned_at: status === "returned_to_pool" ? now : null,
    };
    const db = getSupabaseAdminClient();
    const { data, error } = await db.from("dealer_lead_claims").update(updates).eq("id", claim.id).select("*").single();
    if (error) return NextResponse.json({ error: `Unable to update claim: ${error.message}` }, { status: 500 });
    const leadStatus = leadStatusByClaimStatus[status];
    if (leadStatus) await db.from("website_leads").update({ status: leadStatus, updated_at: now }).eq("id", claim.website_lead_id);
    await db.from("dealer_lead_notes").insert({
      website_lead_id: claim.website_lead_id,
      claim_id: claim.id,
      dealer_account_id: session.dealer.id,
      dealer_user_id: session.userId,
      note_type: "status",
      body: status === "lost" ? `Status changed to ${status}: ${lostReason}` : `Status changed to ${status}`,
    });
    await db.from("dealer_portal_audit_events").insert({
      website_lead_id: claim.website_lead_id,
      dealer_account_id: session.dealer.id,
      dealer_user_id: session.userId,
      event_type: "dealer_claim_status_updated",
      event_data: { claim_id: claim.id, status, lost_reason: lostReason },
    });
    return NextResponse.json({ claim: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update claim." }, { status: 400 });
  }
}

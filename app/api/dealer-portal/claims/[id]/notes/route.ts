import { NextResponse } from "next/server";
import { recordDealerPortalAuditEvent } from "@/lib/dealer-portal-audit";
import { getDealerClaimForSession } from "@/lib/dealer-portal";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText } from "@/lib/website-leads";

export const dynamic = "force-dynamic";

const noteTypes = new Set(["note", "call", "email", "sms", "whatsapp", "offer"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, claim } = await getDealerClaimForSession(id);
    if (!session) return NextResponse.json({ error: "Dealer portal access is not available for this user." }, { status: 401 });
    if (!claim) return NextResponse.json({ error: "Claim not found for this dealer." }, { status: 404 });
    const body = await request.json() as Record<string, unknown>;
    const noteType = cleanText(body.note_type, 30) || "note";
    const noteBody = cleanText(body.body, 3000);
    if (!noteTypes.has(noteType)) return NextResponse.json({ error: "Note type is invalid." }, { status: 400 });
    if (!noteBody) return NextResponse.json({ error: "Enter a note." }, { status: 400 });
    const { data, error } = await getSupabaseAdminClient().from("dealer_lead_notes").insert({
      website_lead_id: claim.website_lead_id,
      claim_id: claim.id,
      dealer_account_id: session.dealer.id,
      dealer_user_id: session.userId,
      note_type: noteType,
      body: noteBody,
    }).select("*").single();
    if (error) return NextResponse.json({ error: `Unable to add note: ${error.message}` }, { status: 500 });
    await recordDealerPortalAuditEvent({
      eventType: noteType === "offer" ? "dealer_offer_recorded" : "dealer_activity_added",
      websiteLeadId: claim.website_lead_id,
      dealerAccountId: session.dealer.id,
      dealerUserId: session.userId,
      eventData: {
        note_id: data.id,
        claim_id: claim.id,
        note_type: noteType,
      },
    });
    return NextResponse.json({ note: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add note." }, { status: 400 });
  }
}

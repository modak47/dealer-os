import { NextResponse } from "next/server";
import { recordDealerNotificationEvent } from "@/lib/dealer-notifications";
import { getCurrentDealerPortalAccount } from "@/lib/dealer-portal";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText, safeNumber } from "@/lib/website-leads";

export const dynamic = "force-dynamic";

function parseLeadId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function redactOfferNoteContactDetails(value: string | null) {
  if (!value) return null;
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contact hidden]")
    .replace(/(?:\+44\s?|44\s?|0)(?:\d[\s().-]?){9,13}\d/g, "[contact hidden]");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentDealerPortalAccount();
  if (!session) return NextResponse.json({ error: "Dealer portal access is not available for this user." }, { status: 401 });
  const { id: rawId } = await params;
  const id = parseLeadId(rawId);
  if (!id) return NextResponse.json({ error: "Invalid opportunity ID." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const amount = safeNumber(body.amount);
  if (amount == null || amount <= 0) return NextResponse.json({ error: "Offer amount is required." }, { status: 400 });
  const note = redactOfferNoteContactDetails(cleanText(body.note, 800));
  const { data, error } = await getSupabaseAdminClient().rpc("dealer_submit_marketplace_offer", {
    p_website_lead_id: id,
    p_dealer_account_id: session.dealer.id,
    p_dealer_user_id: session.userId,
    p_amount_pence: Math.round(amount * 100),
    p_note: note,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 409 });
  await recordDealerNotificationEvent({
    eventType: "marketplace_offer_submitted",
    dealerAccountId: session.dealer.id,
    dealerUserId: session.userId,
    websiteLeadId: id,
    payload: { offer_id: (data as { id?: string }).id, amount_pence: Math.round(amount * 100) },
    createdBy: session.userId,
  });
  return NextResponse.json({ offer: data });
}

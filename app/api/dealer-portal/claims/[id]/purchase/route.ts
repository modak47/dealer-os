import { NextResponse } from "next/server";
import { getDealerClaimForSession } from "@/lib/dealer-portal";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText, safeNumber } from "@/lib/website-leads";

export const dynamic = "force-dynamic";

function cleanDate(value: unknown) {
  const text = cleanText(value, 40);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, claim } = await getDealerClaimForSession(id);
    if (!session) return NextResponse.json({ error: "Dealer portal access is not available for this user." }, { status: 401 });
    if (!claim) return NextResponse.json({ error: "Claim not found for this dealer." }, { status: 404 });
    const body = await request.json() as Record<string, unknown>;
    const purchasePrice = safeNumber(body.purchase_price);
    const purchaseDate = cleanDate(body.purchase_date);
    const collectionDate = cleanDate(body.collection_date);
    const mileageAtPurchase = safeNumber(body.mileage_at_purchase);
    const notes = cleanText(body.notes, 3000);
    if (purchasePrice === null) return NextResponse.json({ error: "Purchase price is required." }, { status: 400 });
    if (!purchaseDate) return NextResponse.json({ error: "Purchase date is required." }, { status: 400 });
    const db = getSupabaseAdminClient();
    const purchaseType = claim.status === "lost" ? "dealer_reported_later" : "dealer_reported";
    const { data: purchase, error: purchaseError } = await db.from("dealer_purchases").insert({
      website_lead_id: claim.website_lead_id,
      claim_id: claim.id,
      dealer_account_id: session.dealer.id,
      purchase_type: purchaseType,
      purchase_price: purchasePrice,
      purchase_date: purchaseDate,
      collection_date: collectionDate,
      mileage_at_purchase: mileageAtPurchase === null ? null : Math.round(mileageAtPurchase),
      notes,
      reported_by: session.userId,
    }).select("*").single();
    if (purchaseError) return NextResponse.json({ error: `Unable to record purchase: ${purchaseError.message}` }, { status: 500 });
    const feeAmount = Number(session.dealer.successful_purchase_fee ?? 50);
    const { data: fee, error: feeError } = await db.from("dealer_purchase_fees").insert({
      purchase_id: purchase.id,
      dealer_account_id: session.dealer.id,
      website_lead_id: claim.website_lead_id,
      fee_amount: feeAmount,
      notes: "Successful Purchase Fee created from dealer portal purchase report.",
    }).select("*").single();
    if (feeError) return NextResponse.json({ error: `Purchase recorded, but fee could not be created: ${feeError.message}` }, { status: 500 });
    const now = new Date().toISOString();
    const nextStatus = purchaseType === "dealer_reported_later" ? "purchased_later" : "purchased";
    await Promise.all([
      db.from("dealer_lead_claims").update({ status: nextStatus, outcome_at: now }).eq("id", claim.id),
      db.from("website_leads").update({ status: "dealer_purchased", purchased_at: now, updated_at: now }).eq("id", claim.website_lead_id),
      db.from("dealer_lead_notes").insert({
        website_lead_id: claim.website_lead_id,
        claim_id: claim.id,
        dealer_account_id: session.dealer.id,
        dealer_user_id: session.userId,
        note_type: "status",
        body: `Purchase reported at ${purchasePrice.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })}. Successful Purchase Fee created.`,
      }),
      db.from("dealer_portal_audit_events").insert({
        website_lead_id: claim.website_lead_id,
        dealer_account_id: session.dealer.id,
        dealer_user_id: session.userId,
        event_type: "dealer_purchase_reported",
        event_data: { claim_id: claim.id, purchase_id: purchase.id, fee_id: fee.id, fee_amount: feeAmount, purchase_type: purchaseType },
      }),
    ]);
    return NextResponse.json({ purchase, fee }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record purchase." }, { status: 400 });
  }
}

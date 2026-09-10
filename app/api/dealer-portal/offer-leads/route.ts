import { NextResponse } from "next/server";
import { getCurrentDealerPortalAccount, redactLeadForDealer } from "@/lib/dealer-portal";
import { signedMarketplacePhotoUrls } from "@/lib/marketplace-photos";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { isVisualTestRequest } from "@/lib/visual-test-mode";
import { combineLeadImages } from "@/lib/website-leads";
import type { WebsiteLead } from "@/types/website-lead";

export const dynamic = "force-dynamic";

function relatedLead(value: unknown) {
  return (Array.isArray(value) ? value[0] : value) as WebsiteLead | null;
}

function visualMarketplaceFixture() {
  const lead = {
    id: 9901,
    reg: "GY23FFW",
    make: "Honda",
    model: "CBR650R",
    year: "2023",
    engine: "649",
    colour: "Red",
    mileage: "2400",
    owners: "1",
    spare_keys: "2",
    bike_condition: "Good",
    damage: "Small mark on right fairing",
    history: "Full history",
    service: "01/04/2026 / 9459 miles",
    mot: "03/04/2027",
    extras: "Heated grips",
    price: null,
    finance_information: "No outstanding finance",
    customer_message: "Runs well and is available for collection after work.",
    image1: null,
    image2: null,
    image3: null,
    image4: null,
    image5: null,
    image6: null,
    image7: null,
    image8: null,
    image9: null,
    image10: null,
    Images: null,
    images: null,
    resolved_images: ["https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1100&q=80"],
    website: "motorgeeks",
    date: "2026-09-10T10:00:00.000Z",
    created_at: "2026-09-10T10:00:00.000Z",
    updated_at: "2026-09-10T10:00:00.000Z",
    location_town: "Stevenage",
    status: "reviewing",
    opportunity_mode: "marketplace_offer",
    marketplace_status: "live_to_dealers",
    portal_location_label: "Stevenage",
    portal_distance_label: "42 miles from your dealership",
    portal_distance_miles: 42,
    customer_unlocked: false,
  };
  return {
    dealer: { id: "visual-dealer", trading_name: "DWB Trading", successful_purchase_fee: 50 },
    available: [{ allocation_id: "visual-marketplace-allocation", lead, marketplace_fee_amount: 0 }],
    offers: [{
      id: "visual-offer-1",
      website_lead_id: 9902,
      lead_id: 9902,
      amount_pence: 535000,
      note: "Subject to inspection and matching description.",
      status: "submitted",
      submitted_at: "2026-09-10T10:45:00.000Z",
      revised_at: null,
      lead: { ...lead, id: 9902, reg: "AB12CDE", make: "Yamaha", model: "MT-09", year: "2021", mileage: "6800", marketplace_status: "offer_received" },
    }],
    marketplace_fee_amount: 0,
  };
}

export async function GET(request: Request) {
  if (isVisualTestRequest(request.headers)) return NextResponse.json(visualMarketplaceFixture());
  const session = await getCurrentDealerPortalAccount();
  if (!session) return NextResponse.json({ error: "Dealer portal access is not available for this user." }, { status: 401 });
  const db = getSupabaseAdminClient();
  const [allocations, offers, feeSettings] = await Promise.all([
    db.from("dealer_lead_allocations")
      .select("id,website_lead_id,allocation_status,allocated_at,match_reasons,lead:website_leads(*)")
      .eq("dealer_account_id", session.dealer.id)
      .eq("allocation_status", "available")
      .order("allocated_at", { ascending: false }),
    db.from("dealer_offers")
      .select("*,lead:website_leads(*)")
      .eq("dealer_account_id", session.dealer.id)
      .order("submitted_at", { ascending: false }),
    db.from("marketplace_fee_settings").select("successful_purchase_fee").eq("id", true).maybeSingle(),
  ]);
  if (allocations.error) return NextResponse.json({ error: "Unable to load offer opportunities." }, { status: 500 });
  if (offers.error) return NextResponse.json({ error: "Unable to load your offers." }, { status: 500 });
  if (feeSettings.error) return NextResponse.json({ error: "Unable to load marketplace fee settings." }, { status: 500 });
  const leadIds = [
    ...((allocations.data ?? []) as unknown as Array<Record<string, unknown>>).map(row => Number(row.website_lead_id)),
    ...((offers.data ?? []) as unknown as Array<Record<string, unknown>>).map(row => Number((relatedLead(row.lead) as WebsiteLead | null)?.id)),
  ];
  const photoUrls = await signedMarketplacePhotoUrls(db, leadIds);

  function safeLead(lead: WebsiteLead) {
    return redactLeadForDealer({
      ...lead,
      resolved_images: [...(photoUrls.get(Number(lead.id)) ?? []), ...combineLeadImages(lead)],
    }, false);
  }

  const available = ((allocations.data ?? []) as unknown as Array<Record<string, unknown>>).flatMap(row => {
    const lead = relatedLead(row.lead);
    if (!lead || lead.opportunity_mode !== "marketplace_offer") return [];
    if (!["live_to_dealers", "offer_received"].includes(String(lead.marketplace_status))) return [];
    return [{
      allocation_id: row.id,
      lead: safeLead(lead),
      marketplace_fee_amount: (lead as Record<string, unknown>).marketplace_fee_amount ?? feeSettings.data?.successful_purchase_fee ?? 0,
    }];
  });
  const dealerOffers = ((offers.data ?? []) as unknown as Array<Record<string, unknown>>).flatMap(offer => {
    const lead = relatedLead(offer.lead);
    if (!lead || lead.opportunity_mode !== "marketplace_offer") return [];
    return [{
      ...offer,
      lead_id: lead.id,
      lead: safeLead(lead),
    }];
  });
  return NextResponse.json({
    dealer: session.dealer,
    available,
    offers: dealerOffers,
    marketplace_fee_amount: feeSettings.data?.successful_purchase_fee ?? 0,
  });
}

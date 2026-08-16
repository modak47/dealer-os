import { NextResponse } from "next/server";
import { getCurrentDealerPortalAccount, redactLeadForDealer } from "@/lib/dealer-portal";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { combineLeadImages } from "@/lib/website-leads";
import type { DealerLeadClaim, DealerLeadNote, DealerVisibleLead } from "@/types/dealer-portal";
import type { WebsiteLead } from "@/types/website-lead";

export const dynamic = "force-dynamic";

function relatedLead(value: unknown) {
  return (Array.isArray(value) ? value[0] : value) as WebsiteLead | null;
}

function distanceMiles(fromLat: number | null | undefined, fromLon: number | null | undefined, toLat: number | null | undefined, toLon: number | null | undefined) {
  if (![fromLat, fromLon, toLat, toLon].every(value => typeof value === "number" && Number.isFinite(value))) return null;
  const radiusMiles = 3958.8;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(Number(toLat) - Number(fromLat));
  const dLon = toRad(Number(toLon) - Number(fromLon));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(Number(fromLat))) * Math.cos(toRad(Number(toLat))) * Math.sin(dLon / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function postcodeDistrict(value: string | null | undefined) {
  return String(value ?? "").trim().split(/\s+/)[0] || null;
}

function dealerLeadMeta(lead: WebsiteLead, dealer: { latitude?: number | null; longitude?: number | null }, unlocked: boolean) {
  const distance = distanceMiles(dealer.latitude, dealer.longitude, lead.latitude, lead.longitude);
  const fullLocation = lead.location_town || lead.location_display_name || lead.normalised_postcode || lead.postcode || null;
  const approximateLocation = lead.location_town || postcodeDistrict(lead.normalised_postcode || lead.postcode);
  return {
    portal_distance_miles: distance,
    portal_distance_label: distance == null ? null : `${distance.toLocaleString("en-GB", { maximumFractionDigits: 1 })} miles from your dealership`,
    portal_location_label: unlocked ? fullLocation : approximateLocation,
  };
}

export async function GET() {
  const session = await getCurrentDealerPortalAccount();
  if (!session) return NextResponse.json({ error: "Dealer portal access is not available for this user." }, { status: 401 });
  const db = getSupabaseAdminClient();
  const [allocationsResult, claimsResult] = await Promise.all([
    db.from("dealer_lead_allocations")
      .select("id,website_lead_id,allocation_status,allocated_at,lead:website_leads(*)")
      .eq("dealer_account_id", session.dealer.id)
      .eq("allocation_status", "available")
      .order("allocated_at", { ascending: false }),
    db.from("dealer_lead_claims")
      .select("*,lead:website_leads(*)")
      .eq("dealer_account_id", session.dealer.id)
      .order("claimed_at", { ascending: false }),
  ]);
  if (allocationsResult.error) return NextResponse.json({ error: "Unable to load available leads." }, { status: 500 });
  if (claimsResult.error) return NextResponse.json({ error: "Unable to load claimed leads." }, { status: 500 });
  const claimRows = (claimsResult.data ?? []) as DealerLeadClaim[];
  const claimIds = claimRows.map(claim => claim.id);
  const notesResult = claimIds.length ? await db.from("dealer_lead_notes").select("*").in("claim_id", claimIds).order("created_at", { ascending: false }).limit(200) : { data: [], error: null };
  if (notesResult.error) return NextResponse.json({ error: "Unable to load lead notes." }, { status: 500 });
  const notesByClaim = new Map<string, DealerLeadNote[]>();
  for (const note of (notesResult.data ?? []) as DealerLeadNote[]) {
    if (!note.claim_id) continue;
    notesByClaim.set(note.claim_id, [...(notesByClaim.get(note.claim_id) ?? []), note]);
  }
  const activeClaimByLead = new Map<number, DealerLeadClaim>();
  for (const claim of claimRows) activeClaimByLead.set(Number(claim.website_lead_id), claim);
  const available = (allocationsResult.data ?? []).flatMap(row => {
    const lead = relatedLead(row.lead);
    if (!lead || activeClaimByLead.has(Number(row.website_lead_id))) return [];
    const redacted = redactLeadForDealer({ ...lead, resolved_images: combineLeadImages(lead) }, false) as DealerVisibleLead;
    return [{ ...redacted, ...dealerLeadMeta(lead, session.dealer, false), portal_allocation_id: String(row.id), customer_unlocked: false }];
  });
  const claimed = claimRows.flatMap(claim => {
    const lead = relatedLead(claim.lead);
    if (!lead) return [];
    const unlocked = Boolean(claim.customer_details_unlocked_at);
    const visible = redactLeadForDealer({ ...lead, resolved_images: combineLeadImages(lead) }, unlocked) as DealerVisibleLead;
    return [{ ...visible, ...dealerLeadMeta(lead, session.dealer, unlocked), portal_claim_id: claim.id, portal_claim_status: claim.status, portal_lost_reason: claim.lost_reason, portal_attribution_expires_at: claim.attribution_expires_at, portal_notes: notesByClaim.get(claim.id) ?? [], customer_unlocked: unlocked }];
  });
  return NextResponse.json({ dealer: session.dealer, available, claimed });
}

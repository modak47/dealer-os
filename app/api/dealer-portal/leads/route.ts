import { NextResponse } from "next/server";
import { getCurrentDealerPortalAccount, redactLeadForDealer } from "@/lib/dealer-portal";
import { normaliseVehicleCheck } from "@/lib/autotrader-vehicle-check";
import { isFullUKPostcode, normaliseUKPostcode } from "@/lib/location";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { combineLeadImages } from "@/lib/website-leads";
import type { DealerLeadClaim, DealerLeadNote, DealerVehicleCheckFlag, DealerVehicleCheckSummary, DealerVisibleLead } from "@/types/dealer-portal";
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

type Coords = { latitude: number; longitude: number };

const postcodeCache = new Map<string, Coords | null>();

function postcodeDistrict(value: string | null | undefined) {
  return String(value ?? "").trim().split(/\s+/)[0] || null;
}

function validCoords(latitude: number | null | undefined, longitude: number | null | undefined) {
  return typeof latitude === "number" && Number.isFinite(latitude) && typeof longitude === "number" && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

async function postcodeCoords(postcode: string | null | undefined) {
  const normalised = normaliseUKPostcode(postcode);
  if (!normalised || !isFullUKPostcode(normalised)) return null;
  if (postcodeCache.has(normalised)) return postcodeCache.get(normalised) ?? null;
  try {
    const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(normalised)}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const body = await response.json().catch(() => null) as { result?: { latitude?: number; longitude?: number } } | null;
    const coords = response.ok ? validCoords(body?.result?.latitude ?? null, body?.result?.longitude ?? null) : null;
    postcodeCache.set(normalised, coords);
    return coords;
  } catch {
    postcodeCache.set(normalised, null);
    return null;
  }
}

async function dealerLeadMeta(lead: WebsiteLead, dealer: { postcode?: string | null; latitude?: number | null; longitude?: number | null }, unlocked: boolean) {
  const fullLocation = lead.location_town || lead.location_display_name || lead.normalised_postcode || lead.postcode || null;
  const approximateLocation = lead.location_town || postcodeDistrict(lead.normalised_postcode || lead.postcode);
  const dealerCoords = validCoords(dealer.latitude, dealer.longitude) ?? await postcodeCoords(dealer.postcode);
  const leadCoords = validCoords(lead.latitude, lead.longitude) ?? await postcodeCoords(lead.normalised_postcode || lead.postcode);
  const distance = dealerCoords && leadCoords ? distanceMiles(dealerCoords.latitude, dealerCoords.longitude, leadCoords.latitude, leadCoords.longitude) : null;
  const missingDistanceReason = !dealerCoords ? "Dealer postcode needs checking" : !leadCoords ? "Lead postcode needed for distance" : null;
  return {
    portal_distance_miles: distance,
    portal_distance_label: distance == null ? missingDistanceReason : `${distance.toLocaleString("en-GB", { maximumFractionDigits: 1 })} miles from your dealership`,
    portal_location_label: unlocked ? fullLocation : approximateLocation,
  };
}

function flag(key: string, label: string, value: boolean | null, clearDetail: string, warningDetail: string): DealerVehicleCheckFlag {
  return {
    key,
    label,
    state: value === true ? "warning" : value === false ? "clear" : "unknown",
    detail: value === true ? warningDetail : value === false ? clearDetail : "Not returned by vehicle check",
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function dealerVehicleCheck(lead: WebsiteLead): DealerVehicleCheckSummary | null {
  if (lead.vehicle_check_status !== "checked" && !lead.autotrader_vehicle_check_data && !lead.autotrader_vehicle_lookup_data) return null;
  const checkData = objectValue(lead.autotrader_vehicle_check_data);
  const lookupData = objectValue(lead.autotrader_vehicle_lookup_data);
  const vehicle = objectValue(lookupData.vehicle);
  const check = normaliseVehicleCheck(checkData.vehicleCheck ?? checkData.check ?? checkData.history ?? lookupData.check ?? lookupData.history ?? lookupData, {
    motExpiry: textValue(vehicle.motExpiry, vehicle.motExpiryDate, vehicle.lastMOTExpiry, lead.mot),
    previousOwners: Number(textValue(vehicle.owners, objectValue(vehicle.history).previousOwners, lead.owners)) || undefined,
  });
  const details = [
    ["Registration", textValue(vehicle.registration, lead.reg)],
    ["VIN", textValue(vehicle.vin)],
    ["Engine number", textValue(vehicle.engineNumber, vehicle.engine_number)],
    ["Auto Trader vehicle ID", textValue(lead.autotrader_vehicle_id, vehicle.vehicleId, vehicle.vehicle_id, vehicle.id)],
    ["Derivative", textValue(vehicle.derivative, vehicle.derivativeId, vehicle.derivative_id)],
    ["First registered", textValue(vehicle.firstRegistrationDate)],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  return {
    status: check.status || "Vehicle check available",
    clear: check.clear,
    checked_at: lead.vehicle_check_checked_at ?? null,
    mot_expiry: check.motExpiry || null,
    report_available: Boolean(check.reportUrl),
    details: details.map(([label, value]) => ({ label, value })),
    flags: [
      flag("identity", "Identity check", check.clear === null ? null : false, "Vehicle identity data returned", "Identity needs review"),
      flag("stolen", "Stolen", check.stolen, "Not recorded stolen", "Vehicle recorded stolen"),
      flag("finance", "Finance", check.outstandingFinance, "No finance recorded", "Outstanding finance recorded"),
      flag("write_off", "Insurance write-off", check.writtenOff, "No insurance total loss recorded", check.category ? `Insurance loss recorded: ${check.category}` : "Insurance loss recorded"),
      flag("scrapped", "Scrapped", check.scrapped, "Not recorded scrapped", "Vehicle recorded scrapped"),
      flag("mileage", "Mileage", check.mileageDiscrepancy, "Mileage consistent", "Mileage discrepancy recorded"),
      flag("imported", "Imported", check.imported, "Not recorded imported", "Imported marker recorded"),
      flag("exported", "Exported", check.exported, "Not recorded exported", "Export marker recorded"),
      flag("mot", "MOT history", check.motExpiry || check.motStatus ? false : null, check.motExpiry ? `MOT expiry ${check.motExpiry}` : check.motStatus || "MOT data returned", "MOT needs review"),
    ],
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
  const available: DealerVisibleLead[] = [];
  for (const row of allocationsResult.data ?? []) {
    const lead = relatedLead(row.lead);
    if (!lead || activeClaimByLead.has(Number(row.website_lead_id))) continue;
    const redacted = redactLeadForDealer({ ...lead, resolved_images: combineLeadImages(lead) }, false) as DealerVisibleLead;
    available.push({ ...redacted, ...await dealerLeadMeta(lead, session.dealer, false), portal_vehicle_check: dealerVehicleCheck(lead), portal_allocation_id: String(row.id), customer_unlocked: false });
  }
  const claimed: DealerVisibleLead[] = [];
  for (const claim of claimRows) {
    const lead = relatedLead(claim.lead);
    if (!lead) continue;
    const unlocked = Boolean(claim.customer_details_unlocked_at);
    const visible = redactLeadForDealer({ ...lead, resolved_images: combineLeadImages(lead) }, unlocked) as DealerVisibleLead;
    claimed.push({ ...visible, ...await dealerLeadMeta(lead, session.dealer, unlocked), portal_vehicle_check: dealerVehicleCheck(lead), portal_claim_id: claim.id, portal_claim_status: claim.status, portal_lost_reason: claim.lost_reason, portal_attribution_expires_at: claim.attribution_expires_at, portal_notes: notesByClaim.get(claim.id) ?? [], customer_unlocked: unlocked });
  }
  return NextResponse.json({ dealer: session.dealer, available, claimed });
}

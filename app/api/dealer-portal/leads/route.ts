import { NextResponse } from "next/server";
import { dealerLeadSelectClause, getCurrentDealerPortalAccount, redactLeadForDealer } from "@/lib/dealer-portal";
import { normaliseVehicleCheck } from "@/lib/autotrader-vehicle-check";
import { isFullUKPostcode, normaliseUKPostcode } from "@/lib/location";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { isVisualTestRequest } from "@/lib/visual-test-mode";
import { combineLeadImages } from "@/lib/website-leads";
import type { DealerLeadClaim, DealerLeadNote, DealerMileageHistoryItem, DealerMotHistoryItem, DealerVehicleCheckFlag, DealerVehicleCheckSummary, DealerVisibleLead } from "@/types/dealer-portal";
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
const dealerVisibleAvailableStatuses = new Set(["dealer_pool_available", "dealer_allocated", "referred_to_dealer"]);

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

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function dateValue(...values: unknown[]) {
  for (const value of values) {
    const text = textValue(value);
    const match = text.match(/\d{4}-\d{2}-\d{2}/) ?? text.match(/\d{2}\/\d{2}\/\d{4}/);
    if (!match) continue;
    if (match[0].includes("/")) {
      const [day, month, year] = match[0].split("/");
      return `${year}-${month}-${day}`;
    }
    return match[0];
  }
  return "";
}

function firstObject(...values: unknown[]) {
  for (const value of values) {
    const record = objectValue(value);
    if (Object.keys(record).length > 0) return record;
  }
  return {};
}

function arraysNamed(value: unknown, names: string[], found: unknown[][] = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) arraysNamed(item, names, found);
    return found;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(child) && names.includes(key.toLowerCase())) found.push(child);
    arraysNamed(child, names, found);
  }
  return found;
}

function detailText(value: unknown): string[] {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map(item => {
    if (typeof item === "string") return item.trim();
    const record = objectValue(item);
    return textValue(record.description, record.text, record.detail, record.type, record.reason, record.comment);
  }).filter(Boolean).slice(0, 6);
}

function extractMotHistory(...sources: unknown[]): DealerMotHistoryItem[] {
  const rows = sources.flatMap(source => arraysNamed(source, ["mottests", "mot_tests", "mothistory", "tests", "results"])).flat()
    .map(item => objectValue(item))
    .filter(record => Object.keys(record).length > 0)
    .map(record => {
      const date = dateValue(record.testDate, record.completedDate, record.testCompletedDate, record.date, record.createdAt);
      const expiry = dateValue(record.expiryDate, record.motExpiryDate, record.testExpiryDate, record.expiresAt) || null;
      const result = textValue(record.result, record.testResult, record.status, record.outcome).toLowerCase();
      const status: DealerMotHistoryItem["status"] = /\bfail/.test(result) ? "fail" : /\bpass/.test(result) ? "pass" : "unknown";
      const mileage = numberValue(record.odometerReadingMiles, record.odometerValue, record.odometerReading, record.mileage, record.mileageMiles);
      const details = [
        ...detailText(record.advisories ?? record.advisoryItems),
        ...detailText(record.failures ?? record.failureItems),
        ...detailText(record.dangerousDefects),
        ...detailText(record.majorDefects),
        ...detailText(record.minorDefects),
      ];
      return { date, status, mileage, expiry, details };
    })
    .filter(row => row.date || row.mileage != null || row.details.length > 0);
  const unique = new Map<string, DealerMotHistoryItem>();
  for (const row of rows) unique.set(`${row.date}-${row.mileage ?? ""}-${row.status}`, row);
  return [...unique.values()].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 8);
}

function mileageHistory(motHistory: DealerMotHistoryItem[]): DealerMileageHistoryItem[] {
  const rows = motHistory
    .filter(row => row.mileage != null)
    .map(row => ({ date: row.date || "Unknown date", mileage: Number(row.mileage), source: "MOT" }));
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function dealerVehicleCheck(lead: WebsiteLead): DealerVehicleCheckSummary | null {
  if (lead.vehicle_check_status !== "checked" && !lead.autotrader_vehicle_check_data && !lead.autotrader_vehicle_lookup_data) return null;
  const checkData = objectValue(lead.autotrader_vehicle_check_data);
  const lookupData = objectValue(lead.autotrader_vehicle_lookup_data);
  const vehicle = objectValue(lookupData.vehicle);
  const rawCheck = firstObject(checkData.check, lookupData.check, checkData.history, lookupData.history, checkData.vehicleCheck, lookupData.vehicleCheck, checkData, lookupData);
  const check = normaliseVehicleCheck(rawCheck, {
    motExpiry: textValue(vehicle.motExpiry, vehicle.motExpiryDate, vehicle.lastMOTExpiry, lead.mot),
    previousOwners: Number(textValue(vehicle.owners, objectValue(vehicle.history).previousOwners, lead.owners)) || undefined,
  });
  const reportUrl = check.reportUrl || textValue(checkData.reportUrl, lookupData.reportUrl, vehicle.reportUrl);
  const writtenOff = check.writtenOff ?? (check.category ? true : null);
  const motHistory = extractMotHistory(checkData, lookupData, vehicle, rawCheck);
  const sellerMileage = numberValue(lead.mileage);
  const history = mileageHistory(motHistory);
  const latestMotMileage = motHistory.find(row => row.mileage != null)?.mileage ?? null;
  const mileageWarning = check.mileageDiscrepancy === true
    ? "Vehicle check reports a mileage discrepancy."
    : sellerMileage != null && latestMotMileage != null && sellerMileage + 100 < latestMotMileage
      ? "Seller declared mileage is below the latest MOT mileage."
      : null;
  const details = [
    ["Registration", textValue(vehicle.registration, lead.reg)],
    ["VIN", textValue(vehicle.vin)],
    ["Engine number", textValue(vehicle.engineNumber, vehicle.engine_number)],
    ["Auto Trader vehicle ID", textValue(lead.autotrader_vehicle_id, vehicle.vehicleId, vehicle.vehicle_id, vehicle.id)],
    ["Derivative", textValue(vehicle.derivative, vehicle.derivativeName, vehicle.derivativeId, vehicle.derivative_id)],
    ["First registered", textValue(vehicle.firstRegistrationDate)],
    ["Fuel type", textValue(vehicle.fuelType, vehicle.fuel)],
    ["Current V5C issue date", textValue(vehicle.v5cIssueDate, vehicle.v5c_date)],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  const identityReturned = details.some(([label]) => ["Registration", "VIN", "Engine number", "Auto Trader vehicle ID"].includes(label));
  return {
    status: check.status || "Vehicle check available",
    clear: check.clear,
    checked_at: lead.vehicle_check_checked_at ?? null,
    mot_expiry: check.motExpiry || null,
    report_available: Boolean(reportUrl),
    report_url: reportUrl || null,
    details: details.map(([label, value]) => ({ label, value })),
    mot_history: motHistory,
    mileage_history: history,
    seller_mileage: sellerMileage,
    mileage_warning: mileageWarning,
    flags: [
      flag("identity", "Identity check", identityReturned ? false : null, "Vehicle identity data returned", "Identity needs review"),
      flag("stolen", "Stolen", check.stolen, "Not recorded stolen", "Vehicle recorded stolen"),
      flag("finance", "Finance", check.outstandingFinance, "No finance recorded", "Outstanding finance recorded"),
      flag("write_off", "Insurance write-off", writtenOff, "No insurance total loss recorded", check.category ? `Insurance loss recorded: ${check.category}` : "Insurance loss recorded"),
      flag("scrapped", "Scrapped", check.scrapped, "Not recorded scrapped", "Vehicle recorded scrapped"),
      flag("mileage", "Mileage", check.mileageDiscrepancy, "Mileage consistent", "Mileage discrepancy recorded"),
      flag("imported", "Imported", check.imported, "Not recorded imported", "Imported marker recorded"),
      flag("exported", "Exported", check.exported, "Not recorded exported", "Export marker recorded"),
      flag("high_risk", "High risk", check.highRisk, "No high risk marker", "High risk marker recorded"),
      flag("mot", "MOT history", check.motExpiry || check.motStatus ? false : null, check.motExpiry ? `MOT expiry ${check.motExpiry}` : check.motStatus || "MOT data returned", "MOT needs review"),
    ],
  };
}

function visualDealerPortalFixture() {
  const dealer = {
    id: "visual-dealer",
    trading_name: "DWB Trading",
    limited_company_name: null,
    company_registration_number: null,
    vat_number: null,
    registered_address: null,
    trading_address: null,
    main_contact: null,
    telephone: null,
    mobile_whatsapp: null,
    main_email: "visual-test@dealeros.local",
    accounts_email: null,
    website: null,
    postcode: "BN19ET",
    latitude: null,
    longitude: null,
    autotrader_dealer_ref: null,
    account_status: "active",
    successful_purchase_fee: 50,
    attribution_period_days: 60,
    claim_expiry_hours: null,
    update_deadline_hours: null,
    internal_notes: null,
    created_at: "2026-08-01T09:00:00.000Z",
    updated_at: "2026-08-01T09:00:00.000Z",
    buying_preferences: null,
    geography_preferences: null,
  } as const;
  const check: DealerVehicleCheckSummary = {
    status: "Clear",
    clear: true,
    checked_at: "2026-08-15T11:20:00.000Z",
    mot_expiry: "22 Feb 2027",
    report_available: true,
    report_url: "https://example.com/visual-report",
    details: [
      { label: "Registration", value: "WU69UUG" },
      { label: "VIN", value: "VBKEXAMPLE1234567" },
      { label: "Engine number", value: "790DUKEVISUAL" },
      { label: "First registered", value: "2019-09-01" },
      { label: "Fuel type", value: "Petrol" },
    ],
    flags: [
      flag("identity", "Identity check", false, "Vehicle identity data returned", "Identity needs review"),
      flag("stolen", "Stolen", false, "No record", "Vehicle recorded stolen"),
      flag("finance", "Finance", false, "No finance", "Outstanding finance recorded"),
      flag("write_off", "Insurance write-off", false, "No record", "Insurance loss recorded"),
      flag("mileage", "Mileage", false, "Consistent", "Mileage discrepancy recorded"),
    ],
    mot_history: [
      { date: "2026-07-22", status: "pass", mileage: 6802, expiry: "2027-07-21", details: ["Exhaust noisy"] },
      { date: "2026-07-16", status: "fail", mileage: 6788, expiry: null, details: ["Rear tyre tread depth below requirements", "Front brake pad worn", "Exhaust noisy", "Drive chain worn but not excessive"] },
      { date: "2025-07-17", status: "pass", mileage: 6025, expiry: "2026-07-16", details: ["Rear tyre close to legal limit", "Chain adjustment advised", "Minor corrosion noted"] },
      { date: "2024-07-13", status: "pass", mileage: 4618, expiry: "2025-07-12", details: ["Exhaust noisy", "Rear brake binding slightly"] },
      { date: "2023-08-19", status: "pass", mileage: 4327, expiry: "2024-08-18", details: [] },
      { date: "2022-01-15", status: "pass", mileage: 3691, expiry: "2023-01-14", details: ["Front tyre worn close to limit"] },
    ],
    mileage_history: [
      { date: "2022", mileage: 3691, source: "MOT" },
      { date: "2023", mileage: 4327, source: "MOT" },
      { date: "2024", mileage: 4618, source: "MOT" },
      { date: "2025", mileage: 6025, source: "MOT" },
      { date: "2026", mileage: 6788, source: "MOT" },
      { date: "2026", mileage: 6802, source: "MOT" },
    ],
    seller_mileage: 5000,
    mileage_warning: null,
  };
  const lead = {
    id: 9001,
    reg: "WU69UUG",
    make: "KTM",
    model: "790 Duke",
    year: "2019",
    engine: "799",
    colour: "Black",
    mileage: "5000",
    owners: "1",
    service: "July 6th / 7,100 miles",
    history: null,
    mot: "22 Feb 2027",
    extras: "Dominator GP exhaust",
    bike_condition: "Excellent",
    damage: null,
    price: "4000",
    date: "2026-08-15T11:14:00.000Z",
    created_at: "2026-08-15T11:14:00.000Z",
    updated_at: "2026-08-15T11:14:00.000Z",
    image1: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1100&q=80",
    image2: null,
    image3: null,
    image4: null,
    image5: null,
    image6: null,
    image7: null,
    image8: null,
    image9: null,
    image10: null,
    images: null,
    resolved_images: ["https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1100&q=80"],
    owner: null,
    spare_keys: null,
    finance_information: null,
    customer_message: null,
    fname: null,
    lname: null,
    email: null,
    phone: null,
    postcode: null,
    normalised_postcode: null,
    latitude: null,
    longitude: null,
    location_display_name: null,
    location_town: "Redbridge",
    geocoding_status: null,
    geocoding_provider: null,
    location_checked_at: null,
    location_lookup_error: null,
    distance_from_yesmoto_miles: null,
    driving_distance_miles: null,
    estimated_drive_minutes: null,
    website: null,
    valuation_status: null,
    retail_estimate: null,
    suggested_offer: null,
    estimated_margin: null,
    similar_bikes: null,
    auto_trader_search: null,
    valuation_notes: null,
    "Motorway output": null,
    status: "dealer_pool_available",
    assigned_to: null,
    contacted_at: null,
    offer_made_at: null,
    purchased_at: null,
    internal_notes: null,
    portal_distance_miles: 52,
    portal_distance_label: "52 miles from your dealership",
    portal_location_label: "Redbridge",
    portal_vehicle_check: check,
    customer_unlocked: false,
  } as DealerVisibleLead;
  return { dealer, role: "dealer_admin", available: [lead], claimed: [] };
}

export async function GET(request: Request) {
  if (isVisualTestRequest(request.headers)) return NextResponse.json(visualDealerPortalFixture());
  const session = await getCurrentDealerPortalAccount();
  if (!session) return NextResponse.json({ error: "Dealer portal access is not available for this user." }, { status: 401 });
  const db = getSupabaseAdminClient();
  const [allocationsResult, claimsResult] = await Promise.all([
    db.from("dealer_lead_allocations")
      .select(`id,website_lead_id,allocation_status,allocated_at,lead:website_leads(${dealerLeadSelectClause})`)
      .eq("dealer_account_id", session.dealer.id)
      .eq("allocation_status", "available")
      .order("allocated_at", { ascending: false }),
    db.from("dealer_lead_claims")
      .select(`*,lead:website_leads(${dealerLeadSelectClause})`)
      .eq("dealer_account_id", session.dealer.id)
      .order("claimed_at", { ascending: false }),
  ]);
  if (allocationsResult.error) return NextResponse.json({ error: "Unable to load available leads." }, { status: 500 });
  if (claimsResult.error) return NextResponse.json({ error: "Unable to load claimed leads." }, { status: 500 });
  const allocationRows = (allocationsResult.data ?? []) as unknown as { id: string; website_lead_id: number; lead: unknown }[];
  const claimRows = (claimsResult.data ?? []) as unknown as DealerLeadClaim[];
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
  for (const row of allocationRows) {
    const lead = relatedLead(row.lead);
    if (!lead || activeClaimByLead.has(Number(row.website_lead_id))) continue;
    if (!dealerVisibleAvailableStatuses.has(String(lead.status ?? ""))) continue;
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
  return NextResponse.json({ dealer: session.dealer, role: session.role, available, claimed });
}

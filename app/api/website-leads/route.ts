import { requireWebsiteLeadStaff } from "@/lib/auth/website-lead-staff";
import { NextResponse } from "next/server";
import { recordDealerPortalAuditEvent } from "@/lib/dealer-portal-audit";
import { leadLocationUpdate, lookupLeadLocation } from "@/lib/location";
import { loadLeadList } from "@/lib/website-lead-list-server";
import { londonDay, londonMidnight, shiftDay } from "@/lib/website-lead-list";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { createAutomaticVehicleCheckForWebsiteLead } from "@/lib/website-lead-auto-check";
import { cleanText, isValidLeadStatus, safeNumber } from "@/lib/website-leads";
import type { WebsiteLeadStatus } from "@/types/website-lead";

export const dynamic = "force-dynamic";

function imageValue(body: Record<string, unknown>, key: string): string | null {
  return cleanText(body[key], 1000);
}

function cleanPayload(body: Record<string, unknown>) {
  const suppliedStatus = cleanText(body.status, 40);
  const status: WebsiteLeadStatus = isValidLeadStatus(suppliedStatus) ? suppliedStatus : "new";
  const images = Array.isArray(body.images) ? body.images.flatMap(value => cleanText(value, 1000) ?? []) : null;
  const now = new Date().toISOString();
  return {
    owner: cleanText(body.owner, 120),
    reg: cleanText(body.reg ?? body.registration, 30),
    make: cleanText(body.make, 80),
    model: cleanText(body.model, 120),
    year: cleanText(body.year, 20),
    engine: cleanText(body.engine, 60),
    colour: cleanText(body.colour ?? body.color, 60),
    mileage: cleanText(body.mileage, 40),
    owners: cleanText(body.owners, 40),
    spare_keys: cleanText(body.spare_keys ?? body.spareKeys, 40),
    bike_condition: cleanText(body.bike_condition ?? body.condition, 500),
    damage: cleanText(body.damage, 1000),
    history: cleanText(body.history, 1000),
    service: cleanText(body.service ?? body.service_history, 1000),
    mot: cleanText(body.mot, 120),
    extras: cleanText(body.extras, 1000),
    price: cleanText(body.price ?? body.asking_price, 80),
    fname: cleanText(body.fname ?? body.first_name, 100),
    lname: cleanText(body.lname ?? body.last_name, 100),
    email: cleanText(body.email, 160),
    phone: cleanText(body.phone ?? body.telephone, 80),
    postcode: cleanText(body.postcode, 30),
    image1: imageValue(body, "image1"),
    image2: imageValue(body, "image2"),
    image3: imageValue(body, "image3"),
    image4: imageValue(body, "image4"),
    image5: imageValue(body, "image5"),
    image6: imageValue(body, "image6"),
    image7: imageValue(body, "image7"),
    image8: imageValue(body, "image8"),
    image9: imageValue(body, "image9"),
    image10: imageValue(body, "image10"),
    website: cleanText(body.website ?? body.source, 80),
    date: cleanText(body.date, 80) ?? now,
    Images: cleanText(body.Images ?? body.legacy_images, 6000),
    valuation_status: cleanText(body.valuation_status, 80) ?? "pending",
    retail_estimate: safeNumber(body.retail_estimate),
    suggested_offer: safeNumber(body.suggested_offer),
    estimated_margin: safeNumber(body.estimated_margin),
    similar_bikes: cleanText(body.similar_bikes, 6000),
    auto_trader_search: cleanText(body.auto_trader_search, 1000),
    valuation_notes: cleanText(body.valuation_notes, 6000),
    "Motorway output": cleanText(body["Motorway output"] ?? body.motorway_output, 6000),
    images,
    status,
    assigned_to: cleanText(body.assigned_to, 120),
    internal_notes: cleanText(body.internal_notes, 6000),
    created_at: now,
    updated_at: now,
  };
}

export async function GET(request: Request) {
  if (!await requireWebsiteLeadStaff(true)) return NextResponse.json({ error: "Staff access required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const searchParams = new URL(request.url).searchParams;
  try {
    if (searchParams.get("summary") === "true" || searchParams.get("counts") === "true") {
      const day = londonDay();
      const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
      const { data, error } = await getSupabaseAdminClient().rpc("staff_website_leads_counts", {
        p_today: londonMidnight(day), p_week: londonMidnight(shiftDay(day, -((dow + 6) % 7))), p_month: londonMidnight(`${day.slice(0, 7)}-01`),
      });
      if (error) throw new Error("Website Leads migration required or counts unavailable.");
      const latest = searchParams.get("summary") === "true" ? await loadLeadList(new URLSearchParams({ limit: "5" })) : null;
      return NextResponse.json({ summary: { ...data, latestLeads: latest?.leads ?? [] } }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json(await loadLeadList(searchParams), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load website leads.";
    return NextResponse.json({ error: message }, { status: /cursor|Invalid|Start date/.test(message) ? 400 : 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const expectedSecret = process.env.WEBSITE_LEADS_WEBHOOK_SECRET;
    const providedSecret = request.headers.get("x-webhook-secret");
    if (!expectedSecret || providedSecret !== expectedSecret) {
      console.warn("Website leads webhook rejected because the secret was missing or invalid.");
      return NextResponse.json({ error: "Unauthorised webhook request." }, { status: 401 });
    }
    const body = await request.json() as Record<string, unknown>;
    const payload = cleanPayload(body);
    let locationFields: Record<string, unknown> = {};
    if (payload.postcode) {
      try {
        locationFields = leadLocationUpdate(await lookupLeadLocation({ postcode: payload.postcode }));
      } catch (locationError) {
        locationFields = {
          geocoding_status: "failed",
          location_checked_at: new Date().toISOString(),
          location_lookup_error: locationError instanceof Error ? locationError.message : "Location lookup failed.",
        };
      }
    }
    const meaningfulDetails = [payload.reg, payload.make, payload.model, payload.email, payload.phone, payload.postcode, payload.fname, payload.lname].filter(Boolean).length;
    if (!payload.reg && meaningfulDetails < 2) return NextResponse.json({ error: "Lead must include a registration or meaningful bike/customer details." }, { status: 400 });
    const { data, error } = await getSupabaseAdminClient().from("website_leads").insert({ ...payload, ...locationFields }).select("id").single();
    if (error) {
      console.error("Website leads webhook insert failed.", { code: error.code, message: error.message });
      return NextResponse.json({ error: "Unable to save website lead." }, { status: 500 });
    }
    console.info("Website lead created from webhook.", { id: data.id, source: payload.website ?? "unknown" });
    await recordDealerPortalAuditEvent({
      eventType: "master_lead_created",
      websiteLeadId: data.id,
      eventData: { source: payload.website ?? null, created_at: payload.created_at },
    });
    if (payload.reg) await createAutomaticVehicleCheckForWebsiteLead(data.id, payload);
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    console.error("Website leads webhook request failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
}

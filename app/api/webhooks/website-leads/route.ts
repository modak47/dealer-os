import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { leadLocationUpdate, lookupLeadLocation } from "@/lib/location";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { parseWebsiteLeadWebhookPayload, websiteLeadInsertPayload } from "@/lib/website-lead-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, service: "website-leads-webhook" });
}

export async function POST(request: Request) {
  const expectedSecret = process.env.WEBSITE_LEADS_WEBHOOK_SECRET;
  const providedSecret = request.headers.get("x-website-leads-secret");
  if (!isValidSecret(providedSecret, expectedSecret)) {
    console.warn("Website leads webhook rejected.", { reason: "invalid_secret" });
    return NextResponse.json({ error: "Unauthorised webhook request." }, { status: 401 });
  }
  if (!isJsonRequest(request)) return NextResponse.json({ error: "Expected application/json payload." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  let lead;
  try {
    lead = parseWebsiteLeadWebhookPayload(body);
  } catch (error) {
    const message = error instanceof ZodError ? "Invalid website lead payload." : error instanceof Error ? error.message : "Invalid website lead payload.";
    console.warn("Website leads webhook validation failed.", { message });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let locationFields: Record<string, unknown> = {};
  if (lead.postcode) {
    try {
      locationFields = leadLocationUpdate(await lookupLeadLocation({ postcode: lead.postcode }));
    } catch (error) {
      locationFields = {
        geocoding_status: "failed",
        location_checked_at: new Date().toISOString(),
        location_lookup_error: error instanceof Error ? error.message : "Location lookup failed.",
      };
    }
  }

  const supabase = getSupabaseAdminClient();
  const payload = { ...websiteLeadInsertPayload(lead), ...locationFields };
  const { data, error } = await supabase
    .from("website_leads")
    .insert(payload)
    .select("id,external_submission_id,lead_source,created_at,updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      const existing = await supabase
        .from("website_leads")
        .select("id,external_submission_id,lead_source,created_at,updated_at")
        .eq("lead_source", lead.lead_source)
        .eq("external_submission_id", lead.external_submission_id)
        .maybeSingle();
      if (!existing.error && existing.data) return NextResponse.json({ lead: existing.data, duplicate: true }, { status: 200 });
    }
    console.error("Website leads webhook save failed.", { code: error.code, message: error.message, source: lead.lead_source });
    return NextResponse.json({ error: "Unable to save website lead." }, { status: 500 });
  }

  console.info("Website lead accepted from webhook.", { id: data.id, source: lead.lead_source });
  return NextResponse.json({ lead: data }, { status: 202 });
}

function isJsonRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.toLowerCase().includes("application/json");
}

function isValidSecret(provided: string | null, expected: string | undefined) {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

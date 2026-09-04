import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { recordDealerPortalAuditEvent } from "@/lib/dealer-portal-audit";
import { leadLocationUpdate, lookupLeadLocation } from "@/lib/location";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { createAutomaticVehicleCheckForWebsiteLead } from "@/lib/website-lead-auto-check";
import { parseWebsiteLeadWebhookPayload, websiteLeadInsertPayload } from "@/lib/website-lead-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "website-leads-webhook",
    accepts: ["POST application/json"],
    requiredHeader: "x-website-leads-secret",
    secretConfigured: Boolean(process.env.WEBSITE_LEADS_WEBHOOK_SECRET),
  });
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

  const entries = webhookEntries(body);
  if (!entries.length) return NextResponse.json({ error: "Expected a lead object or an array of lead objects." }, { status: 400 });

  const supabase = getSupabaseAdminClient();
  const saved = [];
  const failed = [];

  for (const entry of entries) {
    try {
      const result = await saveWebsiteLead(entry, supabase);
      saved.push(result);
    } catch (error) {
      const message = error instanceof ZodError ? "Invalid website lead payload." : error instanceof Error ? error.message : "Invalid website lead payload.";
      console.warn("Website leads webhook validation failed.", { message, entryShape: describeWebhookEntry(entry) });
      failed.push({ error: message });
    }
  }

  if (!saved.length) return NextResponse.json({ error: failed[0]?.error ?? "Invalid website lead payload.", failed }, { status: 400 });
  if (failed.length) return NextResponse.json({ accepted: saved.length, failed: failed.length, leads: saved }, { status: 207 });

  const duplicateCount = saved.filter((item) => item.duplicate).length;
  console.info("Website lead accepted from webhook.", { accepted: saved.length, duplicates: duplicateCount });
  if (entries.length === 1) {
    const only = saved[0];
    return NextResponse.json({ lead: only.lead, duplicate: only.duplicate || undefined }, { status: only.duplicate ? 200 : 202 });
  }

  return NextResponse.json({ accepted: saved.length, duplicates: duplicateCount, leads: saved }, { status: 202 });
}

function webhookEntries(body: unknown) {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["leads", "rows", "data", "payload", "applications", "records", "items"]) {
      if (Array.isArray(record[key])) return record[key];
    }
    for (const key of ["lead", "row", "record", "application", "payload", "data"]) {
      const value = record[key];
      if (value && typeof value === "object" && !Array.isArray(value)) return [value];
    }
  }
  return [body];
}

function describeWebhookEntry(entry: unknown) {
  if (Array.isArray(entry)) return { type: "array", length: entry.length };
  if (!entry || typeof entry !== "object") return { type: typeof entry };
  const keys = Object.keys(entry as Record<string, unknown>).slice(0, 40);
  return { type: "object", keys };
}

async function saveWebsiteLead(entry: unknown, supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const lead = parseWebsiteLeadWebhookPayload(entry);
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
      if (!existing.error && existing.data) return { lead: existing.data, duplicate: true };
    }
    console.error("Website leads webhook save failed.", { code: error.code, message: error.message, source: lead.lead_source });
    throw new Error("Unable to save website lead.");
  }

  await recordDealerPortalAuditEvent({
    eventType: "master_lead_created",
    websiteLeadId: data.id,
    eventData: {
      lead_source: data.lead_source,
      external_submission_id: data.external_submission_id,
      created_at: data.created_at,
    },
  });

  if (lead.reg) await createAutomaticVehicleCheckForWebsiteLead(data.id, lead);
  return { lead: data, duplicate: false };
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

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { bikeBuyerLeadPayload, validBikeBuyerCredential } from "@/lib/bikebuyeruk-leads";
import { recordDealerPortalAuditEventBestEffort } from "@/lib/dealer-portal-audit";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const maxBytes = 32 * 1024;
const responseHeaders = { "Cache-Control": "private, no-store" };
const source = "bike_buyer_uk";

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...responseHeaders, ...extraHeaders } });
}

function authorised(request: Request) {
  return validBikeBuyerCredential(request.headers.get("authorization"), process.env.BIKEBUYERUK_LEADS_API_KEY);
}

export async function GET(request: Request) {
  if (!authorised(request)) return json({ error: "Unauthorised.", code: "unauthorised" }, 401);
  return json({ ok: true, integration: "bikebuyeruk", version: 1, accepts: "POST application/json", max_body_bytes: maxBytes, max_photos: 10,
    vrm_lookup_path: "/api/integrations/bikebuyeruk/vrm-lookup" });
}

export async function POST(request: Request) {
  if (!authorised(request)) return json({ error: "Unauthorised.", code: "unauthorised" }, 401);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Use Content-Type: application/json.", code: "unsupported_media_type" }, 415);
  }
  if (Number(request.headers.get("content-length")) > maxBytes) return tooLarge();
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return invalidJson();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return tooLarge(); }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return invalidJson(); }

  let parsed: ReturnType<typeof bikeBuyerLeadPayload>;
  try { parsed = bikeBuyerLeadPayload(body); }
  catch (error) {
    if (!(error instanceof ZodError)) return json({ error: "Invalid lead.", code: "invalid_payload" }, 400);
    return json({ error: "Check the form fields.", code: "invalid_payload", fields: error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })) }, 400);
  }
  const { payload, dryRun, hash } = parsed;
  if (dryRun) return json({ ok: true, dry_run: true, source, external_submission_id: payload.external_submission_id });

  try {
    const db = getSupabaseAdminClient();
    // Reuse the existing durable database limiter; no per-process counters.
    const limit = await db.rpc("mg_rate_limit", { p_key: "integration:bikebuyeruk:leads:v1", p_limit: 120, p_seconds: 60 });
    if (limit.error || typeof limit.data !== "boolean") throw new Error("Rate limiter unavailable");
    if (!limit.data) return json({ error: "Try again shortly.", code: "rate_limited" }, 429, { "Retry-After": "60" });

    const { data, error } = await db.from("website_leads").insert({ ...payload, opportunity_mode: "direct_claim" })
      .select("id,external_submission_id").single();
    if (error?.code === "23505") {
      const existing = await db.from("website_leads").select("id,external_submission_id,raw_payload")
        .eq("lead_source", source).eq("external_submission_id", payload.external_submission_id).maybeSingle();
      if (existing.error || !existing.data) throw new Error("Duplicate lookup failed");
      const previousHash = existing.data.raw_payload?.integration_payload_hash;
      if (previousHash !== hash) return json({ error: "This submission ID was already used with different details. A retry must send the original payload.", code: "submission_conflict" }, 409);
      return json({ ok: true, duplicate: true, source, lead: { id: existing.data.id, external_submission_id: existing.data.external_submission_id } });
    }
    if (error || !data) throw new Error("Lead insert failed");
    // The durable lead is the success boundary; an audit outage must not turn a
    // saved submission into an apparent failure for the customer.
    await recordDealerPortalAuditEventBestEffort({ eventType: "master_lead_created", websiteLeadId: data.id,
      eventData: { lead_source: source, external_submission_id: data.external_submission_id, integration: "bikebuyeruk_v1" } });
    return json({ ok: true, duplicate: false, source, lead: { id: data.id, external_submission_id: data.external_submission_id } }, 201);
  } catch {
    console.error("BikeBuyerUK lead ingestion unavailable.");
    return json({ error: "Unable to save right now. Retry the same submission ID and payload.", code: "temporarily_unavailable" }, 503, { "Retry-After": "30" });
  }
}

function invalidJson() { return json({ error: "Send a single JSON lead object.", code: "invalid_json" }, 400); }
function tooLarge() { return json({ error: "Payload exceeds 32 KiB. Send photo links rather than files.", code: "payload_too_large" }, 413); }

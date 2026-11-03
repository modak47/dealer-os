import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { validBikeBuyerCredential } from "@/lib/bikebuyeruk-leads";
import { bikeBuyerVehicleFields, bikeBuyerVrmSchema } from "@/lib/bikebuyeruk-vrm";
import { AutotraderVehicleLookupError, lookupBasicVehicleByVrm } from "@/lib/autotrader-vehicle-lookup";
import { hasAutotraderConfig } from "@/lib/autotrader";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;
const maxBytes = 1024;
const limits = { per_minute: 20, per_day: 250 };

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", ...extra } });
}
function authorised(request: Request) {
  return validBikeBuyerCredential(request.headers.get("authorization"), process.env.BIKEBUYERUK_LEADS_API_KEY);
}

export async function GET(request: Request) {
  if (!authorised(request)) return json({ ok: false, error: "Unauthorised.", code: "unauthorised" }, 401);
  return json({ ok: true, integration: "bikebuyeruk", feature: "basic_vrm_lookup", version: 1,
    lookup_configured: hasAutotraderConfig(), accepts: "POST application/json", limits });
}

export async function POST(request: Request) {
  if (!authorised(request)) return json({ ok: false, error: "Unauthorised.", code: "unauthorised" }, 401);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ ok: false, error: "Use Content-Type: application/json.", code: "unsupported_media_type" }, 415);
  }
  if (Number(request.headers.get("content-length")) > maxBytes) return tooLarge();
  let input: ReturnType<typeof bikeBuyerVrmSchema.parse>;
  try {
    const reader = request.body?.getReader();
    if (!reader) return invalidJson();
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return tooLarge(); }
      chunks.push(value);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return invalidJson(); }
    input = bikeBuyerVrmSchema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) return json({ ok: false, error: "Send a registration and optional dry_run only.", code: "invalid_vrm", manual_entry_available: true }, 400);
    return invalidJson();
  }
  const { registration, dry_run: dryRun } = input;
  if (dryRun) return json({ ok: true, dry_run: true, registration, provider_called: false });

  try {
    const db = getSupabaseAdminClient();
    for (const [window, count, seconds] of [["minute", limits.per_minute, 60], ["day", limits.per_day, 86400]] as const) {
      const result = await db.rpc("mg_rate_limit", { p_key: `integration:bikebuyeruk:vrm:v1:${window}`, p_limit: count, p_seconds: seconds });
      if (result.error || typeof result.data !== "boolean") throw new Error("Limiter unavailable");
      if (!result.data) return json({ ok: false, error: "Lookup allowance reached. You can enter the motorcycle details manually.",
        code: "rate_limited", limit_window: window, manual_entry_available: true }, 429, { "Retry-After": String(seconds) });
    }
    const vehicle = await lookupBasicVehicleByVrm(registration);
    if (vehicle.registration && vehicle.registration.replace(/\s+/g, "").toUpperCase() !== registration) throw new Error("Registration mismatch");
    return json({ ok: true, vehicle: bikeBuyerVehicleFields(vehicle, registration), manual_entry_available: true });
  } catch (error) {
    if (error instanceof AutotraderVehicleLookupError && error.code === "not_found") {
      return json({ ok: false, error: "No vehicle found for that registration. Enter the motorcycle details manually.", code: "not_found", manual_entry_available: true }, 404);
    }
    // Do not expose provider credentials, account details or upstream messages.
    return json({ ok: false, error: "Registration lookup is unavailable. Enter the motorcycle details manually or try again later.",
      code: "lookup_unavailable", manual_entry_available: true }, 503, { "Retry-After": "60" });
  }
}

function tooLarge() { return json({ ok: false, error: "Lookup payload exceeds 1 KiB.", code: "payload_too_large" }, 413); }
function invalidJson() { return json({ ok: false, error: "Send a single JSON lookup object.", code: "invalid_json" }, 400); }

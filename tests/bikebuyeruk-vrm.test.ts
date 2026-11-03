import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { AutotraderVehicleLookupError, type DealerOsVehicle } from "../lib/autotrader-vehicle-lookup";
import { bikeBuyerLeadPayload } from "../lib/bikebuyeruk-leads";

const key = "isolated-bikebuyeruk-vrm-test-key-at-least-32-characters";
const privateMarker = "PRIVATE-UPSTREAM-DETAIL-DO-NOT-RETURN";
const require = createRequire(import.meta.url);
const loader = Module as unknown as { _load: (name: string, parent: unknown, main: boolean) => unknown };
const original = loader._load;
let db: PGlite, dbCalls = 0, providerCalls = 0, unavailable = false;
let providerError: Error | null = null;
let vehicle: DealerOsVehicle = {};
const admin = { rpc: async (name: string, args: Record<string, unknown>) => {
  dbCalls++;
  if (unavailable) return { data: null, error: { message: privateMarker } };
  assert.equal(name, "mg_rate_limit");
  const data = (await db.query<{ allowed: boolean }>("select mg_rate_limit($1,$2,$3) allowed", Object.values(args))).rows[0].allowed;
  return { data, error: null };
} };
loader._load = function(name, parent, main) {
  if (name === "server-only") return {};
  if (name === "@/lib/supabase-admin") return { getSupabaseAdminClient: () => admin };
  if (name === "@/lib/autotrader-vehicle-lookup") return {
    AutotraderVehicleLookupError,
    lookupBasicVehicleByVrm: async (registration: string) => { providerCalls++; assert.equal(registration, "TEST123"); if (providerError) throw providerError; return vehicle; },
  };
  return original.call(this, name, parent, main);
};
const { GET, POST } = require("../app/api/integrations/bikebuyeruk/vrm-lookup/route") as { GET: (r: Request) => Promise<Response>; POST: (r: Request) => Promise<Response> };
loader._load = original;
function request(body: unknown = { registration: " test 123 " }, auth: string | null = `Bearer ${key}`, type = "application/json") {
  const headers: Record<string, string> = { "Content-Type": type };
  if (auth) headers.Authorization = auth;
  return new Request("https://dealeros.test/api/integrations/bikebuyeruk/vrm-lookup", { method: "POST", headers, body: JSON.stringify(body) });
}

test("BikeBuyerUK basic VRM API is scoped, redacted and durably throttled", async t => {
  const originalKey = process.env.BIKEBUYERUK_LEADS_API_KEY;
  process.env.BIKEBUYERUK_LEADS_API_KEY = key;
  db = new PGlite();
  await db.exec("create table seller_rate_windows(key text primary key,started_at timestamptz,hits int)");
  const sql = readFileSync("supabase/migrations/20260921000400_seller_journey_reliability.sql", "utf8");
  await db.exec(sql.match(/create function public.mg_rate_limit[\s\S]*?end \$\$;/)![0]);
  try {
    await t.test("invalid credentials are rejected before quota or provider calls", async () => {
      for (const auth of [null, "Bearer wrong", key]) assert.equal((await POST(request({}, auth))).status, 401);
      assert.equal((await GET(request({}, null))).status, 401);
      delete process.env.BIKEBUYERUK_LEADS_API_KEY;
      assert.equal((await POST(request())).status, 401);
      process.env.BIKEBUYERUK_LEADS_API_KEY = key;
      assert.equal(dbCalls, 0); assert.equal(providerCalls, 0);
    });
    await t.test("health and dry run never call the provider or touch lead records", async () => {
      const health = await GET(request()); assert.equal(health.status, 200);
      assert.equal((await health.json()).feature, "basic_vrm_lookup");
      const r = await POST(request({ registration: " test 123 ", dry_run: true }));
      assert.deepEqual(await r.json(), { ok: true, dry_run: true, registration: "TEST123", provider_called: false });
      assert.equal(r.headers.get("cache-control"), "private, no-store");
      assert.equal(dbCalls, 0); assert.equal(providerCalls, 0);
    });
    await t.test("invalid VRMs, unsupported fields, arrays, malformed JSON and oversized bodies fail before billing", async () => {
      for (const body of [{ registration: "" }, { registration: "A" }, { registration: "TEST!123" }, { registration: "ABCDEFGHI" }, { registration: 123 }, { registration: "TEST123", fullVehicleCheck: true }, { registration: "TEST123", advertiserId: "other" }, [{ registration: "TEST123" }]]) {
        assert.equal((await POST(request(body))).status, 400);
      }
      assert.equal((await POST(request({ registration: "TEST123" }, `Bearer ${key}`, "text/plain"))).status, 415);
      assert.equal((await POST(request({ padding: "a".repeat(1100) }))).status, 413);
      const malformed = new Request("https://dealeros.test", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: "{" });
      assert.equal((await POST(malformed)).status, 400);
      assert.equal(dbCalls, 0); assert.equal(providerCalls, 0);
    });
    await t.test("success exposes only lead-compatible form fields and never private provider data", async () => {
      vehicle = { registration: "TEST123", make: "Honda", model: "CB500F", year: 2021, engineSize: 471, colour: "Blue", vin: privateMarker, engineNumber: privateMarker,
        taxonomyData: { secret: privateMarker }, check: { raw: privateMarker }, previousOwners: 8, vehicleId: privateMarker, derivativeId: privateMarker, history: { secret: privateMarker } };
      const r = await POST(request()); assert.equal(r.status, 200);
      const result = await r.json();
      assert.deepEqual(result.vehicle, { reg: "TEST123", make: "Honda", model: "CB500F", year: 2021, engine: "471", colour: "Blue" });
      assert.doesNotMatch(JSON.stringify(result), new RegExp(privateMarker));
      // The returned vehicle object can be spread straight into the existing
      // lead contract without unknown fields or false vehicle-check claims.
      const lead = bikeBuyerLeadPayload({ ...result.vehicle, external_submission_id: "vrm-to-lead", submitted_at: "2026-10-23T10:00:00Z", mileage: 1200,
        fname: "API", lname: "Test", email: "api-test@example.invalid", phone: "07700900123", postcode: "SW1A 1AA", consent_terms: true, consent_source: "Synthetic form" }).payload;
      assert.equal(lead.lead_source, "bike_buyer_uk"); assert.equal(lead.reg, "TEST123"); assert.equal(lead.engine, "471");
      assert.equal("vehicle_check_status" in lead, false);
    });
    await t.test("not found and upstream failures preserve manual entry without exposing account errors", async () => {
      providerError = new AutotraderVehicleLookupError(privateMarker, 404, "not_found");
      let r = await POST(request()); assert.equal(r.status, 404); assert.equal((await r.json()).manual_entry_available, true);
      for (const error of [new AutotraderVehicleLookupError(privateMarker, 403, "forbidden"), new Error(privateMarker), new DOMException("Timeout", "TimeoutError")]) {
        providerError = error; r = await POST(request()); assert.equal(r.status, 503); assert.doesNotMatch(await r.text(), new RegExp(privateMarker));
      }
      providerError = null;
      vehicle.registration = "OTHER123"; r = await POST(request()); assert.equal(r.status, 503); vehicle.registration = "TEST123";
    });
    await t.test("unavailable durable limiter prevents any provider call", async () => {
      unavailable = true; const before = providerCalls;
      assert.equal((await POST(request())).status, 503); assert.equal(providerCalls, before); unavailable = false;
    });
    await t.test("concurrent requests cannot exceed the shared per-minute allowance", async () => {
      await db.exec("truncate seller_rate_windows"); const before = providerCalls;
      const results = await Promise.all(Array.from({ length: 21 }, () => POST(request())));
      assert.equal(results.filter(r => r.status === 200).length, 20); assert.equal(results.filter(r => r.status === 429).length, 1);
      assert.equal(providerCalls - before, 20);
    });
    await t.test("daily cap persists independently of minute resets", async () => {
      await db.exec("update seller_rate_windows set hits=case when key like '%:day' then 250 else 0 end,started_at=now()"); const before = providerCalls;
      const r = await POST(request()); assert.equal(r.status, 429); assert.equal((await r.json()).limit_window, "day");
      assert.equal(r.headers.get("retry-after"), "86400"); assert.equal(providerCalls, before);
    });
  } finally { await db.close(); if (originalKey === undefined) delete process.env.BIKEBUYERUK_LEADS_API_KEY; else process.env.BIKEBUYERUK_LEADS_API_KEY = originalKey; }
});

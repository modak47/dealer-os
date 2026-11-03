/* eslint-disable @typescript-eslint/no-explicit-any -- Adapter exercises real route handlers against isolated PostgreSQL. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { bikeBuyerLeadPayload } from "../lib/bikebuyeruk-leads";

export const bikeBuyerExample = {
  external_submission_id: "bbuk-test-001", submitted_at: "2026-10-21T10:00:00Z",
  fname: "API", lname: "Test", email: "api-test@example.invalid", phone: "+44 7700 900123", postcode: "SW1A 1AA",
  make: "Honda", model: "CB500", year: 2021, mileage: 1200, price: 3000,
  consent_terms: true as const, consent_marketing: false, consent_source: "BikeBuyerUK valuation form privacy notice v1",
};
const key = "isolated-bikebuyeruk-test-key-with-32-characters";
const require = createRequire(import.meta.url);
const loader = Module as unknown as { _load: (name: string, parent: unknown, main: boolean) => any };
const original = loader._load;
let db: PGlite, calls = 0, failWrite = false, failLimit = false, failAudit = false;
const admin = {
  rpc: async (name: string, args: Record<string, unknown>) => {
    calls++;
    if (failLimit) return { data: null, error: { message: "private database error" } };
    assert.equal(name, "mg_rate_limit");
    return { data: (await db.query<{ ok: boolean }>("select mg_rate_limit($1,$2,$3) ok", Object.values(args))).rows[0].ok, error: null };
  },
  from: (table: string) => {
    calls++;
    let payload: Record<string, unknown> | undefined;
    const filters: [string, unknown][] = [];
    const run = async () => {
      try {
        if ((table === "website_leads" && payload && failWrite) || (table === "dealer_portal_audit_events" && failAudit)) throw new Error("private database error");
        let rows;
        if (payload) {
          const keys = Object.keys(payload), values = Object.values(payload).map(v => v && typeof v === "object" ? JSON.stringify(v) : v);
          rows = (await db.query(`insert into ${table} (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning *`, values)).rows;
        } else rows = (await db.query(`select * from ${table} where ${filters.map(([k], i) => `${k}=$${i + 1}`).join(" and ")}`, filters.map(([, v]) => v))).rows;
        return { data: rows[0] ?? null, error: null };
      } catch (error: any) { return { data: null, error: { code: error.code, message: error.message } }; }
    };
    const query: any = { insert: (input: Record<string, unknown>) => { payload = input; return query; }, select: () => query,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return query; }, single: run, maybeSingle: run,
      then: (resolve: (result: unknown) => void) => run().then(resolve) };
    return query;
  },
};
loader._load = function(name, parent, main) {
  if (name === "server-only") return {};
  if (name === "@/lib/supabase-admin") return { getSupabaseAdminClient: () => admin };
  return original.call(this, name, parent, main);
};
const { GET, POST } = require("../app/api/integrations/bikebuyeruk/leads/route") as { GET: (r: Request) => Promise<Response>; POST: (r: Request) => Promise<Response> };
loader._load = original;
function request(body: unknown = bikeBuyerExample, authorization: string | null = `Bearer ${key}`, contentType = "application/json") {
  const headers: Record<string, string> = { "content-type": contentType };
  if (authorization) headers.authorization = authorization;
  return new Request("https://dealeros.test/api/integrations/bikebuyeruk/leads", { method: "POST", headers, body: JSON.stringify(body) });
}

test("BikeBuyerUK write-only API with isolated PostgreSQL", async t => {
  const beforeKey = process.env.BIKEBUYERUK_LEADS_API_KEY;
  process.env.BIKEBUYERUK_LEADS_API_KEY = key;
  db = new PGlite();
  const example = bikeBuyerLeadPayload(bikeBuyerExample).payload;
  const jsonFields = ["images", "raw_payload"];
  const numberFields = ["retail_estimate", "suggested_offer", "estimated_margin"];
  await db.exec(`create table website_leads(id bigint generated always as identity primary key, ${Object.keys(example).map(k => `${k} ${jsonFields.includes(k) ? "jsonb" : numberFields.includes(k) ? "numeric" : k.startsWith("consent_") && k !== "consent_source" ? "boolean" : "text"}`).join(",")},opportunity_mode text);
    create table dealer_portal_audit_events(website_lead_id bigint,dealer_account_id text,dealer_user_id text,event_type text,event_data jsonb);
    create table seller_rate_windows(key text primary key,started_at timestamptz,hits integer);`);
  const indexes = readFileSync("supabase/migrations/20260731000100_secure_website_lead_webhook.sql", "utf8");
  await db.exec(indexes.match(/create unique index if not exists website_leads_external_submission_unique_idx[\s\S]*?;/)![0]);
  const sellerSql = readFileSync("supabase/migrations/20260921000400_seller_journey_reliability.sql", "utf8");
  await db.exec(sellerSql.match(/create function public.mg_rate_limit[\s\S]*?end \$\$;/)![0]);
  try {
    await t.test("missing, incorrect, legacy and unconfigured credentials fail before database access", async () => {
      calls = 0;
      for (const auth of [null, "Bearer wrong", key]) assert.equal((await POST(request({}, auth))).status, 401);
      delete process.env.BIKEBUYERUK_LEADS_API_KEY;
      assert.equal((await POST(request())).status, 401);
      process.env.BIKEBUYERUK_LEADS_API_KEY = "short";
      assert.equal((await POST(request({}, "Bearer short"))).status, 401);
      process.env.BIKEBUYERUK_LEADS_API_KEY = key;
      assert.equal((await GET(new Request("https://dealeros.test"))).status, 401);
      assert.equal(calls, 0);
    });
    await t.test("authenticated health and dry run validate without writing or returning customer data", async () => {
      const health = await GET(request()); assert.equal(health.status, 200);
      const response = await POST(request({ ...bikeBuyerExample, dry_run: true }));
      assert.equal(response.status, 200); assert.equal((await response.json()).dry_run, true);
      assert.equal(calls, 0); assert.equal(response.headers.get("cache-control"), "private, no-store");
    });
    await t.test("invalid consent, contact, photos, numbers, unknown fields and timestamps are rejected", async () => {
      for (const change of [{ consent_terms: false }, { email: "invalid" }, { postcode: "invalid" }, { images: ["http://example.com/a.jpg"] },
        { images: Array(11).fill("https://example.com/a.jpg") }, { mileage: -1 }, { year: 1800 }, { price: "1e2" }, { source: "motorgeeks" },
        { status: "purchased" }, { submitted_at: "today" }, { external_submission_id: "" }, { consent_source: "" }, { fname: "" }]) {
        const response = await POST(request({ ...bikeBuyerExample, ...change }));
        assert.equal(response.status, 400, JSON.stringify(change));
      }
      assert.equal((await POST(request([bikeBuyerExample]))).status, 400);
      assert.equal(calls, 0);
    });
    await t.test("wrong content type, invalid JSON and oversized streamed body fail before database access", async () => {
      assert.equal((await POST(request(bikeBuyerExample, `Bearer ${key}`, "text/plain"))).status, 415);
      assert.equal((await POST(new Request("https://dealeros.test", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: "{" }))).status, 400);
      assert.equal((await POST(request({ padding: "x".repeat(33000) }))).status, 413);
      assert.equal(calls, 0);
    });
    await t.test("concurrent submissions and response-loss retries create one correctly attributed lead", async () => {
      const responses = await Promise.all([POST(request()), POST(request())]);
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 201]);
      const results = await Promise.all(responses.map(r => r.json()));
      assert.equal(results[0].lead.id, results[1].lead.id);
      const retry = await POST(request()); assert.equal(retry.status, 200); assert.equal((await retry.json()).duplicate, true);
      const rows = (await db.query<any>("select * from website_leads")).rows;
      assert.equal(rows.length, 1); assert.equal(rows[0].lead_source, "bike_buyer_uk"); assert.equal(rows[0].website, "bikebuyeruk");
      assert.equal(rows[0].status, "new"); assert.equal(rows[0].opportunity_mode, "direct_claim");
      assert.equal(rows[0].phone, "07700900123"); assert.equal(rows[0].suggested_offer, null);
      assert.equal((await db.query("select * from dealer_portal_audit_events")).rows.length, 1);
      assert.deepEqual(Object.keys(results[0].lead).sort(), ["external_submission_id", "id"]);
    });
    await t.test("changing a previously submitted payload returns 409 and never overwrites the lead", async () => {
      const r = await POST(request({ ...bikeBuyerExample, model: "Changed" })); assert.equal(r.status, 409);
      assert.equal((await db.query<any>("select model from website_leads")).rows[0].model, "CB500");
    });
    await t.test("a colliding historical feed ID without an integration fingerprint is not acknowledged as this submission", async () => {
      await db.exec("update website_leads set raw_payload='{}'");
      assert.equal((await POST(request())).status, 409);
    });
    await t.test("database outages return retryable errors without leaking database details", async () => {
      failLimit = true; assert.equal((await POST(request())).status, 503); failLimit = false;
      failWrite = true; const r = await POST(request({ ...bikeBuyerExample, external_submission_id: "write-failure" }));
      assert.equal(r.status, 503); assert.doesNotMatch(await r.text(), /private database/); failWrite = false;
    });
    await t.test("audit outages do not turn a durable saved lead into an apparent submission failure", async () => {
      failAudit = true;
      assert.equal((await POST(request({ ...bikeBuyerExample, external_submission_id: "audit-failure" }))).status, 201);
      failAudit = false;
    });
    await t.test("durable rate limiting returns a retry time", async () => {
      await db.exec("update seller_rate_windows set hits=120,started_at=now()");
      const r = await POST(request()); assert.equal(r.status, 429); assert.equal(r.headers.get("retry-after"), "60");
    });
  } finally {
    await db.close();
    if (beforeKey === undefined) delete process.env.BIKEBUYERUK_LEADS_API_KEY; else process.env.BIKEBUYERUK_LEADS_API_KEY = beforeKey;
  }
});

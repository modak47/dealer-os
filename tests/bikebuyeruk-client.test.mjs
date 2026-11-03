import assert from "node:assert/strict";
import { test } from "node:test";
import { sendToDealerOs, lookupDealerOsVrm, DealerOsError } from "../docs/examples/bikebuyeruk-dealeros-client.mjs";

test("handover client confirms delivery, keeps retries safe and distinguishes dry runs", async t => {
  const savedFetch = globalThis.fetch;
  const savedUrl = process.env.DEALEROS_BIKEBUYERUK_LEADS_URL;
  const savedKey = process.env.BIKEBUYERUK_LEADS_API_KEY;
  const savedVrmUrl = process.env.DEALEROS_BIKEBUYERUK_VRM_URL;
  process.env.DEALEROS_BIKEBUYERUK_LEADS_URL = "https://dealer-os-ten.vercel.app/api/integrations/bikebuyeruk/leads";
  process.env.BIKEBUYERUK_LEADS_API_KEY = "isolated-client-test-key-with-at-least-32-characters";
  process.env.DEALEROS_BIKEBUYERUK_VRM_URL = "https://dealer-os-ten.vercel.app/api/integrations/bikebuyeruk/vrm-lookup";
  const payload = { external_submission_id: "fixed-id", submitted_at: "2026-10-21T10:00:00Z" };
  try {
    await t.test("new and duplicate acknowledgements are accepted without changing the submitted ID", async () => {
      for (const status of [201, 200]) {
        globalThis.fetch = async (url, options) => {
          assert.equal(url.protocol, "https:"); assert.equal(options.redirect, "error");
          assert.equal(options.headers.Authorization, `Bearer ${process.env.BIKEBUYERUK_LEADS_API_KEY}`);
          assert.deepEqual(JSON.parse(options.body), { ...payload, dry_run: false });
          return Response.json({ ok: true, duplicate: status === 200, lead: { id: 1 } }, { status });
        };
        assert.equal((await sendToDealerOs(payload)).lead.id, 1);
      }
    });
    await t.test("dry run cannot be mistaken for a saved lead", async () => {
      globalThis.fetch = async () => Response.json({ ok: true, dry_run: true });
      await assert.rejects(sendToDealerOs(payload), e => e instanceof DealerOsError && e.retryable);
      assert.equal((await sendToDealerOs(payload, { dryRun: true })).dry_run, true);
    });
    await t.test("validation, authentication and conflicts require correction; throttling and outages retry", async () => {
      for (const status of [400, 401, 409, 413, 415, 429, 503]) {
        globalThis.fetch = async () => Response.json({ error: "Controlled error", code: "test", fields: [{ field: "email" }] }, { status, headers: { "Retry-After": "60" } });
        await assert.rejects(sendToDealerOs(payload), e => e instanceof DealerOsError && e.status === status && e.retryable === (status === 429 || status >= 500) && e.retryAfterSeconds === 60);
      }
    });
    await t.test("timeouts, connection loss and unreadable responses retain retryable state", async () => {
      globalThis.fetch = async () => { throw new Error("Timeout"); };
      await assert.rejects(sendToDealerOs(payload), e => e instanceof DealerOsError && e.retryable);
      globalThis.fetch = async () => new Response("unreadable");
      await assert.rejects(sendToDealerOs(payload), e => e instanceof DealerOsError && e.retryable);
    });
    await t.test("insecure or malformed endpoint configuration is rejected before sending a key", async () => {
      globalThis.fetch = async () => { assert.fail("Must not send"); };
      process.env.DEALEROS_BIKEBUYERUK_LEADS_URL = "http://dealer-os-ten.vercel.app/api/integrations/bikebuyeruk/leads";
      await assert.rejects(sendToDealerOs(payload), /supplied HTTPS/);
    });
    await t.test("lookup uses its dedicated endpoint and supports separate dry-run preflight", async () => {
      globalThis.fetch = async (url, options) => {
        assert.equal(url.pathname, "/api/integrations/bikebuyeruk/vrm-lookup");
        assert.equal(options.headers.Authorization, `Bearer ${process.env.BIKEBUYERUK_LEADS_API_KEY}`);
        const body = JSON.parse(options.body); assert.equal(body.registration, "TEST123");
        return Response.json(body.dry_run ? { ok: true, dry_run: true, registration: "TEST123", provider_called: false } : { ok: true, vehicle: { reg: "TEST123", make: "Honda" } });
      };
      assert.equal((await lookupDealerOsVrm("TEST123")).vehicle.make, "Honda");
      assert.equal((await lookupDealerOsVrm("TEST123", { dryRun: true })).provider_called, false);
    });
    await t.test("lookup not-found, throttling and outages remain distinguishable for manual entry", async () => {
      for (const status of [404, 429, 503]) {
        globalThis.fetch = async () => Response.json({ ok: false, code: "lookup_test", error: "Use manual entry" }, { status, headers: { "Retry-After": "60" } });
        await assert.rejects(lookupDealerOsVrm("TEST123"), e => e instanceof DealerOsError && e.status === status && e.code === "lookup_test");
      }
      globalThis.fetch = async () => Response.json({ ok: true, dry_run: true });
      await assert.rejects(lookupDealerOsVrm("TEST123"), e => e instanceof DealerOsError);
    });
  } finally {
    globalThis.fetch = savedFetch;
    if (savedUrl === undefined) delete process.env.DEALEROS_BIKEBUYERUK_LEADS_URL; else process.env.DEALEROS_BIKEBUYERUK_LEADS_URL = savedUrl;
    if (savedKey === undefined) delete process.env.BIKEBUYERUK_LEADS_API_KEY; else process.env.BIKEBUYERUK_LEADS_API_KEY = savedKey;
    if (savedVrmUrl === undefined) delete process.env.DEALEROS_BIKEBUYERUK_VRM_URL; else process.env.DEALEROS_BIKEBUYERUK_VRM_URL = savedVrmUrl;
  }
});

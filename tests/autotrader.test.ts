import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { clearAutotraderTokenCache, testAutotraderConnection } from "../lib/autotrader";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

afterEach(() => {
  clearAutotraderTokenCache();
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

describe("Auto Trader Connect client", () => {
  it("authenticates and checks the configured advertiser", async () => {
    process.env.AUTOTRADER_API_KEY = "sandbox-key";
    process.env.AUTOTRADER_API_SECRET = "sandbox-secret";
    process.env.AUTOTRADER_ADVERTISER_ID = "10014506";
    process.env.AUTOTRADER_API_URL = "api-sandbox.autotrader.co.uk";

    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      requests.push({ url, init });

      if (url.endsWith("/authenticate")) {
        assert.equal(init?.method, "POST");
        assert.equal(init?.body?.toString(), "key=sandbox-key&secret=sandbox-secret");
        return jsonResponse({ access_token: "token-123", expires_at: "2099-01-01T00:00:00.000Z" });
      }

      assert.equal(url, "https://api-sandbox.autotrader.co.uk/advertisers?advertiserId=10014506");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer token-123");
      return jsonResponse({
        results: [{ advertiserId: "10014506", name: "YesMoto", status: "Good" }],
        totalResults: 1,
      });
    };

    const result = await testAutotraderConnection();

    assert.equal(result.ok, true);
    assert.equal(result.apiUrl, "https://api-sandbox.autotrader.co.uk");
    assert.equal(result.advertiser?.name, "YesMoto");
    assert.equal(result.totalResults, 1);
    assert.equal(requests.length, 2);
  });
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { clearAutotraderTokenCache, testAutotraderConnection } from "../lib/autotrader";
import { lookupVehicleByVrm, normaliseAutotraderVehicle } from "../lib/autotrader-vehicle-lookup";

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

  it("normalises Auto Trader vehicle taxonomy data into the dealerOS vehicle shape", () => {
    const vehicle = normaliseAutotraderVehicle({
      registration: "AB12CDE",
      make: "Yamaha",
      model: "XMAX",
      derivative: "125 Tech MAX",
      derivativeId: "derivative-123",
      vehicleId: "vehicle-456",
      firstRegistrationDate: "2022-04-15",
      engineCapacityCC: 125,
      enginePowerBHP: 14,
      fuelType: "Petrol",
      transmissionType: "Automatic",
      bodyType: "Scooter",
      colour: "Blue",
      seats: 2,
      generation: "XMAX (2021 - 2023)",
    });

    assert.deepEqual({
      registration: vehicle.registration,
      make: vehicle.make,
      model: vehicle.model,
      derivative: vehicle.derivative,
      derivativeId: vehicle.derivativeId,
      vehicleId: vehicle.vehicleId,
      year: vehicle.year,
      engineSize: vehicle.engineSize,
      power: vehicle.power,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      bodyType: vehicle.bodyType,
      colour: vehicle.colour,
      seats: vehicle.seats,
      generation: vehicle.generation,
    }, {
      registration: "AB12CDE",
      make: "Yamaha",
      model: "XMAX",
      derivative: "125 Tech MAX",
      derivativeId: "derivative-123",
      vehicleId: "vehicle-456",
      year: 2022,
      engineSize: 125,
      power: 14,
      fuelType: "Petrol",
      transmission: "Automatic",
      bodyType: "Scooter",
      colour: "Blue",
      seats: 2,
      generation: "XMAX (2021 - 2023)",
    });
  });

  it("looks up a vehicle by VRM using the Auto Trader Vehicles API", async () => {
    process.env.AUTOTRADER_API_KEY = "sandbox-key";
    process.env.AUTOTRADER_API_SECRET = "sandbox-secret";
    process.env.AUTOTRADER_ADVERTISER_ID = "10014506";
    process.env.AUTOTRADER_API_URL = "https://api-sandbox.autotrader.co.uk";

    const requests: string[] = [];
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      requests.push(url);
      if (url.endsWith("/authenticate")) return jsonResponse({ access_token: "token-123", expires_at: "2099-01-01T00:00:00.000Z" });
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer token-123");
      assert.equal(url, "https://api-sandbox.autotrader.co.uk/vehicles?advertiserId=10014506&registration=AB12CDE");
      return jsonResponse({
        vehicle: {
          registration: "AB12CDE",
          make: "Yamaha",
          model: "XMAX",
          derivative: "125 Tech MAX",
          derivativeId: "derivative-123",
          engineCapacityCC: 125,
          fuelType: "Petrol",
          transmissionType: "Automatic",
        },
      });
    };

    const vehicle = await lookupVehicleByVrm(" ab12 cde ");

    assert.equal(vehicle.registration, "AB12CDE");
    assert.equal(vehicle.derivativeId, "derivative-123");
    assert.equal(vehicle.engineSize, 125);
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

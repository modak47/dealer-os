import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { clearAutotraderTokenCache, testAutotraderConnection } from "../lib/autotrader";
import { normaliseVehicleCheck } from "../lib/autotrader-vehicle-check";
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
      engineNumber: "E123456",
      make: "Yamaha",
      model: "XMAX",
      derivative: "125 Tech MAX",
      derivativeId: "derivative-123",
      vehicleId: "vehicle-456",
      firstRegistrationDate: "2022-04-15",
      engineCapacityCC: 125,
      enginePowerBHP: 14,
      enginePowerPS: 15,
      engineTorqueLBFT: 31,
      co2EmissionGPKM: 79,
      topSpeedMPH: 85,
      vehicleExciseDutyWithoutSupplementGBP: 59,
      gears: 6,
      lengthMM: 2145,
      widthMM: 754,
      minimumKerbWeightKG: 172,
      emissionClass: "Euro 5",
      owners: 1,
      fuelType: "Petrol",
      transmissionType: "Automatic",
      bodyType: "Scooter",
      colour: "Blue",
      seats: 2,
      generation: "XMAX (2021 - 2023)",
      motTests: [{ completedDate: "2026-01-01", expiryDate: "2027-01-01" }],
      history: { previousOwners: 1 },
    });

    assert.deepEqual({
      registration: vehicle.registration,
      engineNumber: vehicle.engineNumber,
      make: vehicle.make,
      model: vehicle.model,
      derivative: vehicle.derivative,
      derivativeId: vehicle.derivativeId,
      vehicleId: vehicle.vehicleId,
      year: vehicle.year,
      engineSize: vehicle.engineSize,
      power: vehicle.power,
      powerPs: vehicle.powerPs,
      torque: vehicle.torque,
      co2: vehicle.co2,
      roadTax: vehicle.roadTax,
      topSpeed: vehicle.topSpeed,
      gears: vehicle.gears,
      lengthMm: vehicle.lengthMm,
      widthMm: vehicle.widthMm,
      weightKg: vehicle.weightKg,
      euroEmissions: vehicle.euroEmissions,
      previousOwners: vehicle.previousOwners,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      bodyType: vehicle.bodyType,
      colour: vehicle.colour,
      seats: vehicle.seats,
      generation: vehicle.generation,
      motExpiry: vehicle.motExpiry,
      motTests: vehicle.motTests,
      history: vehicle.history,
    }, {
      registration: "AB12CDE",
      engineNumber: "E123456",
      make: "Yamaha",
      model: "XMAX",
      derivative: "125 Tech MAX",
      derivativeId: "derivative-123",
      vehicleId: "vehicle-456",
      year: 2022,
      engineSize: 125,
      power: 14,
      powerPs: 15,
      torque: 31,
      co2: 79,
      roadTax: 59,
      topSpeed: 85,
      gears: 6,
      lengthMm: 2145,
      widthMm: 754,
      weightKg: 172,
      euroEmissions: "Euro 5",
      previousOwners: 1,
      fuelType: "Petrol",
      transmission: "Automatic",
      bodyType: "Scooter",
      colour: "Blue",
      seats: 2,
      generation: "XMAX (2021 - 2023)",
      motExpiry: "2027-01-01",
      motTests: [{ completedDate: "2026-01-01", expiryDate: "2027-01-01" }],
      history: { previousOwners: 1 },
    });
  });

  it("summarises Auto Trader vehicle check markers", () => {
    const check = normaliseVehicleCheck({
      hpiStatus: "Clear",
      outstandingFinance: false,
      stolen: false,
      scrapped: false,
      writeOffCategory: "",
      plateChanges: 2,
    }, { motExpiry: "2027-02-03", previousOwners: 1 });

    assert.equal(check.clear, true);
    assert.equal(check.status, "Clear");
    assert.equal(check.outstandingFinance, false);
    assert.equal(check.stolen, false);
    assert.equal(check.plateChanges, 2);
    assert.equal(check.previousOwners, 1);
    assert.equal(check.motExpiry, "2027-02-03");
  });

  it("treats an insurance write-off category as review even when another status says clear", () => {
    const check = normaliseVehicleCheck({
      hpiStatus: "Clear",
      insuranceWriteoffCategory: "N",
      stolen: false,
      scrapped: false,
    });

    assert.equal(check.clear, false);
    assert.equal(check.status, "Category N");
    assert.equal(check.category, "N");
    assert.equal(check.writtenOff, true);
  });

  it("does not call a report-backed check clear when write-off status is missing", () => {
    const check = normaliseVehicleCheck({
      insuranceWriteoffCategory: null,
      scrapped: false,
      stolen: false,
      imported: false,
      exported: false,
      highRisk: false,
      privateFinance: false,
      tradeFinance: false,
      mileageDiscrepancy: false,
      report: "https://api-sandbox.autotrader.co.uk/vehicles/vehicle-check-report/report-id",
    });

    assert.equal(check.clear, null);
    assert.equal(check.status, "Review report");
    assert.equal(check.writtenOff, null);
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
      assert.equal(url, "https://api-sandbox.autotrader.co.uk/vehicles?advertiserId=10014506&registration=AB12CDE&motTests=true&history=true&fullVehicleCheck=true");
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
          motTests: [{ expiryDate: "2027-02-03" }],
        },
      });
    };

    const vehicle = await lookupVehicleByVrm(" ab12 cde ");

    assert.equal(vehicle.registration, "AB12CDE");
    assert.equal(vehicle.derivativeId, "derivative-123");
    assert.equal(vehicle.engineSize, 125);
    assert.equal(vehicle.motExpiry, "2027-02-03");
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

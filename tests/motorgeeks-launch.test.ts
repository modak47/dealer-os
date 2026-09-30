import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { sellerInput } from "../apps/motorleads/app/lib/seller-input";

const source = (path: string) => readFileSync(path, "utf8");

describe("MotorGeeks launch completion", () => {
  it("keeps vehicle variant, engine and fuel as separate seller fields", () => {
    const clean = sellerInput({
      vehicle: { registration: "ab12 cde", make: "Honda", model: "CBR", year: "2022", derivative: "RR", engineCapacity: "1000", fuelType: "Petrol", colour: "Red" },
    });
    assert.deepEqual(clean.vehicle, { registration: "AB12CDE", make: "Honda", model: "CBR", year: "2022", derivative: "RR", engineCapacity: "1000", fuelType: "Petrol", colour: "Red" });
    const flow = source("apps/motorleads/app/valuation/valuation-flow.tsx");
    assert.match(flow, /Variant \/ model version/);
    assert.match(flow, /Engine capacity \(cc\)/);
    assert.doesNotMatch(flow, /derivative: v, engineCapacity: v/);
  });

  it("does not present launch placeholders or fake social links", () => {
    const publicCopy = [
      "apps/motorleads/app/components/legal.tsx",
      "apps/motorleads/app/components/sections.tsx",
      "apps/motorleads/app/components/site-shell.tsx",
      "apps/motorleads/app/privacy/page.tsx",
      "apps/motorleads/app/terms/page.tsx",
      "apps/motorleads/app/cookies/page.tsx",
    ].map(source).join("\n");
    assert.doesNotMatch(publicCopy, /Draft for review|draft terms|draft cookie|dealer logos and independent review ratings/i);
    assert.doesNotMatch(source("apps/motorleads/app/components/site-shell.tsx"), /className="ml-socials"/);
  });

  it("keeps private seller routes out of public indexing", () => {
    assert.match(source("apps/motorleads/app/robots.ts"), /"\/seller\/"/);
    assert.match(source("apps/motorleads/app/not-found.tsx"), /Back to MotorGeeks/);
  });

  it("recognises an existing pending or active dealer application before inserting", () => {
    const route = source("apps/motorleads/app/api/dealer-access/route.ts");
    assert.match(route, /findExistingDealerApplication/);
    assert.match(route, /account_status: "in\.\(pending,active\)"/);
    assert.match(route, /dealerAccount\?\.duplicate/);
    assert.doesNotMatch(route, /dealer_portal_users/);
  });

  it("passes safe derivative and fuel labels to marketplace dealers without exposing the raw seller snapshot", () => {
    const route = source("app/api/dealer-portal/offer-leads/route.ts");
    const portal = source("app/dealer-portal/v4-live-client.tsx");
    assert.match(route, /portal_derivative: safeVehicleText\(vehicle\.derivative\)/);
    assert.match(route, /portal_fuel_type: safeVehicleText\(vehicle\.fuelType\)/);
    assert.match(portal, /\["Variant", lead\.portal_derivative\]/);
    assert.match(portal, /\["Fuel", lead\.portal_fuel_type\]/);
  });

  it("sends idempotent MotorGeeks offer lifecycle notifications without seller PII in dealer copy", () => {
    const offerRoute = source("app/api/dealer-portal/offer-leads/[id]/offer/route.ts");
    const dealerNotifications = source("lib/dealer-notifications.ts");
    const sellerDelivery = source("apps/motorleads/app/lib/seller-delivery.ts");
    assert.match(offerRoute, /notifySellerMarketplaceOffer/);
    assert.match(dealerNotifications, /MOTORGEEKS_INTERNAL_SECRET/);
    assert.match(dealerNotifications, /motorgeeks\.co\.uk\/api\/internal\/marketplace-notifications/);
    const internalRoute = source("apps/motorleads/app/api/internal/marketplace-notifications/route.ts");
    assert.match(internalRoute, /timingSafeEqual/);
    assert.match(internalRoute, /sendNewOfferNotification/);
    assert.match(sellerDelivery, /mg-offer-received-/);
    assert.match(sellerDelivery, /mg-offer-accepted-seller-/);
    assert.match(sellerDelivery, /mg-offer-won-/);
    assert.match(sellerDelivery, /portal\.motorgeeks\.co\.uk\/dealer-portal\/active/);
    const dealerEmail = sellerDelivery.match(/idempotencyKey:`mg-offer-won-[\s\S]*?Open Active Leads[\s\S]*?dealer-portal\/active/)?.[0] ?? "";
    assert.ok(dealerEmail);
    assert.doesNotMatch(dealerEmail, /leadResult\.data\.(?:email|mobile|telephone)/);
  });
});

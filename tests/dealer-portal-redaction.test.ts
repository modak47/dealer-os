import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  dealerClaimedCustomerLeadFields,
  dealerLeadSelectClause,
  dealerRouteSourceOnlyLeadFields,
  dealerSafeLeadFields,
  redactLeadForDealer,
  yesMotoInternalLeadFields,
} from "../lib/dealer-portal-redaction";

const websiteLeadFields = [
  "id",
  "public_id",
  "external_submission_id",
  "lead_source",
  "form_name",
  "owner",
  "reg",
  "make",
  "model",
  "year",
  "engine",
  "colour",
  "mileage",
  "owners",
  "spare_keys",
  "bike_condition",
  "damage",
  "history",
  "service",
  "mot",
  "extras",
  "price",
  "finance_information",
  "customer_message",
  "fname",
  "lname",
  "email",
  "phone",
  "postcode",
  "normalised_postcode",
  "latitude",
  "longitude",
  "location_display_name",
  "location_town",
  "geocoding_status",
  "geocoding_provider",
  "location_checked_at",
  "location_lookup_error",
  "distance_from_yesmoto_miles",
  "driving_distance_miles",
  "estimated_drive_minutes",
  "image1",
  "image2",
  "image3",
  "image4",
  "image5",
  "image6",
  "image7",
  "image8",
  "image9",
  "image10",
  "website",
  "date",
  "Images",
  "valuation_status",
  "retail_estimate",
  "suggested_offer",
  "estimated_margin",
  "similar_bikes",
  "auto_trader_search",
  "valuation_notes",
  "Motorway output",
  "retail_check_id",
  "stock_bike_id",
  "purchase_agreed_at",
  "latest_referral_id",
  "latest_referred_dealer_id",
  "latest_referred_dealer_name",
  "latest_referred_at",
  "referral_count",
  "valuation_started_at",
  "valuation_completed_at",
  "valuation_error",
  "autotrader_vehicle_id",
  "autotrader_vehicle_lookup_data",
  "autotrader_vehicle_check_data",
  "vehicle_check_status",
  "vehicle_check_checked_at",
  "vehicle_check_error",
  "images",
  "status",
  "assigned_to",
  "contacted_at",
  "offer_made_at",
  "purchased_at",
  "internal_notes",
  "raw_payload",
  "consent_marketing",
  "consent_terms",
  "consent_source",
  "submitted_at",
  "created_at",
  "updated_at",
  "resolved_images",
] as const;

const sourceOnly = new Set<string>(dealerRouteSourceOnlyLeadFields);
const internalNeverVisible = yesMotoInternalLeadFields.filter(field => !sourceOnly.has(field));

function fullLead() {
  return Object.fromEntries(websiteLeadFields.map(field => [field, `${field}-value`]));
}

describe("dealer portal lead redaction contract", () => {
  it("classifies every website lead field into one security bucket", () => {
    const classified = new Set([
      ...dealerSafeLeadFields,
      ...dealerClaimedCustomerLeadFields,
      ...yesMotoInternalLeadFields,
    ]);
    assert.deepEqual(websiteLeadFields.filter(field => !classified.has(field)), []);
  });

  it("redacts customer and YesMoto internal fields before claim", () => {
    const redacted = redactLeadForDealer(fullLead(), false);

    for (const field of dealerSafeLeadFields) assert.equal(redacted[field], `${field}-value`);
    for (const field of dealerClaimedCustomerLeadFields) {
      assert.equal(redacted[field], null);
    }
    for (const field of internalNeverVisible) assert.equal(Object.hasOwn(redacted, field), false);
  });

  it("keeps only postcode district fallback before claim when no town is available", () => {
    const redacted = redactLeadForDealer({ ...fullLead(), location_town: null }, false) as Record<string, unknown>;
    assert.equal(redacted.postcode, "postcode-value");
    assert.equal(redacted.normalised_postcode, null);
    assert.equal(redacted.latitude, null);
    assert.equal(redacted.longitude, null);
  });

  it("reveals customer fields after claim but still blocks YesMoto internal fields", () => {
    const redacted = redactLeadForDealer(fullLead(), true);

    for (const field of dealerSafeLeadFields) assert.equal(redacted[field], `${field}-value`);
    for (const field of dealerClaimedCustomerLeadFields) assert.equal(redacted[field], `${field}-value`);
    for (const field of internalNeverVisible) assert.equal(Object.hasOwn(redacted, field), false);
  });

  it("redacts telephone numbers typed into seller comments before claim", () => {
    const redacted = redactLeadForDealer({ ...fullLead(), customer_message: "Call me on 07123 456789" }, false);
    assert.equal(redacted.customer_message, "Call me on [contact hidden]");
  });

  it("redacts email addresses typed into seller comments before claim", () => {
    const redacted = redactLeadForDealer({ ...fullLead(), customer_message: "Email seller@example.com after 6pm" }, false);
    assert.equal(redacted.customer_message, "Email [contact hidden] after 6pm");
  });

  it("keeps normal seller comments readable before claim", () => {
    const redacted = redactLeadForDealer({
      ...fullLead(),
      customer_message: "Runs well, small mark on tank, service book present.",
      extras: "Akrapovic exhaust and tail tidy fitted.",
      finance_information: "Finance outstanding, settlement figure available.",
    }, false);

    assert.equal(redacted.customer_message, "Runs well, small mark on tank, service book present.");
    assert.equal(redacted.extras, "Akrapovic exhaust and tail tidy fitted.");
    assert.equal(redacted.finance_information, "Finance outstanding, settlement figure available.");
  });

  it("keeps the original seller message available after successful claim", () => {
    const original = "Call me on 07123 456789 or email seller@example.com, bike is in SW1A 1AA.";
    const redacted = redactLeadForDealer({ ...fullLead(), customer_message: original }, true);
    assert.equal(redacted.customer_message, original);
  });

  it("does not query internal commercial intelligence for the dealer leads route", () => {
    const selectedFields = new Set(dealerLeadSelectClause.split(","));
    const forbiddenQueryFields = [
      "retail_estimate",
      "suggested_offer",
      "estimated_margin",
      "similar_bikes",
      "auto_trader_search",
      "valuation_notes",
      "internal_notes",
      "raw_payload",
    ];
    for (const field of forbiddenQueryFields) assert.equal(selectedFields.has(field), false);
  });
});

describe("dealer portal leads route security boundaries", () => {
  const routeSource = readFileSync("app/api/dealer-portal/leads/route.ts", "utf8");

  it("uses the explicit dealer lead select clause instead of website_leads wildcard selection", () => {
    assert.match(routeSource, /lead:website_leads\(\$\{dealerLeadSelectClause\}\)/);
    assert.doesNotMatch(routeSource, /lead:website_leads\(\*\)/);
  });

  it("filters allocations and claims to the current dealer account", () => {
    assert.match(routeSource, /\.from\("dealer_lead_allocations"\)[\s\S]*?\.eq\("dealer_account_id", session\.dealer\.id\)/);
    assert.match(routeSource, /\.from\("dealer_lead_claims"\)[\s\S]*?\.eq\("dealer_account_id", session\.dealer\.id\)/);
  });

  it("builds unclaimed and claimed responses through the redaction helper", () => {
    assert.match(routeSource, /redactLeadForDealer\(\{ \.\.\.lead, resolved_images: combineLeadImages\(lead\) \}, false\)/);
    assert.match(routeSource, /redactLeadForDealer\(\{ \.\.\.lead, resolved_images: combineLeadImages\(lead\) \}, unlocked\)/);
  });
});

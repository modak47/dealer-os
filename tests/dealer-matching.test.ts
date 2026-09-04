import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  allocationReasonPayload,
  allocationStatusForEligibility,
  evaluateDealerEligibility,
} from "../lib/dealer-matching";
import type { DealerPortalAccountWithPreferences } from "../types/dealer-portal";

function dealer(overrides: Partial<DealerPortalAccountWithPreferences> = {}): DealerPortalAccountWithPreferences {
  return {
    id: "dealer-1",
    trading_name: "Dealer One",
    limited_company_name: null,
    company_registration_number: null,
    vat_number: null,
    registered_address: null,
    trading_address: null,
    main_contact: null,
    telephone: null,
    mobile_whatsapp: null,
    main_email: null,
    accounts_email: null,
    website: null,
    postcode: "BN1 9ET",
    latitude: 50.8225,
    longitude: -0.1372,
    autotrader_dealer_ref: null,
    account_status: "active",
    successful_purchase_fee: 50,
    attribution_period_days: 60,
    claim_expiry_hours: null,
    update_deadline_hours: null,
    internal_notes: null,
    created_at: "2026-09-04T00:00:00.000Z",
    updated_at: "2026-09-04T00:00:00.000Z",
    buying_preferences: {
      dealer_account_id: "dealer-1",
      motorcycle_types: [],
      makes_wanted: [],
      makes_excluded: [],
      models_wanted: [],
      minimum_year: null,
      maximum_age_years: null,
      minimum_value: null,
      maximum_value: null,
      maximum_mileage: null,
      minimum_engine_cc: null,
      maximum_engine_cc: null,
      accepts_non_running: false,
      accepts_insurance_category: false,
      accepts_outstanding_finance: false,
      accepts_imported: false,
      accepts_modified: false,
    },
    geography_preferences: {
      dealer_account_id: "dealer-1",
      england: true,
      wales: true,
      scotland: false,
      northern_ireland: false,
      republic_of_ireland: false,
      maximum_radius_miles: null,
    },
    ...overrides,
  };
}

function lead(overrides = {}) {
  return {
    make: "KTM",
    model: "790 Duke",
    year: "2019",
    price: "4000",
    mileage: "5,000 miles",
    engine: "799cc",
    postcode: "BN1 9ET",
    normalised_postcode: "BN1 9ET",
    location_display_name: "Brighton, England",
    location_town: "Brighton",
    latitude: 50.8225,
    longitude: -0.1372,
    autotrader_vehicle_check_data: {
      check: {
        outstandingFinance: false,
        writtenOff: false,
        imported: false,
      },
    },
    vehicle_check_status: "checked",
    ...overrides,
  };
}

function hasCode(result: ReturnType<typeof evaluateDealerEligibility>, bucket: "passed" | "excluded" | "unknown", code: string) {
  return result[bucket].some(reason => reason.code === code);
}

describe("dealer rule-based matching", () => {
  it("excludes a dealer when a known lead make is explicitly excluded", () => {
    const result = evaluateDealerEligibility(dealer({ buying_preferences: { ...dealer().buying_preferences!, makes_excluded: ["k.t.m"] } }), lead());
    assert.equal(result.eligible, false);
    assert.equal(hasCode(result, "excluded", "make_excluded"), true);
  });

  it("excludes a dealer when makes_wanted is populated and the known lead make does not match", () => {
    const result = evaluateDealerEligibility(dealer({ buying_preferences: { ...dealer().buying_preferences!, makes_wanted: ["Honda"] } }), lead());
    assert.equal(result.eligible, false);
    assert.equal(hasCode(result, "excluded", "make_wanted"), true);
  });

  it("excludes a dealer when models_wanted is populated and the known lead model does not match", () => {
    const result = evaluateDealerEligibility(dealer({ buying_preferences: { ...dealer().buying_preferences!, models_wanted: ["MT-07"] } }), lead());
    assert.equal(result.eligible, false);
    assert.equal(hasCode(result, "excluded", "model_wanted"), true);
  });

  it("applies minimum year and maximum age when the lead year is reliable", () => {
    const prefs = { ...dealer().buying_preferences!, minimum_year: 2020, maximum_age_years: 5 };
    const result = evaluateDealerEligibility(dealer({ buying_preferences: prefs }), lead({ year: "2018" }), new Date("2026-09-04T00:00:00.000Z"));
    assert.equal(result.eligible, false);
    assert.equal(hasCode(result, "excluded", "minimum_year"), true);
    assert.equal(hasCode(result, "excluded", "maximum_age_years"), true);
  });

  it("records unknown instead of excluding when configured year rules cannot be parsed", () => {
    const result = evaluateDealerEligibility(dealer({ buying_preferences: { ...dealer().buying_preferences!, minimum_year: 2020 } }), lead({ year: "unknown" }));
    assert.equal(result.eligible, true);
    assert.equal(hasCode(result, "unknown", "minimum_year"), true);
  });

  it("does not use value limits as hard exclusions in V1", () => {
    const result = evaluateDealerEligibility(dealer({ buying_preferences: { ...dealer().buying_preferences!, minimum_value: 10000, maximum_value: 12000 } }), lead({ price: "4000" }));
    assert.equal(result.eligible, true);
    assert.equal(hasCode(result, "unknown", "value_range"), true);
  });

  it("excludes a dealer when known mileage exceeds maximum mileage", () => {
    const result = evaluateDealerEligibility(dealer({ buying_preferences: { ...dealer().buying_preferences!, maximum_mileage: 20000 } }), lead({ mileage: "35,000 miles" }));
    assert.equal(result.eligible, false);
    assert.equal(hasCode(result, "excluded", "maximum_mileage"), true);
  });

  it("records unknown instead of excluding when configured mileage cannot be parsed", () => {
    const result = evaluateDealerEligibility(dealer({ buying_preferences: { ...dealer().buying_preferences!, maximum_mileage: 20000 } }), lead({ mileage: "not supplied" }));
    assert.equal(result.eligible, true);
    assert.equal(hasCode(result, "unknown", "maximum_mileage"), true);
  });

  it("applies minimum and maximum engine cc when the lead engine is reliable", () => {
    const prefs = { ...dealer().buying_preferences!, minimum_engine_cc: 900, maximum_engine_cc: 1200 };
    const result = evaluateDealerEligibility(dealer({ buying_preferences: prefs }), lead({ engine: "799cc" }));
    assert.equal(result.eligible, false);
    assert.equal(hasCode(result, "excluded", "minimum_engine_cc"), true);
  });

  it("excludes on confirmed vehicle check finance, write-off category and imported marker when not accepted", () => {
    const result = evaluateDealerEligibility(dealer(), lead({
      autotrader_vehicle_check_data: { check: { outstandingFinance: true, writtenOff: true, imported: true } },
    }));
    assert.equal(result.eligible, false);
    assert.equal(hasCode(result, "excluded", "outstanding_finance"), true);
    assert.equal(hasCode(result, "excluded", "insurance_category"), true);
    assert.equal(hasCode(result, "excluded", "imported"), true);
  });

  it("records vehicle history criteria as unknown when structured check data is missing", () => {
    const result = evaluateDealerEligibility(dealer(), lead({ autotrader_vehicle_check_data: null, vehicle_check_status: null }));
    assert.equal(result.eligible, true);
    assert.equal(hasCode(result, "unknown", "outstanding_finance"), true);
    assert.equal(hasCode(result, "unknown", "insurance_category"), true);
    assert.equal(hasCode(result, "unknown", "imported"), true);
  });

  it("does not infer motorcycle type, running status or modified status from free text", () => {
    const result = evaluateDealerEligibility(dealer(), lead({ model: "Adventure", extras: "Race exhaust fitted", damage: "Non runner" }));
    assert.equal(result.eligible, true);
    assert.equal(hasCode(result, "unknown", "motorcycle_type"), true);
    assert.equal(hasCode(result, "unknown", "running_status"), true);
    assert.equal(hasCode(result, "unknown", "modified_status"), true);
  });

  it("excludes a dealer when a confidently known region is disabled", () => {
    const result = evaluateDealerEligibility(dealer({ geography_preferences: { ...dealer().geography_preferences!, scotland: false } }), lead({ postcode: "EH1 1AA", normalised_postcode: "EH1 1AA", location_display_name: "Edinburgh, Scotland" }));
    assert.equal(result.eligible, false);
    assert.equal(hasCode(result, "excluded", "country_region"), true);
  });

  it("records country as unknown for ambiguous postcode areas", () => {
    const result = evaluateDealerEligibility(dealer(), lead({ postcode: "CH1 1AA", normalised_postcode: "CH1 1AA", location_display_name: "Chester" }));
    assert.equal(result.eligible, true);
    assert.equal(hasCode(result, "unknown", "country_region"), true);
  });

  it("excludes a dealer when known distance exceeds maximum buying radius", () => {
    const result = evaluateDealerEligibility(dealer({ geography_preferences: { ...dealer().geography_preferences!, maximum_radius_miles: 10 } }), lead({ latitude: 51.5074, longitude: -0.1278 }));
    assert.equal(result.eligible, false);
    assert.equal(hasCode(result, "excluded", "maximum_radius"), true);
  });

  it("records radius as unknown when coordinates are unavailable", () => {
    const result = evaluateDealerEligibility(dealer({ geography_preferences: { ...dealer().geography_preferences!, maximum_radius_miles: 10 } }), lead({ latitude: null, longitude: null }));
    assert.equal(result.eligible, true);
    assert.equal(hasCode(result, "unknown", "maximum_radius"), true);
  });

  it("keeps excluded direct or selected-group dealer allocations available through manual override", () => {
    const result = evaluateDealerEligibility(dealer({ buying_preferences: { ...dealer().buying_preferences!, makes_excluded: ["KTM"] } }), lead());
    assert.equal(result.eligible, false);
    assert.equal(allocationStatusForEligibility(result, true), "available");
    assert.deepEqual(allocationReasonPayload(result, true).warnings, result.excluded);
  });

  it("marks excluded matching-pool dealer allocations as excluded without scoring", () => {
    const result = evaluateDealerEligibility(dealer({ buying_preferences: { ...dealer().buying_preferences!, makes_excluded: ["KTM"] } }), lead());
    assert.equal(allocationStatusForEligibility(result, false), "excluded");
  });
});

describe("dealer matching release route integration", () => {
  const routeSource = readFileSync("app/api/dealer-portal/admin/release/route.ts", "utf8");

  it("evaluates dealer eligibility during release", () => {
    assert.match(routeSource, /evaluateDealerEligibility\(dealer, matchingLead\)/);
  });

  it("filters open matching pool to eligible dealers before release succeeds", () => {
    assert.match(routeSource, /method === "matching_pool" && !requestedDealerIds\.length[\s\S]*?evaluatedDealers\.filter\(item => item\.eligibility\.eligible\)/);
  });

  it("does not populate percentage match scores for V1", () => {
    assert.match(routeSource, /match_score: null/);
  });
});

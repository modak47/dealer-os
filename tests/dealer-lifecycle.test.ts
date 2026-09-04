import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  cleanDealerLostReason,
  dealerLostReasons,
  dealerPreviouslyHandledClaim,
  isInsideAttributionPeriod,
  requiresPurchasedLaterDecision,
} from "../lib/dealer-portal-lifecycle";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("dealer lost and return lifecycle", () => {
  const statusRoute = source("app/api/dealer-portal/claims/[id]/route.ts");
  const releaseRoute = source("app/api/dealer-portal/admin/release/route.ts");
  const leadsRoute = source("app/api/dealer-portal/leads/route.ts");

  it("accepts only the original brief lost reasons", () => {
    for (const reason of dealerLostReasons) assert.equal(cleanDealerLostReason(reason), reason);
    assert.equal(cleanDealerLostReason("Random made-up reason"), null);
    assert.equal(cleanDealerLostReason("couldn’t agree price"), "Couldn't agree price");
  });

  it("rejects invalid lost reasons server-side", () => {
    assert.match(statusRoute, /cleanDealerLostReason\(cleanText\(body\.lost_reason, 300\)\)/);
    assert.match(statusRoute, /Select a valid lost reason/);
  });

  it("accepts valid lost reasons and records the lost audit event", () => {
    assert.match(statusRoute, /event_type: status === "lost" \? "dealer_claim_lost"/);
    assert.match(statusRoute, /lost_reason_detail/);
  });

  it("does not create a successful purchase fee when marking a claim lost", () => {
    assert.doesNotMatch(statusRoute, /dealer_purchase_fees/);
  });

  it("marks returned claims without deleting the previous claim relationship", () => {
    assert.match(statusRoute, /returned_at: status === "returned_to_pool" \? now : null/);
    assert.match(statusRoute, /event_type: status === "lost" \? "dealer_claim_lost" : status === "returned_to_pool" \? "dealer_claim_returned"/);
    assert.doesNotMatch(statusRoute, /\.delete\(/);
  });

  it("keeps subsequent dealer notes scoped to their own claim ids", () => {
    assert.match(leadsRoute, /\.from\("dealer_lead_claims"\)[\s\S]*?\.eq\("dealer_account_id", session\.dealer\.id\)/);
    assert.match(leadsRoute, /\.from\("dealer_lead_notes"\)\.select\("\*"\)\.in\("claim_id", claimIds\)/);
  });

  it("excludes previous lost or returned dealers from normal reallocation", () => {
    assert.equal(dealerPreviouslyHandledClaim({ status: "lost" }), true);
    assert.equal(dealerPreviouslyHandledClaim({ status: "returned_to_pool" }), true);
    assert.equal(dealerPreviouslyHandledClaim({ status: "claimed" }), false);
    assert.match(releaseRoute, /\.in\("status", \["lost", "returned_to_pool"\]\)/);
    assert.match(releaseRoute, /previousDealerIds\.has\(item\.dealer\.id\)/);
    assert.match(releaseRoute, /allocation_status: previousDealer && !reclaimOverride \? "excluded"/);
  });

  it("requires and audits explicit staff override for a selected previous dealer", () => {
    assert.match(releaseRoute, /allow_previous_dealer_reclaim/);
    assert.match(releaseRoute, /previous_dealer_reclaim_override/);
    assert.match(releaseRoute, /previous_dealer_reclaim_override_recorded/);
    assert.match(releaseRoute, /previous_dealer_override_ids/);
  });

  it("uses the existing eligibility engine for returned matching-pool release", () => {
    assert.match(releaseRoute, /evaluateDealerEligibility\(dealer, matchingLead\)/);
    assert.match(releaseRoute, /allocationStatusForEligibility\(eligibility, manualOverride\)/);
    assert.match(releaseRoute, /match_score: null/);
  });
});

describe("dealer purchased later and attribution", () => {
  const purchaseRoute = source("app/api/dealer-portal/claims/[id]/purchase/route.ts");

  it("requires the original brief purchased-later fields", () => {
    assert.match(purchaseRoute, /Purchase price is required/);
    assert.match(purchaseRoute, /Purchase date is required/);
    assert.match(purchaseRoute, /Collection date is required for Purchased Later/);
    assert.match(purchaseRoute, /Mileage at purchase is required for Purchased Later/);
    assert.match(purchaseRoute, /Notes are required for Purchased Later/);
  });

  it("allows purchased later only inside the stored attribution period", () => {
    assert.equal(isInsideAttributionPeriod({ attribution_expires_at: "2026-09-05T00:00:00.000Z" }, new Date("2026-09-04T00:00:00.000Z")), true);
    assert.equal(isInsideAttributionPeriod({ attribution_expires_at: "2026-09-03T00:00:00.000Z" }, new Date("2026-09-04T00:00:00.000Z")), false);
    assert.equal(requiresPurchasedLaterDecision({ status: "lost", attribution_expires_at: "2026-09-03T00:00:00.000Z" }, new Date("2026-09-04T00:00:00.000Z")), true);
    assert.match(purchaseRoute, /requiresPurchasedLaterDecision\(claim\)/);
  });

  it("creates the correct purchase, status and successful purchase fee inside attribution", () => {
    assert.match(purchaseRoute, /purchaseType = claim\.status === "lost" \? "dealer_reported_later" : "dealer_reported"/);
    assert.match(purchaseRoute, /nextStatus = purchaseType === "dealer_reported_later" \? "purchased_later" : "purchased"/);
    assert.match(purchaseRoute, /\.from\("dealer_purchase_fees"\)\.insert/);
    assert.match(purchaseRoute, /feeAmount = Number\(session\.dealer\.successful_purchase_fee \?\? 50\)/);
    assert.match(purchaseRoute, /dealer_purchased_later_reported/);
    assert.match(purchaseRoute, /attribution_within_period/);
  });

  it("keeps dealership isolation through claim-scoped purchase reporting", () => {
    assert.match(purchaseRoute, /getDealerClaimForSession\(id\)/);
  });
});

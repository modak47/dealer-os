import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { calculateFeeAmounts, effectiveCharge, outstandingAmount } from "../lib/dealer-fees";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("dealer successful purchase fee calculations", () => {
  it("derives effective charge from fee plus adjustments minus credits", () => {
    assert.equal(effectiveCharge({ fee_amount: 50, adjustment_amount: 10, credit_amount: 15 }), 45);
  });

  it("supports partial, multiple and full staff-recorded payments", () => {
    assert.equal(outstandingAmount({ fee_amount: 50, adjustment_amount: 10, credit_amount: 15, paid_amount: 20 }), 25);
    assert.deepEqual(calculateFeeAmounts({ fee_amount: 50, adjustment_amount: 10, credit_amount: 15, paid_amount: 45, status: "invoiced", invoiced_at: "2026-09-04T09:00:00.000Z" }), {
      effective_charge: 45,
      paid_amount: 45,
      outstanding_amount: 0,
      status: "paid",
    });
  });

  it("stops credits from creating a negative dealer credit balance", () => {
    assert.throws(() => calculateFeeAmounts({ fee_amount: 50, adjustment_amount: 0, credit_amount: 51, paid_amount: 0, status: "pending_invoice", invoiced_at: null }), /credit balances are not supported/i);
  });
});

describe("dealer successful purchase fee persistence contract", () => {
  const migration = source("supabase/migrations/20260904000200_dealer_purchase_fee_ledger.sql");
  const purchaseRoute = source("app/api/dealer-portal/claims/[id]/purchase/route.ts");
  const statusRoute = source("app/api/dealer-portal/claims/[id]/route.ts");
  const staffFeeRoute = source("app/api/dealer-portal/admin/fees/[id]/route.ts");
  const dealerPaymentsRoute = source("app/api/dealer-portal/payments/route.ts");

  it("adds database-level duplicate protection for one purchase per claim and one fee per purchase", () => {
    assert.match(migration, /dealer_purchase_fees_purchase_unique_idx/);
    assert.match(migration, /on public\.dealer_purchase_fees\(purchase_id\)/);
    assert.match(migration, /dealer_purchases_claim_unique_idx/);
    assert.match(migration, /on public\.dealer_purchases\(claim_id\)/);
  });

  it("creates a ledger entry when a Successful Purchase Fee is created", () => {
    assert.match(purchaseRoute, /\.from\("dealer_purchases"\)[\s\S]*\.eq\("claim_id", claim\.id\)[\s\S]*\.maybeSingle\(\)/);
    assert.match(purchaseRoute, /Purchase has already been reported for this claim/);
    assert.match(purchaseRoute, /feeAmount = Number\(session\.dealer\.successful_purchase_fee \?\? 50\)/);
    assert.match(purchaseRoute, /\.from\("dealer_fee_ledger_entries"\)\.insert\(\{[\s\S]*entry_type: "fee_created"/);
  });

  it("does not create a Successful Purchase Fee for Lost or Returned outcomes", () => {
    assert.doesNotMatch(statusRoute, /dealer_purchase_fees/);
    assert.match(statusRoute, /status === "lost"/);
    assert.match(statusRoute, /status === "returned_to_pool"/);
  });

  it("requires staff for fee mutations and records ledger plus audit history", () => {
    assert.match(staffFeeRoute, /requireStaffUser/);
    assert.match(staffFeeRoute, /dealer_fee_ledger_entries/);
    assert.match(staffFeeRoute, /dealer_portal_audit_events/);
    assert.match(staffFeeRoute, /marked_invoiced/);
    assert.match(staffFeeRoute, /payment_recorded/);
    assert.match(staffFeeRoute, /credit_applied/);
    assert.match(staffFeeRoute, /adjustment_applied/);
    assert.match(staffFeeRoute, /voided/);
  });

  it("keeps the dealer account endpoint read-only and scoped to the current dealership", () => {
    assert.match(dealerPaymentsRoute, /getCurrentDealerPortalAccount/);
    assert.match(dealerPaymentsRoute, /\.eq\("dealer_account_id", session\.dealer\.id\)/);
    assert.doesNotMatch(dealerPaymentsRoute, /export async function (POST|PATCH|PUT|DELETE)/);
  });
});

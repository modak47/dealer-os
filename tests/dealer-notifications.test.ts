import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  activeDealerUserEmailRecipients,
  buildDealerSafeLeadNotificationPayload,
  buildLeadOpportunityMessage,
  commercialEmailRecipient,
  notificationDedupeKey,
  normaliseWhatsAppDestination,
} from "../lib/dealer-notification-content";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("dealer notification content contract", () => {
  it("builds new-lead payloads from dealer-safe fields only", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://dealers.yesmoto.co.uk";
    const payload = buildDealerSafeLeadNotificationPayload({
      id: 42,
      year: 2019,
      make: "KTM",
      model: "790 Duke",
      mileage: "5,000 miles",
      location_town: "Redbridge",
      phone: "07123 456789",
      email: "seller@example.com",
      postcode: "IG1 1AA",
      latitude: 51.5,
      longitude: -0.1,
      retail_estimate: 6500,
      suggested_offer: 3500,
      estimated_margin: 2000,
      valuation_notes: "Internal",
      internal_notes: "Do not show",
    } as never, 52.23);
    assert.deepEqual(Object.keys(payload).sort(), [
      "approximate_distance_miles",
      "approximate_location",
      "dealer_portal_url",
      "lead_id",
      "make",
      "mileage",
      "model",
      "year",
    ].sort());
    assert.equal(payload.approximate_location, "Redbridge");
    assert.equal(payload.approximate_distance_miles, 52.2);
    assert.equal(JSON.stringify(payload).includes("07123"), false);
    assert.equal(JSON.stringify(payload).includes("seller@example.com"), false);
    assert.equal(JSON.stringify(payload).includes("IG1 1AA"), false);
    assert.equal(JSON.stringify(payload).includes("6500"), false);
    assert.equal(JSON.stringify(payload).includes("Internal"), false);
  });

  it("keeps lead opportunity email content free of customer contact and internal intelligence", () => {
    const message = buildLeadOpportunityMessage({
      id: 42,
      year: 2019,
      make: "KTM",
      model: "790 Duke",
      mileage: "5,000 miles",
      location_town: "Redbridge",
      phone: "07123 456789",
      email: "seller@example.com",
      postcode: "IG1 1AA",
      retail_estimate: 6500,
      suggested_offer: 3500,
    } as never, 52);
    assert.match(message.body, /2019 KTM 790 Duke/);
    assert.match(message.body, /Redbridge/);
    assert.doesNotMatch(message.body, /07123|seller@example\.com|IG1 1AA|6500|3500/);
  });

  it("sends opportunity emails to active dealer users with duplicate emails removed", () => {
    const recipients = activeDealerUserEmailRecipients([
      { user_id: "user-1", active: true, email: "SALES@dealer.test" },
      { user_id: "user-2", active: true, email: "sales@dealer.test" },
      { user_id: "user-3", active: false, email: "owner@dealer.test" },
      { user_id: "user-4", active: true, email: "not-an-email" },
    ] as never);
    assert.deepEqual(recipients, [{ dealerUserId: "user-1", destination: "sales@dealer.test" }]);
  });

  it("targets commercial email to accounts_email with main_email fallback", () => {
    assert.equal(commercialEmailRecipient({ accounts_email: "accounts@dealer.test", main_email: "sales@dealer.test" } as never), "accounts@dealer.test");
    assert.equal(commercialEmailRecipient({ accounts_email: "", main_email: "sales@dealer.test" } as never), "sales@dealer.test");
    assert.equal(commercialEmailRecipient({ accounts_email: "", main_email: "" } as never), null);
  });

  it("normalises WhatsApp destinations but does not imply automated provider delivery", () => {
    assert.equal(normaliseWhatsAppDestination("07123 456789"), "+447123456789");
    assert.equal(normaliseWhatsAppDestination("+44 7123 456789"), "+447123456789");
    assert.equal(normaliseWhatsAppDestination(""), null);
  });

  it("creates deterministic dedupe keys", () => {
    assert.equal(notificationDedupeKey(["New_Suitable_Lead", "EMAIL", "ALLOC-1", "Sales@Dealer.test"]), "new_suitable_lead:email:alloc-1:sales@dealer.test");
  });
});

describe("dealer notification persistence and route integration", () => {
  const migration = source("supabase/migrations/20260904000300_dealer_portal_notifications.sql");
  const service = source("lib/dealer-notifications.ts");
  const releaseRoute = source("app/api/dealer-portal/admin/release/route.ts");
  const claimRoute = source("app/api/dealer-portal/leads/[id]/claim/route.ts");
  const statusRoute = source("app/api/dealer-portal/claims/[id]/route.ts");
  const purchaseRoute = source("app/api/dealer-portal/claims/[id]/purchase/route.ts");

  it("adds a durable notification table with uniqueness and dealer isolation policy", () => {
    assert.match(migration, /create table if not exists public\.dealer_portal_notifications/);
    assert.match(migration, /dedupe_key text not null/);
    assert.match(migration, /dealer_portal_notifications_dedupe_key_unique unique \(dedupe_key\)/);
    assert.match(migration, /channel in \('email','whatsapp','event'\)/);
    assert.match(migration, /status in \('queued','sent','failed','not_configured','skipped'\)/);
    assert.match(migration, /Dealer users read own dealer portal notifications/);
    assert.match(migration, /dpu\.dealer_account_id = dealer_portal_notifications\.dealer_account_id/);
  });

  it("uses the notification service and Resend without duplicating provider logic in lifecycle routes", () => {
    assert.match(service, /fetch\("https:\/\/api\.resend\.com\/emails"/);
    assert.match(service, /process\.env\.RESEND_API_KEY/);
    assert.match(service, /process\.env\.RESEND_FROM_EMAIL/);
    assert.doesNotMatch(releaseRoute + claimRoute + statusRoute + purchaseRoute, /https:\/\/api\.resend\.com\/emails/);
  });

  it("notifies only available allocations produced by the release and matching flow", () => {
    assert.match(releaseRoute, /notifyDealerLeadAllocation/);
    assert.match(releaseRoute, /\.filter\(allocation => allocation\.allocation_status === "available"\)/);
    assert.match(releaseRoute, /evaluateDealerEligibility\(dealer, matchingLead\)/);
    assert.match(releaseRoute, /allocationStatusForEligibility\(eligibility, manualOverride\)/);
  });

  it("records claim success and failed already-claimed attempts without delivery or customer data", () => {
    assert.match(claimRoute, /recordClaimNotificationEvent/);
    assert.match(claimRoute, /result: "already_claimed"/);
    assert.match(claimRoute, /result: "claimed"/);
    assert.match(service, /event_type: input\.result === "claimed" \? "lead_claimed" : "claim_already_claimed"/);
    assert.match(service, /buildClaimEventPayload/);
    assert.doesNotMatch(service, /customer_email|customer_phone|fname|lname|postcode/);
  });

  it("records return, purchase and Successful Purchase Fee notification events", () => {
    assert.match(statusRoute, /eventType: "lead_returned"/);
    assert.match(purchaseRoute, /eventType: "purchase_reported"/);
    assert.match(purchaseRoute, /notifySuccessfulPurchaseFeeCreated/);
    assert.match(service, /event_type: "successful_purchase_fee_created"/);
  });

  it("records missing WhatsApp provider as not_configured and does not open wa.me server-side", () => {
    assert.match(service, /channel: "whatsapp"/);
    assert.match(service, /status: whatsapp \? "not_configured" : "skipped"/);
    assert.doesNotMatch(service, /wa\.me|api\.twilio|graph\.facebook/);
  });

  it("treats delivery as best-effort and suppresses duplicate retries", () => {
    assert.match(service, /bestEffort/);
    assert.match(service, /error\.code === "23505"/);
    assert.match(service, /duplicate: true/);
    assert.match(service, /if \(inserted\.duplicate/);
  });
});

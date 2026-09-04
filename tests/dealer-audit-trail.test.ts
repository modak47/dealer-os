import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("dealer portal audit helper", () => {
  it("standardises dealer portal audit event writes", () => {
    const helper = source("lib/dealer-portal-audit.ts");
    assert.match(helper, /recordDealerPortalAuditEvent/);
    assert.match(helper, /\.from\("dealer_portal_audit_events"\)\.insert/);
    assert.match(helper, /website_lead_id: input\.websiteLeadId/);
    assert.match(helper, /dealer_account_id: input\.dealerAccountId/);
    assert.match(helper, /dealer_user_id: input\.dealerUserId/);
    assert.match(helper, /event_type: input\.eventType/);
  });

  it("summarises previous and new state without dumping full rows", () => {
    const helper = source("lib/dealer-portal-audit.ts");
    assert.match(helper, /export function changedFieldSummary/);
    assert.match(helper, /changes\[field\] = \{ previous: previousValue, next: nextValue \}/);
    assert.match(helper, /JSON\.stringify\(previousValue\) !== JSON\.stringify\(nextValue\)/);
  });
});

describe("dealer portal V1 lifecycle audit coverage", () => {
  const webhookRoute = source("app/api/webhooks/website-leads/route.ts");
  const legacyLeadRoute = source("app/api/website-leads/route.ts");
  const vehicleCheck = source("lib/website-lead-auto-check.ts");
  const releaseRoute = source("app/api/dealer-portal/admin/release/route.ts");
  const claimRoute = source("app/api/dealer-portal/leads/[id]/claim/route.ts");
  const statusRoute = source("app/api/dealer-portal/claims/[id]/route.ts");
  const noteRoute = source("app/api/dealer-portal/claims/[id]/notes/route.ts");
  const purchaseRoute = source("app/api/dealer-portal/claims/[id]/purchase/route.ts");
  const feeRoute = source("app/api/dealer-portal/admin/fees/[id]/route.ts");

  it("records permanent history when a master buying-site lead is created", () => {
    assert.match(webhookRoute, /eventType: "master_lead_created"/);
    assert.match(webhookRoute, /lead_source: data\.lead_source/);
    assert.match(legacyLeadRoute, /eventType: "master_lead_created"/);
    assert.doesNotMatch(webhookRoute, /raw_payload/);
  });

  it("records meaningful vehicle check outcomes without raw provider payloads", () => {
    assert.match(vehicleCheck, /eventType: "vehicle_check_completed"/);
    assert.match(vehicleCheck, /eventType: "vehicle_check_failed"/);
    assert.match(vehicleCheck, /eventType: "vehicle_check_skipped"/);
    assert.match(vehicleCheck, /autotrader_vehicle_id/);
    assert.doesNotMatch(vehicleCheck, /eventData:\s*\{[^}]*taxonomyData/);
    assert.doesNotMatch(vehicleCheck, /eventData:\s*\{[^}]*motTests/);
  });

  it("keeps release, allocation, exclusion and re-release traceable", () => {
    assert.match(releaseRoute, /event_type: "lead_released_to_dealers"/);
    assert.match(releaseRoute, /eventType: "lead_rereleased_to_dealers"/);
    assert.match(releaseRoute, /eventType: allocation\.allocation_status === "excluded" \? "dealer_allocation_excluded" : "dealer_allocation_created"/);
    assert.match(releaseRoute, /match_reasons_ref: "dealer_lead_allocations\.match_reasons"/);
    assert.match(releaseRoute, /previous_dealer_reclaim_override_recorded/);
  });

  it("retains failed claims, successful claims and safe customer unlock history", () => {
    const migration = source("supabase/migrations/20260816000100_dealer_buying_portal_foundation.sql");
    assert.match(migration, /'claim_rejected'/);
    assert.match(migration, /'lead_claimed'/);
    assert.match(claimRoute, /eventType: "customer_details_unlocked"/);
    assert.doesNotMatch(claimRoute, /phone|email|postcode|address/);
  });

  it("adds lightweight audit references for notes and offers", () => {
    assert.match(noteRoute, /eventType: noteType === "offer" \? "dealer_offer_recorded" : "dealer_activity_added"/);
    assert.match(noteRoute, /note_id: data\.id/);
    assert.match(noteRoute, /claim_id: claim\.id/);
    assert.match(noteRoute, /note_type: noteType/);
    assert.doesNotMatch(noteRoute, /eventData:\s*\{[^}]*noteBody/);
  });

  it("preserves lost, returned, purchase and purchased-later audit distinction", () => {
    assert.match(statusRoute, /dealer_claim_lost/);
    assert.match(statusRoute, /lost_reason/);
    assert.match(statusRoute, /dealer_claim_returned/);
    assert.match(purchaseRoute, /dealer_purchased_later_reported/);
    assert.match(purchaseRoute, /dealer_purchase_reported/);
  });

  it("explicitly audits successful purchase fee creation and keeps fee mutations ledger-backed", () => {
    assert.match(purchaseRoute, /eventType: "successful_purchase_fee_created"/);
    assert.match(purchaseRoute, /configured_fee_amount: feeAmount/);
    assert.match(purchaseRoute, /dealer_fee_ledger_entries/);
    assert.match(feeRoute, /dealer_fee_\$\{ledgerEntryType\(action\)\}/);
    assert.match(feeRoute, /dealer_fee_ledger_entries/);
  });
});

describe("dealer portal account and notification audit coverage", () => {
  const dealerPortal = source("lib/dealer-portal.ts");
  const accountRoute = source("app/api/dealer-portal/account/route.ts");
  const adminCreateRoute = source("app/api/dealer-portal/admin/accounts/route.ts");
  const adminUpdateRoute = source("app/api/dealer-portal/admin/accounts/[id]/route.ts");
  const usersHelper = source("lib/dealer-portal-users.ts");
  const notifications = source("lib/dealer-notifications.ts");
  const foundationMigration = source("supabase/migrations/20260816000100_dealer_buying_portal_foundation.sql");

  it("audits dealer account and preference changes with actor attribution", () => {
    assert.match(accountRoute, /eventType: "dealer_account_self_updated"/);
    assert.match(accountRoute, /dealerUserId: session\.userId/);
    assert.match(adminCreateRoute, /eventType: "dealer_account_created"/);
    assert.match(adminUpdateRoute, /eventType: "dealer_account_staff_updated"/);
    assert.match(dealerPortal, /eventType: "dealer_buying_preferences_updated"/);
    assert.match(dealerPortal, /eventType: "dealer_geography_preferences_updated"/);
    assert.match(dealerPortal, /maximum_radius_miles/);
    assert.match(dealerPortal, /changed_fields/);
  });

  it("distinguishes user invitation, linking, role changes and activation changes", () => {
    assert.match(usersHelper, /dealer_login_invited/);
    assert.match(usersHelper, /dealer_login_linked/);
    assert.match(usersHelper, /dealer_login_role_changed/);
    assert.match(usersHelper, /dealer_login_activated/);
    assert.match(usersHelper, /dealer_login_deactivated/);
    assert.match(usersHelper, /previous_role/);
    assert.match(usersHelper, /new_role/);
    assert.match(usersHelper, /previous_active/);
    assert.match(usersHelper, /new_active/);
  });

  it("references notification ledger rows without copying provider details into general audit", () => {
    assert.match(notifications, /eventType: auditEventType/);
    assert.match(notifications, /notification_id: notification\.id/);
    assert.match(notifications, /dealer_notification_recorded/);
    assert.match(notifications, /dealer_notification_sent/);
    assert.match(notifications, /dealer_notification_failed/);
    const auditBlock = notifications.match(/async function recordNotificationAudit[\s\S]*?\n}/)?.[0] ?? "";
    assert.doesNotMatch(auditBlock, /provider_response/);
    assert.doesNotMatch(auditBlock, /destination/);
  });

  it("keeps audit history staff-controlled and not dealer-mutable", () => {
    assert.match(foundationMigration, /alter table public\.dealer_portal_audit_events enable row level security/);
    assert.match(foundationMigration, /'dealer_portal_audit_events'/);
    assert.match(foundationMigration, /for all to authenticated using \(public\.crm_staff_can_access\(\)\)/);
    assert.doesNotMatch(source("app/api/dealer-portal/leads/route.ts"), /dealer_portal_audit_events/);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("dealer roles and account management security", () => {
  it("allows dealer self-service updates only for operational account fields", () => {
    const helper = source("lib/dealer-portal.ts");
    const cleanSelfPayload = helper.match(/export function cleanDealerSelfAccountPayload[\s\S]*?^}/m)?.[0] ?? "";
    for (const field of ["trading_address", "main_contact", "telephone", "mobile_whatsapp", "main_email", "accounts_email", "website", "postcode"]) {
      assert.match(cleanSelfPayload, new RegExp(`${field}: cleanText`));
    }
    for (const forbidden of ["trading_name", "limited_company_name", "company_registration_number", "vat_number", "registered_address", "autotrader_dealer_ref", "account_status", "successful_purchase_fee", "attribution_period_days", "internal_notes"]) {
      assert.doesNotMatch(cleanSelfPayload, new RegExp(`${forbidden}:`));
    }
  });

  it("requires Dealer Admin before account or preference mutation", () => {
    const route = source("app/api/dealer-portal/account/route.ts");
    assert.match(route, /isDealerPortalAdmin\(session\)/);
    assert.match(route, /status:\s*403/);
    assert.match(route, /saveDealerPreferencePayloads\(session\.dealer\.id, body\)/);
  });

  it("requires Dealer Admin for dealer-side user management routes", () => {
    const listRoute = source("app/api/dealer-portal/users/route.ts");
    const updateRoute = source("app/api/dealer-portal/users/[id]/route.ts");
    assert.match(listRoute, /isDealerPortalAdmin\(session\)/);
    assert.match(listRoute, /inviteOrLinkDealerPortalUser\(session/);
    assert.match(updateRoute, /isDealerPortalAdmin\(session\)/);
    assert.match(updateRoute, /updateDealerPortalUserForSession\(session, id, body\)/);
  });

  it("scopes dealer user management to the current dealership", () => {
    const helper = source("lib/dealer-portal-users.ts");
    assert.match(helper, /\.eq\("dealer_account_id", session\.dealer\.id\)/);
    assert.match(helper, /\.eq\("id", portalUserId\)[\s\S]*?\.eq\("dealer_account_id", session\.dealer\.id\)/);
    assert.match(helper, /assertSingleDealerAccountForUser\(authUser\.id, session\.dealer\.id\)/);
    assert.match(helper, /This login is already linked to another dealer account/);
  });

  it("prevents self role changes through the dealer user-management endpoint", () => {
    const helper = source("lib/dealer-portal-users.ts");
    assert.match(helper, /current\.user_id === session\.userId/);
    assert.match(helper, /Ask another Dealer Admin to change your own access/);
  });

  it("uses Supabase invitations rather than temporary plaintext passwords", () => {
    const dealerRoute = source("app/api/dealer-portal/users/route.ts");
    const staffRoute = source("app/api/dealer-portal/admin/accounts/[id]/users/route.ts");
    const staffUi = source("app/admin/dealer-portal/page.tsx");
    assert.match(dealerRoute, /inviteOrLinkDealerPortalUser/);
    assert.match(staffRoute, /inviteUserByEmail/);
    assert.doesNotMatch(staffRoute, /createUser\(/);
    assert.doesNotMatch(staffRoute, /password/);
    assert.doesNotMatch(staffUi, /Temporary password/);
  });

  it("proves internal staff through active dealer_users membership", () => {
    const helper = source("lib/auth/require-staff.ts");
    assert.match(helper, /\.from\("dealer_users"\)/);
    assert.match(helper, /\.eq\("id",user\.id\)/);
    assert.match(helper, /\.eq\("active",true\)/);
    assert.match(helper, /\["dealer_admin","dealer_user"\]\.includes\(String\(data\.role\)\)/);
    const migration = source("supabase/migrations/20260904000100_harden_staff_access_against_dealer_portal_users.sql");
    assert.match(migration, /not in \('dealer_admin', 'dealer_user'\)/);
  });

  it("protects dealer portal staff APIs in routes and proxy", () => {
    const proxy = source("proxy.ts");
    const adminAccounts = source("app/api/dealer-portal/admin/accounts/route.ts");
    const adminRelease = source("app/api/dealer-portal/admin/release/route.ts");
    assert.match(proxy, /\/api\/dealer-portal\/admin/);
    assert.match(adminAccounts, /requireStaffUser\(\)/);
    assert.match(adminRelease, /requireStaffUser\(\)/);
  });

  it("keeps lead-working routes available to both dealer roles while staying dealership-scoped", () => {
    const claimRoute = source("app/api/dealer-portal/leads/[id]/claim/route.ts");
    const noteRoute = source("app/api/dealer-portal/claims/[id]/notes/route.ts");
    const statusRoute = source("app/api/dealer-portal/claims/[id]/route.ts");
    const purchaseRoute = source("app/api/dealer-portal/claims/[id]/purchase/route.ts");
    assert.doesNotMatch(claimRoute + noteRoute + statusRoute + purchaseRoute, /isDealerPortalAdmin/);
    assert.match(noteRoute, /getDealerClaimForSession\(id\)/);
    assert.match(statusRoute, /getDealerClaimForSession\(id\)/);
    assert.match(purchaseRoute, /getDealerClaimForSession\(id\)/);
  });
});

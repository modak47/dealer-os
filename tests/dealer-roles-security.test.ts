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
    assert.match(route, /saveDealerPreferencePayloads\(session\.dealer\.id, body, session\.userId\)/);
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

  it("keeps rejected dealers out of the active access and notification paths", () => {
    const types = source("types/dealer-portal.ts");
    const helper = source("lib/dealer-portal.ts");
    const releaseRoute = source("app/api/dealer-portal/admin/release/route.ts");
    const leadsRoute = source("app/api/dealer-portal/leads/route.ts");
    const notifications = source("lib/dealer-notifications.ts");
    const migration = source("supabase/migrations/20260909000100_dealer_account_rejected_status.sql");
    assert.match(types, /"rejected"/);
    assert.match(helper, /dealer\.account_status !== "active"/);
    assert.match(releaseRoute, /\.eq\("account_status", "active"\)/);
    assert.match(leadsRoute, /accountStatus: membership\.dealer\.account_status/);
    assert.match(notifications, /input\.dealer\.account_status !== "active"/);
    assert.match(migration, /'rejected'/);
  });

  it("creates public dealer applications as pending accounts without granting access", () => {
    const route = source("apps/motorleads/app/api/dealer-access/route.ts");
    const form = source("apps/motorleads/app/components/simple-forms.tsx");
    assert.match(route, /createPendingDealerApplication/);
    assert.match(route, /dealer_portal_accounts/);
    assert.match(route, /account_status:\s*"pending"/);
    assert.match(route, /dealer_application_submitted/);
    assert.doesNotMatch(route, /dealer_portal_users/);
    assert.match(form, /Application received/);
    assert.match(form, /awaiting review/);
    assert.doesNotMatch(form, /does not automatically create a Dealer Portal account/);
  });

  it("records dealer status decisions and only links logins for active accounts", () => {
    const updateRoute = source("app/api/dealer-portal/admin/accounts/[id]/route.ts");
    const userRoute = source("app/api/dealer-portal/admin/accounts/[id]/users/route.ts");
    const adminPage = source("app/admin/dealer-portal/page.tsx");
    assert.match(updateRoute, /dealer_account_decision/);
    assert.match(updateRoute, /decided_at/);
    assert.match(userRoute, /account_status"\)/);
    assert.match(userRoute, /account\.data\.account_status !== "active"/);
    assert.match(adminPage, /savedAccount\.account_status === "active"/);
    assert.match(adminPage, /Active \/ Approved/);
    assert.match(adminPage, /Approve/);
    assert.match(adminPage, /Reject/);
    assert.match(adminPage, /Suspend/);
  });

  it("enforces the one main plus three additional dealer user maximum", () => {
    const helper = source("lib/dealer-portal-users.ts");
    const dealerRoute = source("app/api/dealer-portal/users/route.ts");
    const staffRoute = source("app/api/dealer-portal/admin/accounts/[id]/users/route.ts");
    assert.match(helper, /assertDealerPortalUserLimit/);
    assert.match(helper, /maxUsers = 4/);
    assert.match(helper, /one main account and three additional users/);
    assert.match(dealerRoute, /inviteOrLinkDealerPortalUser/);
    assert.match(staffRoute, /assertDealerPortalUserLimit\(id, authUser\.id\)/);
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

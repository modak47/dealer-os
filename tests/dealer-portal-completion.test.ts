import assert from "node:assert/strict";
import { test } from "node:test";
import { dealerInvitationRedirect, safeAuthNext } from "../lib/dealer-auth-navigation";
import { dealerPortalRequest } from "../lib/dealer-portal-request";
import { sellerStatus } from "../apps/motorleads/app/lib/seller-status";

test("auth links preserve dealer reset and deep links while rejecting escaped or external destinations", () => {
  for (const path of ["/dealer-portal", "/dealer-portal/reset-password", "/dealer-portal/leads/123?tab=customer", "/admin/reset-password"]) assert.equal(safeAuthNext(path), path);
  for (const path of ["//evil.example", "/\\evil.example", "https://evil.example", "/dealer-portal/%2e%2e/admin", "/dealer-portal/../../elsewhere", "/dealer-portal%2foutside", "/administrator", "/other"]) assert.equal(safeAuthNext(path), "/admin/dashboard");
  assert.equal(dealerInvitationRedirect("https://portal.motorgeeks.co.uk/api/dealer-portal/users"), "https://portal.motorgeeks.co.uk/dealer-portal/reset-password");
});

test("a failed network request or HTML gateway response is recoverable, while API errors retain their status", async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => { throw new TypeError("connection lost"); };
    let result = await dealerPortalRequest("/api/dealer-portal/leads");
    assert.equal(result.status, 503); assert.match((await result.json()).error, /Please try again/);
    global.fetch = async () => new Response("<html>gateway timeout</html>", { status: 502 });
    result = await dealerPortalRequest("/api/dealer-portal/leads"); assert.equal(result.status, 503);
    global.fetch = async () => Response.json({ error: "This offer has already been accepted." }, { status: 409 });
    result = await dealerPortalRequest("/api/dealer-portal/offer-leads/1/offer");
    assert.equal(result.status, 409); assert.match((await result.json()).error, /already been accepted/);
  } finally { global.fetch = original; }
});

test("seller completion and closure take precedence over historical accepted offers", () => {
  assert.equal(sellerStatus("cancelled", true).label, "Closed");
  assert.equal(sellerStatus("purchased", true).label, "Purchased");
  assert.match(sellerStatus("purchased", true).copy, /confirmed the purchase/);
  assert.equal(sellerStatus("purchase_pending", true).label, "Purchase pending");
  assert.equal(sellerStatus("offer_accepted", true).label, "Offer accepted");
  assert.equal(sellerStatus("live_to_dealers", false).label, "Available to dealers");
});

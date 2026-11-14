import { strict as assert } from "node:assert";
import { test } from "node:test";
import { formatAdvertMoney, formatDaysLive, formatRelativeConfirmed, getValidAdvertUrl } from "../app/admin/opportunities/opportunity-utils";

test("unavailable valuations stay distinct from a zero-pound value", () => {
  for (const value of [null, undefined, "", " ", "£", "Unknown", "NaN"]) {
    assert.equal(formatAdvertMoney(value, "Not enough data"), "Not enough data");
  }
  assert.equal(formatAdvertMoney(0, "Not enough data"), "£0");
  assert.equal(formatAdvertMoney("0", "Not enough data"), "£0");
  assert.equal(formatAdvertMoney("£2,100.00"), "£2,100");
  assert.equal(formatAdvertMoney("1495"), "£1,495");
  assert.equal(formatAdvertMoney(-200), "-£200");
});

test("missing advert and age data retain safe fallbacks", () => {
  assert.equal(getValidAdvertUrl("javascript:alert(1)"), null);
  assert.equal(getValidAdvertUrl(null), null);
  assert.equal(formatDaysLive(null), "Unknown");
  assert.equal(formatDaysLive(0), "0");
});

test("confirmation text uses the shared render time across minute boundaries", () => {
  const confirmed = "2026-11-14T12:00:00Z";
  const serverTime = Date.parse("2026-11-14T12:00:59Z");
  assert.equal(formatRelativeConfirmed(confirmed, serverTime), "Confirmed just now");
  assert.equal(formatRelativeConfirmed(confirmed, serverTime + 1000), "Confirmed 1 minute ago");
  assert.equal(formatRelativeConfirmed(null, serverTime), "Unknown");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { analyseLeadDate } from "../lib/website-lead-date";
import { decodeLeadCursor, encodeLeadCursor, listFilters, londonMidnight } from "../lib/website-lead-list";
import { releaseBlockReason } from "../lib/website-lead-release";
test("London date windows include the complete DST-change day", () => {
  assert.equal(londonMidnight("2026-03-29"), "2026-03-29T00:00:00.000Z");
  assert.equal(londonMidnight("2026-03-30"), "2026-03-29T23:00:00.000Z");
  assert.equal(londonMidnight("2026-10-25"), "2026-10-24T23:00:00.000Z");
  assert.equal(londonMidnight("2026-10-26"), "2026-10-26T00:00:00.000Z");
  const f = listFilters(new URLSearchParams("period=custom&from=2026-08-01&to=2026-08-31"));
  assert.equal(f.from,"2026-07-31T23:00:00.000Z"); assert.equal(f.to,"2026-08-31T23:00:00.000Z");
});
test("global search ignores date window and cursor belongs to exact filters", () => {
  const f = listFilters(new URLSearchParams("q=historical&period=30"));
  assert.equal(f.from,null); assert.equal(f.to,null);
  const cursor = encodeLeadCursor({ id: 20, received_at: "2026-08-12T12:30:00.123456+00:00" }, f);
  assert.deepEqual(decodeLeadCursor(cursor, f),{id:20,at:"2026-08-12T12:30:00.123456+00:00"});
  assert.throws(()=>decodeLeadCursor(cursor,{...f,q:"different"}),/cursor/);
  assert.throws(()=>decodeLeadCursor("junk",f),/cursor/);
});
test("dates are conservative, originals untouched, uncertain values explicitly fall back",()=>{
  const fallback="2026-07-10T12:00:00Z";
  assert.equal(analyseLeadDate("17/12/2017 00:33",fallback,fallback).received_at,"2017-12-17T00:33:00.000Z");
  assert.equal(analyseLeadDate("01/08/2026 12:00",fallback,fallback).received_date_basis,"ambiguous_source:submitted_at");
  assert.equal(analyseLeadDate("31/02/2026 12:00",fallback,fallback).confident,false);
  assert.equal(analyseLeadDate("25/10/2026 01:30",fallback,fallback).format,"ambiguous_clock");
  assert.equal(analyseLeadDate("29/03/2026 01:30",fallback,fallback).format,"ambiguous_clock");
  assert.equal(analyseLeadDate("2026-08-01T12:00:00Z",fallback,fallback).confident,true);
});
test("release needs explicit readiness and preserves separate marketplace lifecycle",()=>{
  const ready={status:"new",opportunity_mode:"direct_claim",portal_ready_at:"2026-09-21T12:00:00Z"};
  assert.equal(releaseBlockReason(ready),null);
  assert.match(releaseBlockReason({...ready,portal_ready_at:null})!,/Ready/);
  for(const status of ["dealer_claimed","purchased","closed","internal_buying","dealer_pool_available"]) assert.ok(releaseBlockReason({...ready,status}));
  assert.ok(releaseBlockReason({...ready,archived_at:"now"}));
  assert.ok(releaseBlockReason({...ready,opportunity_mode:"unknown"}));
  assert.equal(releaseBlockReason({...ready,opportunity_mode:"marketplace_offer",marketplace_status:"submitted"}),null);
  for(const marketplace_status of ["offer_accepted","purchase_pending","live_to_dealers","draft"]) assert.ok(releaseBlockReason({...ready,opportunity_mode:"marketplace_offer",marketplace_status}));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { retailComparableValues, retailOfferFigures } from "../app/admin/retail-check/retail-display";

test("retail offer figures preserve supported profit and margin calculations", () => {
  assert.deepEqual(retailOfferFigures(4895, "3500"), { profit: 1395, margin: "28.5" });
  assert.deepEqual(retailOfferFigures("4895", "5000"), { profit: -105, margin: "-2.1" });
  assert.deepEqual(retailOfferFigures(4895, "0"), { profit: 4895, margin: "100.0" });
  assert.deepEqual(retailOfferFigures(0, "100"), { profit: -100, margin: null });
});

test("missing or invalid retail values do not produce invented offer figures", () => {
  for (const retail of [undefined, null, "", " ", "Not available", Number.NaN]) {
    assert.deepEqual(retailOfferFigures(retail, "3500"), { profit: null, margin: null });
  }
  for (const offer of ["", " ", "invalid"]) {
    assert.deepEqual(retailOfferFigures(4895, offer), { profit: null, margin: null });
  }
});

test("legacy comparable summaries display currency and missing markers consistently", () => {
  assert.deepEqual(retailComparableValues("GBP 7189 | 2019 | 4991 miles | None | DOM"), ["£7,189", "2019", "4,991 miles", "—", "—"]);
  assert.deepEqual(retailComparableValues("£4,695 | 2020 | 9,250 miles | Red | 22 days"), ["£4,695", "2020", "9,250 miles", "Red", "22 days"]);
  assert.deepEqual(retailComparableValues(" | | | | DOM: 12"), ["Not available", "—", "—", "—", "12"]);
});

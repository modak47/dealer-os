import assert from "node:assert/strict";
import { test } from "node:test";
import { retailOfferFigures } from "../app/admin/retail-check/retail-display";

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

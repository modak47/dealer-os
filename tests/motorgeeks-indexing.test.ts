import assert from "node:assert/strict";
import test from "node:test";
import robots from "../apps/motorleads/app/robots";
import sitemap from "../apps/motorleads/app/sitemap";
import { pageMetadata } from "../apps/motorleads/app/site";
import { sellerValidation } from "../apps/motorleads/app/lib/seller-input";

test("indexing rules allow public content and tokenless noindex pages, while excluding APIs and one-use links", () => {
  const rules = robots().rules as { allow: string[]; disallow: string[] };
  const allowed = (path: string) => {
    const matches = (pattern: string) => new RegExp(`^${pattern.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}`).test(path);
    const yes = Math.max(-1, ...rules.allow.filter(matches).map(rule => rule.length));
    const no = Math.max(-1, ...rules.disallow.filter(matches).map(rule => rule.length));
    return yes >= no;
  };
  for (const path of ["/", "/about", "/valuation", "/_next/static/app.js", "/images/bike.jpg", "/seller", "/seller/recover", "/seller/verify", "/seller/invalid"]) assert.ok(allowed(path), path);
  for (const path of ["/api/valuation/draft", "/api/seller/photos", "/seller/a-one-use-token", "/seller/recover-another-token"]) assert.ok(!allowed(path), path);
});

test("the sitemap contains only unique canonical public URLs", () => {
  const entries = sitemap();
  assert.equal(entries.length, 25);
  assert.equal(new Set(entries.map(entry => entry.url)).size, entries.length);
  for (const entry of entries) {
    const url = new URL(entry.url);
    assert.equal(url.origin, "https://motorgeeks.co.uk");
    assert.equal(url.search, "");
    assert.ok(!/^\/(seller|api)(\/|$)/.test(url.pathname));
  }
});

test("metadata preserves canonical URLs and avoids duplicated brand names", () => {
  const about = pageMetadata("About MotorGeeks", "About the service", "/about");
  assert.deepEqual(about.title, { absolute: "About MotorGeeks" });
  assert.equal(about.openGraph?.title, "About MotorGeeks");
  assert.equal(about.twitter?.title, "About MotorGeeks");
  assert.deepEqual(pageMetadata("How MotorGeeks Works", "How it works", "/how-it-works").title, { absolute: "How MotorGeeks Works" });
  assert.deepEqual(about.alternates, { canonical: "https://motorgeeks.co.uk/about" });
  const valuation = pageMetadata("Free Motorbike Valuation", "Tell us about your bike", "/valuation");
  assert.equal(valuation.title, "Free Motorbike Valuation");
  assert.equal(valuation.openGraph?.title, "Free Motorbike Valuation | MotorGeeks");
});

test("customer-friendly labels retain existing condition and service-history values", () => {
  const form = { vehicle: { make: "Honda", model: "CB500F", year: "2021", derivative: "Sport", engineCapacity: "500" }, condition: { mileage: "0", registeredKeeper: "yes", overallCondition: "Average", serviceHistory: "Part history", running: "yes", writtenOff: "yes", writeOffCategory: "Not known", outstandingFinance: "unsure", mechanicalFaults: "no", cosmeticDamage: "no" }, seller: { firstName: "Visual", lastName: "Test", email: "visual@example.test", mobile: "07123456789", postcode: "SW1A1AA", consent: true } };
  assert.deepEqual(sellerValidation(form), []);
  for (const overallCondition of ["Excellent", "Good", "Average", "Poor", "Non-runner"]) for (const serviceHistory of ["Full history", "Part history", "No history", "Unknown"]) assert.deepEqual(sellerValidation({ ...form, condition: { ...form.condition, overallCondition, serviceHistory } }), []);
  assert.ok(sellerValidation({ ...form, condition: { ...form.condition, mileage: "12.5" } }).length);
  assert.ok(sellerValidation({ ...form, condition: { ...form.condition, writeOffCategory: "" } }).length);
  assert.ok(sellerValidation({ ...form, seller: { ...form.seller, consent: false } }).length);
});

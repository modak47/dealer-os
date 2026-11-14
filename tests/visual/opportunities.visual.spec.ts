import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import type { Opportunity } from "../../app/admin/opportunities/types";

const directory = "design-references/current/opportunities-refresh";
const sizes = [[1440, 900], [1280, 800], [768, 1024], [390, 844]];
const fixedTime = new Date("2026-11-14T12:10:00Z");
const scanner = { last_run: "2026-11-14T12:02:13Z", opportunity_count: 4, status: "success", last_started: "2026-11-14T12:00:02Z", last_finished: "2026-11-14T12:02:13Z", duration_ms: 132000 };
const base: Opportunity = {
  "Listing ID": 1001, "Score": 92, "Potential Margin": "1495", "Asking Price": "800", "Dealer Median": "2295", "Comparable Count": 5,
  "Make": "Honda", "Model": "VFR800", "Year": 2001, "Mileage": 41240, "Seller Type": "Private", "Advert URL": "https://example.test/bike/1001",
  "First Seen Date": "2026-10-12T12:00:00Z", "Days Live": 33, listingFirstSeenAt: "2026-10-12T12:00:00Z", listingLastConfirmedAt: "2026-11-14T12:02:13Z", listingDaysLive: 33,
  isNewListing: false, "Derivative ID": "VFR800", "Margin %": "", seen: false, notes: "", status: "New", favourite: false, hidden: false, last_seen: null,
  primary_image_url: "http://images.example.test/honda.jpg", updated_at: null,
};

async function prepare(page: Page) {
  page.setDefaultTimeout(10_000);
  let rows = [base,
    { ...base, "Listing ID": 1002, "Make": "Yamaha", "Model": "XSR125", "Year": 2021, "Mileage": 8457, "Score": 0, "Asking Price": "2100", "Dealer Median": null, "Potential Margin": null, "Comparable Count": 0, "HPI Category": "Cat N", primary_image_url: null },
    { ...base, "Listing ID": 1003, "Make": "BMW", "Model": "R 1250 GS Adventure Rallye TE with Touring and Dynamic Packages", "Score": 65, primary_image_url: null, status: "Researching" },
    { ...base, "Listing ID": 1004, "Make": "Suzuki", "Model": "SV650", "Score": 50, "Asking Price": "", "Mileage": null, "Advert URL": null, primary_image_url: "http://images.example.test/broken.jpg", hidden: true },
  ] as Opportunity[];
  const patches: Record<string, unknown>[] = [];
  let failPatch = false;
  await page.clock.install();
  await page.route("**/api/opportunities", async route => {
    if (route.request().method() === "PATCH") {
      const { listingId, ...patch } = route.request().postDataJSON();
      patches.push({ listingId, ...patch });
      if (failPatch) return route.fulfill({ status: 500, json: { error: "Test save failed. Please retry." } });
      rows = rows.map(row => row["Listing ID"] === listingId ? { ...row, ...patch } : row);
      return route.fulfill({ json: rows.find(row => row["Listing ID"] === listingId) });
    }
    return route.fulfill({ json: rows });
  });
  await page.route("**/api/scanner-status", route => route.fulfill({ json: scanner }));
  await page.route("**/api/opportunities/*/activity", route => route.fulfill({ json: [{ id: 1, listing_id: 1001, activity_type: "view", description: "Opportunity reviewed", metadata: {}, created_at: scanner.last_run }] }));
  await page.route("**/api/run-opportunity-scan", route => route.fulfill({ json: { success: true } }));
  await page.route("http://images.example.test/**", route => route.request().url().endsWith("broken.jpg")
    ? route.fulfill({ body: "invalid image fixture", contentType: "image/png" })
    : route.fulfill({ path: "public/images/style-categories/super-sports.png", contentType: "image/png" }));
  // Isolate existing server-rendered external images as well as the test fixtures.
  await page.route(/https:\/\/.*(?:autotrader|atcdn|unsplash).*\.(?:jpg|jpeg|png|webp).*/i, route => route.fulfill({ path: "public/bike-placeholder.svg", contentType: "image/svg+xml" }));
  await page.goto("/admin/opportunities");
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.clock.setFixedTime(fixedTime);
  await page.clock.runFor(1000);
  await page.clock.fastForward(61_000);
  await expect(page.getByRole("region", { name: "Opportunities", exact: true }).locator("article")).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
  return { patches, failNextPatch: () => { failPatch = true; } };
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
}

async function accessibility(page: Page, scope: string) {
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const violations = await page.evaluate(async selector => {
    const axe = (window as unknown as { axe: { run: (scope: string, options: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe;
    return (await axe.run(selector, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.filter(v => ["serious", "critical"].includes(v.impact));
  }, scope);
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

for (const [width, height] of sizes) {
  test(`opportunities page, details and category states at ${width} @visual`, async ({ page }) => {
    test.setTimeout(90_000); mkdirSync(directory, { recursive: true });
    await page.setViewportSize({ width, height });
    const errors: string[] = []; const failed: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") failed.push(request.url()); });
    await prepare(page);
    if (width === 390) {
      await page.getByRole("button", { name: "Open navigation", exact: true }).click();
      await expect(page.locator(".admin-side")).toHaveClass(/mobile-open/);
      await page.locator(".admin-side").getByRole("button", { name: "Close navigation", exact: true }).click();
      await expect(page.locator(".admin-side")).not.toHaveClass(/mobile-open/);
    }
    await expect(page.getByRole("heading", { name: "Buying Opportunities", exact: true })).toBeVisible();
    await noOverflow(page); await accessibility(page, "main");
    await page.screenshot({ path: `${directory}/page-${width}.png`, animations: "disabled" });
    const honda = page.getByRole("article", { name: "Honda VFR800", exact: true });
    await honda.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/card-${width}.png`, animations: "disabled" });
    await honda.getByRole("button", { name: "View details" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Honda VFR800", exact: true })).toBeVisible();
    await expect(dialog).toContainText("£1,495"); await expect(dialog).toContainText("£2,295");
    await expect(page.getByRole("button", { name: "Close details", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
    await noOverflow(page); await accessibility(page, '[role="dialog"]');
    await page.screenshot({ path: `${directory}/details-${width}.png`, animations: "disabled" });
    await dialog.getByRole("button", { name: /^activity$/i }).click();
    await expect(dialog).toContainText("Opportunity reviewed");
    let releaseComparables: () => void = () => {};
    const pendingComparables = new Promise<void>(resolve => { releaseComparables = resolve; });
    await page.route("**/api/opportunities/*/comparables", async route => { await pendingComparables; await route.fulfill({ json: [] }); });
    await dialog.getByRole("button", { name: /^comparables/i }).click();
    await expect(dialog).toContainText("Loading comparable adverts...");
    await noOverflow(page); await page.screenshot({ path: `${directory}/loading-${width}.png`, animations: "disabled" });
    releaseComparables(); await expect(dialog).toContainText("No comparable adverts have been stored");
    await page.screenshot({ path: `${directory}/no-comparables-${width}.png`, animations: "disabled" });
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
    await expect(honda.getByRole("button", { name: "View details" })).toBeFocused();
    await honda.getByRole("button", { name: /Enlarge photo/ }).click();
    await expect(page.getByRole("dialog", { name: "Photo of Honda VFR800" })).toBeVisible();
    await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("textbox", { name: "Search opportunities", exact: true }).fill("XSR125");
    const category = page.getByRole("article", { name: "Yamaha XSR125", exact: true });
    await expect(category).toContainText("Not enough data"); await expect(category).toContainText("Cat N");
    await expect(category).not.toContainText("£0");
    await category.scrollIntoViewIfNeeded(); await noOverflow(page);
    await page.screenshot({ path: `${directory}/category-${width}.png`, animations: "disabled" });
    await category.getByRole("button", { name: "View details" }).click();
    await expect(page.getByRole("dialog")).toContainText("Clean bikes are excluded");
    await page.screenshot({ path: `${directory}/category-details-${width}.png`, animations: "disabled" });
    await noOverflow(page); await page.keyboard.press("Escape");
    await page.getByRole("textbox", { name: "Search opportunities", exact: true }).fill("BMW");
    await page.getByRole("article", { name: /^BMW/ }).scrollIntoViewIfNeeded(); await noOverflow(page);
    await page.screenshot({ path: `${directory}/long-model-${width}.png`, animations: "disabled" });
    await page.getByLabel("Hide Hidden", { exact: true }).uncheck();
    await page.getByRole("textbox", { name: "Search opportunities", exact: true }).fill("SV650");
    const missing = page.getByRole("article", { name: "Suzuki SV650", exact: true });
    await expect(missing).toContainText("No photo available");
    await expect(missing.getByRole("button", { name: "Open Advert", exact: true })).toBeDisabled();
    await missing.scrollIntoViewIfNeeded(); await noOverflow(page);
    await page.screenshot({ path: `${directory}/missing-data-${width}.png`, animations: "disabled" });
    await page.getByRole("textbox", { name: "Search opportunities", exact: true }).fill("no such model");
    await expect(page.getByRole("heading", { name: "No opportunities match these filters." })).toBeVisible();
    await noOverflow(page); await page.screenshot({ path: `${directory}/empty-${width}.png`, animations: "disabled" });
    expect(errors).toEqual([]); expect(failed).toEqual([]);
  });
}

test("filters, workflow saves, rollback, scan and comparable states remain usable @visual", async ({ page }) => {
  test.setTimeout(90_000); await page.setViewportSize({ width: 1440, height: 900 });
  const state = await prepare(page);
  const search = page.getByRole("textbox", { name: "Search opportunities", exact: true });
  const honda = page.getByRole("article", { name: "Honda VFR800", exact: true });
  await honda.getByLabel("Add to favourites").click();
  await expect(honda.getByLabel("Remove from favourites")).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Only Favourites", { exact: true }).check();
  await expect(page.getByRole("region", { name: "Opportunities", exact: true }).locator("article")).toHaveCount(1);
  await page.getByLabel("Only Favourites", { exact: true }).uncheck();
  await honda.getByLabel("Workflow status").selectOption("Contacted");
  await expect(honda).toContainText("Contacted");
  await honda.getByRole("textbox", { name: /Notes/ }).fill("Ask about service history");
  await page.clock.fastForward(1100); await expect(honda).toContainText("Saved ✓");
  expect(state.patches).toContainEqual({ listingId: 1001, notes: "Ask about service history" });
  await page.getByRole("region", { name: "Opportunity filters" }).getByLabel("Workflow status").selectOption("Contacted");
  await expect(page.getByRole("region", { name: "Opportunities", exact: true }).locator("article")).toHaveCount(1);
  await page.getByRole("region", { name: "Opportunity filters" }).getByLabel("Workflow status").selectOption("all");
  await page.getByLabel("Minimum score", { exact: true }).fill("80");
  await expect(page.getByRole("region", { name: "Opportunities", exact: true }).locator("article")).toHaveCount(1);
  await page.getByLabel("Minimum score", { exact: true }).fill("");
  await page.getByLabel("Minimum margin (£)", { exact: true }).fill("2000");
  await expect(page.getByRole("heading", { name: "No opportunities match these filters." })).toBeVisible();
  await page.getByLabel("Minimum margin (£)", { exact: true }).fill("");
  await page.getByLabel("Sort by", { exact: true }).selectOption("newest");
  await honda.getByRole("button", { name: "Hide", exact: true }).click();
  await expect(honda).toHaveCount(0);
  await page.getByLabel("Hide Hidden", { exact: true }).uncheck();
  await expect(honda).toBeVisible();
  await honda.getByRole("button", { name: "Restore", exact: true }).click();
  await search.fill("SV650");
  const suzuki = page.getByRole("article", { name: "Suzuki SV650" });
  await expect(suzuki.getByRole("button", { name: "Open Advert" })).toBeDisabled();
  await expect(suzuki).toContainText("Mileage unknown");
  await expect(suzuki).toContainText("No photo available");
  await search.fill("");
  let release: () => void = () => {};
  const loading = new Promise<void>(resolve => { release = resolve; }); let comparableCalls = 0;
  await page.route("**/api/opportunities/*/comparables", async route => {
    comparableCalls++;
    if (comparableCalls === 1) { await loading; return route.fulfill({ status: 500, json: { error: "Comparables unavailable. Try again." } }); }
    if (comparableCalls === 2) return route.fulfill({ json: [] });
    return route.fulfill({ json: [{ id: 1, comparable_listing_id: 2001, make: "Honda", model: "VFR800", year: 2002, mileage: 30000, price: "2295", seller_type: "Dealer", dealer_name: "Example Motorcycles", distance: "20 miles", advert_url: "https://example.test/comparable", image_url: null }] });
  });
  await honda.getByRole("button", { name: "View 5 comparable adverts" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Loading comparable adverts...");
  await page.screenshot({ path: `${directory}/comparables-loading.png`, animations: "disabled" }); release();
  await expect(dialog).toContainText("Comparables unavailable. Try again.");
  await page.screenshot({ path: `${directory}/comparables-error.png`, animations: "disabled" });
  await dialog.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(dialog).toContainText("No comparable adverts have been stored");
  await page.screenshot({ path: `${directory}/comparables-empty.png`, animations: "disabled" });
  await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(dialog).toContainText("Example Motorcycles"); await expect(dialog).toContainText("£2,295");
  await page.screenshot({ path: `${directory}/comparables.png`, animations: "disabled" });
  await page.keyboard.press("Escape");
  state.failNextPatch(); await honda.getByLabel("Remove from favourites").click();
  await expect(page.getByRole("alert").filter({ hasText: "Test save failed" })).toBeVisible();
  await expect(honda.getByLabel("Remove from favourites")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page.getByRole("button", { name: "Run opportunity scan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Scanner running...", exact: true })).toBeDisabled();
  await page.screenshot({ path: `${directory}/scanner-running.png`, animations: "disabled" });
  await page.clock.fastForward(31_000); await expect(page.getByRole("button", { name: "Run opportunity scan", exact: true })).toBeEnabled();
});

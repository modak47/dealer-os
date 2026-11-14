import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { lookupVehicle, missingRetailRecord, retailRecord, type RetailFixture } from "./fixtures/retail-check";

const directory = "design-references/current/retail-refresh";
const sizes = [[1440, 900], [1280, 800], [768, 1024], [390, 844]];

async function prepare(page: Page, options: { history?: RetailFixture[]; holdHistory?: Promise<void>; historyFailure?: boolean; lookupFailure?: boolean } = {}) {
  page.setDefaultTimeout(10_000);
  let current: RetailFixture = { ...retailRecord };
  let historyFailure = Boolean(options.historyFailure);
  const submissions: Record<string, unknown>[] = [];
  const lookups: Record<string, unknown>[] = [];
  let retries = 0;
  await page.route("**/api/makes", route => route.fulfill({ json: [{ make: "Honda" }, { make: "BMW" }] }));
  await page.route("**/api/models", route => route.fulfill({ json: [{ make: "Honda", model: "CB650R" }, { make: "BMW", model: "R 1250 GS" }] }));
  await page.route("**/api/retail-history", async route => {
    if (options.holdHistory) await options.holdHistory;
    if (historyFailure) return route.fulfill({ status: 503, json: { error: "Previous valuations are temporarily unavailable." } });
    return route.fulfill({ json: options.history ?? [retailRecord, missingRetailRecord] });
  });
  await page.route("**/api/autotrader/vehicle-lookup", route => {
    lookups.push(route.request().postDataJSON());
    return options.lookupFailure
      ? route.fulfill({ status: 503, json: { error: "Auto Trader lookup unavailable. Continue manually." } })
      : route.fulfill({ json: { vehicle: lookupVehicle } });
  });
  await page.route("**/api/retail-check", route => {
    submissions.push(route.request().postDataJSON());
    return route.fulfill({ json: { recordId: current.id, requestId: "qa-request-1", record: current } });
  });
  await page.route("**/api/retail-check/*", route => route.fulfill({ json: current }));
  await page.route("**/api/retail-check/*/retry", route => {
    retries++; current = { ...retailRecord, Status: "Pending", "Progress Percent": 0, "Progress Stage": "Queued", "Progress Message": "Your retail check has been queued." };
    return route.fulfill({ json: { record: current } });
  });
  await page.routeWebSocket("**/realtime/v1/**", socket => {
    socket.onMessage(message => {
      try {
        const frame = JSON.parse(String(message));
        if (Array.isArray(frame)) socket.send(JSON.stringify([frame[0], frame[1], frame[2], "phx_reply", { status: "ok", response: {} }]));
        else socket.send(JSON.stringify({ ...frame, event: "phx_reply", payload: { status: "ok", response: {} } }));
      } catch { /* Non-JSON keepalive frames need no reply. */ }
    });
  });
  // Reference requests start in the mounted client effect, so this also waits for hydration.
  const referenceReady = page.waitForResponse(response => response.url().endsWith("/api/models"));
  await page.goto("/admin/retail-check");
  await referenceReady;
  if (!options.holdHistory) await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Retail Checker", exact: true })).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.evaluate(() => document.fonts.ready);
  return { submissions, lookups, setCurrent: (record: RetailFixture) => { current = record; }, historyWorks: () => { historyFailure = false; }, retryCount: () => retries };
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function accessibility(page: Page) {
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (scope: string, options: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe;
    return (await axe.run("main", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.filter(item => ["serious", "critical"].includes(item.impact));
  });
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

async function capture(page: Page, state: string, width: number) {
  await noOverflow(page);
  await page.screenshot({ path: `${directory}/${state}-${width}.png`, animations: "disabled" });
}

for (const [width, height] of sizes) {
  test(`retail checker lookup, valuation and all tabs at ${width} @visual`, async ({ page }) => {
    test.setTimeout(90_000); mkdirSync(directory, { recursive: true });
    await page.setViewportSize({ width, height });
    const errors: string[] = []; const failed: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") failed.push(request.url()); });
    const state = await prepare(page);
    await expect(page.getByRole("heading", { name: "Retail Checker", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start with a registration" })).toBeVisible();
    await capture(page, "initial", width); await accessibility(page);
    await page.getByRole("tab", { name: "Valuation", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Comparables", exact: true })).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: /^History/ })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home"); await expect(page.getByRole("tab", { name: "Vehicle", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Manual Search", exact: true }).click();
    await page.getByLabel("Make", { exact: true }).selectOption("Honda");
    await page.getByLabel("Model", { exact: true }).selectOption("CB650R");
    await page.getByLabel("Year", { exact: true }).fill("2021");
    await page.getByLabel("Registration", { exact: true }).fill("ab12cde");
    await page.getByLabel("Mileage", { exact: true }).fill("8457");
    await page.getByRole("button", { name: "Search Auto Trader", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Vehicle check", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("Clear");
    expect(state.lookups).toEqual([{ vrm: "AB12CDE" }]);
    await page.getByRole("tabpanel").scrollIntoViewIfNeeded(); await capture(page, "vehicle-check", width); await accessibility(page);
    await page.getByRole("tab", { name: "Vehicle", exact: true }).click();
    await expect(page.getByRole("tabpanel")).toContainText("JH2RC123456789012");
    await capture(page, "vehicle", width);
    await page.getByRole("button", { name: "Run Retail Check", exact: true }).click();
    await expect(page.getByRole("region", { name: "AutoTrader Market", exact: true })).toContainText("£4,895");
    expect(state.submissions[0]).toMatchObject({ registration: "AB12CDE", mileage: "8457", make: "Honda", model: "CB650R", year: "2021", derivativeId: "honda-cb650r-2021", autotraderVehicleId: "at-vehicle-1" });
    await page.getByRole("heading", { name: "Market valuation", exact: true }).scrollIntoViewIfNeeded();
    await capture(page, "valuation", width); await accessibility(page);
    await page.getByLabel("Your offer price (£)", { exact: true }).fill("3500");
    const metrics = page.getByRole("region", { name: "Buying metrics", exact: true });
    await expect(metrics.getByText("Expected Profit", { exact: true }).locator("..")).toContainText("£1,395");
    await expect(metrics.getByText("Margin", { exact: true }).locator("..")).toContainText("28.5%");
    await metrics.scrollIntoViewIfNeeded(); await capture(page, "offer", width);
    await page.getByRole("tab", { name: "Comparables", exact: true }).click();
    await expect(page.getByRole("article", { name: "Comparable advert 1", exact: true })).toContainText("£4,695");
    await expect(page.getByRole("link", { name: /View advert/ }).first()).toHaveAttribute("href", "https://example.test/advert/1");
    await page.getByRole("tabpanel").scrollIntoViewIfNeeded(); await capture(page, "comparables", width);
    await page.getByRole("tab", { name: /^History/ }).click();
    await expect(page.getByRole("table")).toContainText("£4,895");
    await capture(page, "history", width); await accessibility(page);
    await page.getByRole("button", { name: "View valuation for XY21ZZZ", exact: true }).click();
    await expect(page.getByRole("region", { name: "AutoTrader Market", exact: true })).toContainText("Not available");
    await expect(page.getByRole("region", { name: "AutoTrader Market", exact: true })).not.toContainText("£0");
    await page.getByRole("heading", { name: "Market valuation", exact: true }).scrollIntoViewIfNeeded();
    await capture(page, "missing-values-long-model", width);
    await expect(page.getByText("Expected Profit", { exact: true }).locator("..")).toContainText("—");
    await page.getByRole("tab", { name: "Vehicle check", exact: true }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Category N");
    await capture(page, "saved-category-check", width);
    await page.getByRole("tab", { name: "Vehicle", exact: true }).click();
    await expect(page.getByRole("tabpanel")).toContainText("BMW");
    await expect(page.getByRole("tabpanel")).not.toContainText("JH2RC123456789012");
    await page.getByRole("button", { name: /Return To Current Valuation/ }).click();
    await page.getByRole("tab", { name: "Valuation", exact: true }).click();
    await expect(page.getByRole("region", { name: "AutoTrader Market", exact: true })).toContainText("£4,895");
    expect(errors).toEqual([]); expect(failed).toEqual([]);
  });

  test(`retail history loading, error, retry and empty states at ${width} @visual`, async ({ page }) => {
    test.setTimeout(60_000); mkdirSync(directory, { recursive: true });
    await page.setViewportSize({ width, height });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    let release: () => void = () => {};
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const state = await prepare(page, { history: [], holdHistory: waiting, historyFailure: true });
    await page.getByRole("tab", { name: /^History/ }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Loading previous valuations...");
    await page.getByRole("tabpanel").scrollIntoViewIfNeeded(); await capture(page, "history-loading", width);
    release(); await expect(page.getByRole("tabpanel").getByRole("alert")).toContainText("temporarily unavailable");
    await capture(page, "history-error", width);
    state.historyWorks(); await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("tabpanel")).toContainText("No previous valuations yet");
    await capture(page, "history-empty", width); await accessibility(page);
    expect(errors).toEqual([]);
  });
}

test("retail progress, failed retry, manual review and stock booking retain their behaviour @visual", async ({ page }) => {
  test.setTimeout(90_000); mkdirSync(directory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install();
  const state = await prepare(page);
  await page.getByLabel("Registration", { exact: true }).fill("AB12CDE");
  await page.getByLabel("Mileage", { exact: true }).fill("8457");
  await page.getByRole("button", { name: "Search Auto Trader", exact: true }).click();
  const pending = { ...retailRecord, Status: "Pending", "Progress Percent": 0, "Progress Stage": "Queued", "Progress Message": "Your retail check has been queued." };
  state.setCurrent(pending);
  await page.getByRole("button", { name: "Run Retail Check", exact: true }).click();
  await expect(page.getByRole("button", { name: "Valuation Running...", exact: true })).toBeDisabled();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  await capture(page, "pending", 1440);
  state.setCurrent({ ...pending, Status: "Processing", "Progress Percent": 55, "Progress Stage": "Comparing adverts", "Progress Message": "Comparing the current dealer market." });
  await page.clock.fastForward(5500); await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "55");
  await capture(page, "processing", 1440);
  state.setCurrent({ ...pending, Status: "Failed", "Progress Stage": "Failed", "Progress Message": "The market check could not finish." });
  await page.clock.fastForward(5500); await expect(page.getByRole("button", { name: "Retry Retail Check", exact: true })).toBeVisible();
  await capture(page, "failed", 1440);
  await page.getByRole("button", { name: "Retry Retail Check", exact: true }).click();
  expect(state.retryCount()).toBe(1); await expect(page.getByRole("button", { name: "Valuation Running...", exact: true })).toBeDisabled();
  state.setCurrent({ ...retailRecord });
  await page.reload(); await page.waitForLoadState("networkidle");
  // Opening the current record exercises the existing requestId/recordId deep link.
  await page.goto("/admin/retail-check?recordId=qa-retail-1&reg=AB12CDE");
  await expect(page.getByRole("region", { name: "AutoTrader Market", exact: true })).toContainText("£4,895");
  await page.getByLabel("Mileage", { exact: true }).fill("8457");
  await page.getByRole("button", { name: "Search Auto Trader", exact: true }).click();
  await page.getByRole("tab", { name: "Valuation", exact: true }).click();
  await page.getByLabel("Your offer price (£)", { exact: true }).fill("3400");
  await page.route("**/admin/stock/book-in?**", route => route.fulfill({ contentType: "text/html", body: "<main>Stock booking test destination</main>" }));
  await page.getByRole("region", { name: "Buying metrics", exact: true }).getByRole("button", { name: "Book Into Stock", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/stock\/book-in\?fromRetailCheck=qa-retail-1/);
  const prefill = await page.evaluate(() => JSON.parse(sessionStorage.getItem("dealeros.stockBookingPrefill") || "{}"));
  expect(prefill.form).toMatchObject({ registration: "AB12CDE", make: "Honda", model: "CB650R", purchase_price: "3400", target_retail_price: "4895", vin: "JH2RC123456789012", hpi_check_required: false });
});

test("retail manual lookup fallback and legacy route redirects stay usable @visual", async ({ page }) => {
  test.setTimeout(60_000);
  await prepare(page, { lookupFailure: true });
  await page.getByLabel("Registration", { exact: true }).fill("AB12CDE");
  await page.getByRole("button", { name: "Search Auto Trader", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Continue manually");
  await expect(page.getByLabel("Make", { exact: true })).toBeVisible();
  await page.getByLabel("Make", { exact: true }).selectOption("Honda");
  await page.getByLabel("Model", { exact: true }).selectOption("CB650R");
  await page.goto("/retail-check?reg=AB12CDE&requestId=test-link");
  await expect(page).toHaveURL(/\/admin\/retail-check\?reg=AB12CDE&requestId=test-link/);
  await expect(page.getByLabel("Registration", { exact: true })).toHaveValue("AB12CDE");
  await page.goto("/admin/retail-history");
  await expect(page).toHaveURL(/\/admin\/retail-check$/);
});

for (const [width, height] of sizes) {
test(`booking a saved category bike keeps its own vehicle and HPI details at ${width} @visual`, async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width, height });
  await prepare(page);
  await page.getByLabel("Registration", { exact: true }).fill("AB12CDE");
  await page.getByRole("button", { name: "Search Auto Trader", exact: true }).click();
  await page.getByRole("tab", { name: /^History/ }).click();
  await page.getByRole("button", { name: "View valuation for XY21ZZZ", exact: true }).click();
  await page.getByLabel("Your offer price (£)", { exact: true }).fill("3200");
  await page.getByRole("region", { name: "Buying metrics", exact: true }).getByRole("button", { name: "Book Into Stock", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/stock\/book-in\?fromRetailCheck=qa-retail-2/);
  await expect(page.locator('input[name="registration"]')).toHaveValue("XY21ZZZ");
  await expect(page.locator('input[name="make"]')).toHaveValue("BMW");
  await expect(page.locator('input[name="model"]')).toHaveValue(String(missingRetailRecord.Model));
  await expect(page.locator('input[name="purchase_price"]')).toHaveValue("3200");
  await expect(page.locator('input[name="vin"]')).toHaveValue("");
  await expect(page.locator('input[name="derivative_id"]')).toHaveValue("");
  await expect(page.locator('input[name="hpi_category"]')).toHaveValue("N");
  await expect(page.getByLabel("Hpi Check Required", { exact: true })).toBeChecked();
  await capture(page, "stock-booking", width);
});
}

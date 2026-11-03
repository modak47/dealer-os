import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const directory = "tmp/market-intelligence-fix";
const sizes = [[1440, 900], [1280, 800], [768, 1024], [390, 844]];
const generatedAt = "2026-10-20T12:00:00.000Z";
const summary = { totalRows: 60, filteredRows: 60, activeCount: 40, removedCount: 20, dealerCount: 5,
  averageAskingPrice: 3500, medianAskingPrice: 3200, averageDaysLive: 14,
  dealerLeaderboard: [], makeModelSoldCounts: [], activeStockByDealer: [], removedTrend: [] };

for (const [width, height] of sizes) {
  test(`market intelligence live data at ${width} @visual`, async ({ page }) => {
    test.skip(process.env.MARKET_INTELLIGENCE_LIVE !== "1", "Requires the configured live reporting snapshot.");
    test.setTimeout(90_000);
    mkdirSync(directory, { recursive: true });
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    const failed: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") failed.push(request.url()); });
    page.on("response", response => { if (response.status() >= 400 && response.url().includes("/api/market-intelligence")) failed.push(`${response.status()} ${response.url()}`); });
    await page.goto("/market-intelligence");
    await expect(page.locator(".mi-kpis")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#mi-make-options option")).not.toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(".crm-setup")).toHaveCount(0);
    await page.screenshot({ path: `${directory}/live-summary-${width}.png` });
    await page.getByLabel("Make", { exact: true }).fill("Yamaha");
    await page.getByLabel("Model", { exact: true }).fill("MT-125");
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(page.locator(".mi-table tbody tr")).toHaveCount(50, { timeout: 30_000 });
    await expect(page.locator(".mi-kpi")).toHaveCount(6);
    await page.locator(".mi-kpis").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/live-filtered-${width}.png` });
    await page.locator(".mi-listings").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/live-listings-${width}.png` });
    const firstId = await page.locator(".mi-table tbody tr").first().innerText();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator(".mi-pagination")).toContainText("Page 2", { timeout: 30_000 });
    expect(await page.locator(".mi-table tbody tr").first().innerText()).not.toEqual(firstId);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]); expect(failed).toEqual([]);
  });

  test(`market intelligence loading, retry, empty and navigation at ${width} @visual`, async ({ page }) => {
    mkdirSync(directory, { recursive: true });
    await page.setViewportSize({ width, height });
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    let initial = true;
    let releaseLoading: () => void = () => {};
    const loading = new Promise<void>(resolve => { releaseLoading = resolve; });
    await page.route("**/api/market-intelligence?**", async route => {
      const params = new URL(route.request().url()).searchParams;
      if (params.has("options")) return route.fulfill({ json: { options: { dealerNames: ["Alpha"], makes: ["Yamaha"], models: ["MT-125"], years: ["2023"] } } });
      if (initial) {
        initial = false; await loading;
        return route.fulfill({ status: 500, json: { error: "The market database is taking too long to respond. Please retry or apply a narrower make, model or date filter." } });
      }
      const hasFilter = Boolean(params.get("make"));
      const empty = params.get("make") === "No matching make";
      const count = empty ? 0 : 60;
      const pageNumber = Number(params.get("page") || 1);
      const rows = !hasFilter || empty ? [] : Array.from({ length: pageNumber === 1 ? 50 : 10 }, (_, index) => ({
        id: `${pageNumber}-${index}`, listingId: `${pageNumber}-${index}`, dealerName: "Alpha Motorcycles and Specialist Motorcycle Centre",
        dealerPrivate: "Dealer", status: index % 2 ? "Removed" : "Active", make: "Yamaha", model: "MT-125", derivative: "ABS",
        year: 2023, price: index % 2 ? null : 3999, mileage: index % 2 ? null : 1000, location: "Crawley", postcode: "RH1",
        firstSeen: "2026-10-01", lastSeen: "2026-10-20", daysLive: 19, advertUrl: "https://example.test/advert",
      }));
      return route.fulfill({ json: { analytics: empty ? { ...summary, filteredRows: 0, activeCount: 0, removedCount: 0 } : summary,
        rows, pagination: { page: pageNumber, pageSize: 50, total: count, pages: empty ? 1 : 2 }, meta: { generatedAt } } });
    });
    await page.goto("/market-intelligence");
    await expect(page.locator(".mi-loading")).toBeVisible();
    await expect(page.getByRole("button", { name: "Analysing..." })).toBeDisabled();
    await page.locator(".mi-loading").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/loading-${width}.png` });
    releaseLoading();
    await expect(page.locator(".crm-setup")).toContainText("Please retry");
    await page.screenshot({ path: `${directory}/error-${width}.png` });
    // Retry identical state, including retrying Reset after it was already reset.
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(page.locator(".mi-kpis")).toBeVisible();
    await expect(page.locator(".crm-setup")).toHaveCount(0);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.getByRole("button", { name: "Apply filters", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.getByRole("button", { name: "Apply filters", exact: true })).toBeEnabled();
    await page.getByLabel("Make", { exact: true }).fill("No matching make");
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(page.locator(".mi-table")).toContainText("No listings match");
    await page.locator(".mi-listings").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${directory}/empty-${width}.png` });
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (scope: string, options: unknown) => Promise<{ violations: { id: string; impact: string }[] }> } }).axe;
      return (await axe.run(".market-intelligence", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.filter(v => ["serious", "critical"].includes(v.impact));
    });
    expect(violations).toEqual([]); expect(pageErrors).toEqual([]);
  });
}

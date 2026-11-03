import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { bmwGuide, harleyGuide, hondaGuide, kawasakiGuide, ktmGuide, piaggioGuide, royalEnfieldGuide, suzukiGuide, triumphGuide, yamahaGuide } from "../../apps/motorleads/app/brand-guides";

const base = process.env.MOTORGEEKS_VISUAL_URL || "http://127.0.0.1:3102";
const out = process.env.MOTORGEEKS_VISUAL_OUTPUT || "design-references/current/motorgeeks-home-adjustment";
const sizes = [[1440, 900], [1280, 800], [768, 1024], [390, 844]];

test.describe("MotorGeeks homepage registration and hero @visual", () => {
  test.skip(!process.env.MOTORGEEKS_VISUAL_URL, "Use --config=playwright.motorgeeks.config.ts to start the public-site visual server.");
  test.beforeEach(async ({ page }) => {
    // This is a public-site layout check. Keep every seller operation isolated
    // from the shared database and external registration providers.
    let revision = 0;
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/valuation/draft" && route.request().method() === "GET") {
        return route.fulfill({ json: { draft: { revision, current_step: 1, registration: "", vehicle_snapshot: {}, condition_snapshot: {}, seller_snapshot: {} } } });
      }
      if (path === "/api/valuation/draft") return route.fulfill({ json: { draft: { revision: ++revision } } });
      if (path === "/api/valuation/lookup") return route.fulfill({ json: { vehicle: { registration: "GY26 ABC", make: "Honda", model: "CB500F", year: "2021" }, version: ++revision, lookupStatus: "found" } });
      if (path.endsWith("/photos")) return route.fulfill({ json: { photos: [], editable: true } });
      throw new Error(`Unexpected API operation in visual test: ${path}`);
    });
    mkdirSync(out, { recursive: true });
  });

  for (const [width, height] of sizes) test(`homepage, registration navigation and manual entry at ${width}`, async ({ page }) => {
    const errors: string[] = [], failed: string[] = [], httpErrors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") failed.push(request.url()); });
    page.on("response", response => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });
    await page.setViewportSize({ width, height });
    await page.goto(base, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const form = page.locator(".ml-hero .ml-reg-form");
    await expect(form.getByRole("textbox", { name: "Motorcycle registration" })).toHaveAttribute("placeholder", "Enter your registration (e.g. GY26 ABC)");
    await expect(page.getByPlaceholder(/GY23/)).toHaveCount(0);
    const note = page.locator(".ml-handwritten");
    if (width > 1120) {
      await expect(note).toBeVisible();
      const noteBox = (await note.boundingBox())!, formBox = (await form.boundingBox())!;
      // The rider occupies the centre-right of the unchanged hero image. Keep
      // this secondary message in the clear rightmost fifth, away from the CTA.
      expect(noteBox.x).toBeGreaterThan(width * .8);
      expect(noteBox.x).toBeGreaterThan(formBox.x + formBox.width + 20);
      expect(noteBox.x + noteBox.width).toBeLessThan(width - 12);
    } else await expect(note).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `${out}/homepage-${width}.png`, fullPage: true });
    await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
    const accessibility = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (scope: string) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
      return (await axe.run(".ml-hero")).violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) }));
    });
    writeFileSync(`${out}/accessibility-${width}.json`, JSON.stringify(accessibility, null, 2));
    expect(accessibility.filter(v => ["serious", "critical"].includes(v.impact))).toEqual([]);

    if (width <= 900) {
      await page.getByLabel("Open menu", { exact: true }).click();
      await expect(page.locator(".ml-mobile-menu").getByRole("link", { name: "Dealer Login" })).toHaveAttribute("href", "https://portal.motorgeeks.co.uk/dealer-login");
      await page.getByLabel("Open menu", { exact: true }).click();
    } else await expect(page.locator(".ml-header-actions").getByRole("link", { name: "Dealer Login" })).toHaveAttribute("href", "https://portal.motorgeeks.co.uk/dealer-login");

    const input = form.getByRole("textbox", { name: "Motorcycle registration" });
    await input.fill("gy26 abc");
    await input.press("Enter");
    await expect(page).toHaveURL(/\/valuation\?registration=GY26(?:\+|%20)ABC$/);
    await expect(page.locator(".mg-vrm-row input")).toHaveValue("GY26 ABC");
    await expect(page.locator(".mg-vrm-row input")).toHaveAttribute("placeholder", "GY26 ABC");
    await page.goto(base);
    await form.getByRole("link", { name: "No registration? Enter motorcycle details manually." }).click();
    await expect(page).toHaveURL(`${base}/valuation`);
    await expect(page.locator(".mg-vrm-row input")).toHaveAttribute("placeholder", "GY26 ABC");
    await page.screenshot({ path: `${out}/valuation-manual-${width}.png`, fullPage: false });
    expect(errors).toEqual([]); expect(failed).toEqual([]); expect(httpErrors).toEqual([]);
  });

  test("shared compact registration forms keep the replacement example", async ({ page }) => {
    const routes = ["/how-it-works", "/motorcycle-brands", ...[bmwGuide, harleyGuide, hondaGuide, kawasakiGuide, ktmGuide, piaggioGuide, royalEnfieldGuide, suzukiGuide, triumphGuide, yamahaGuide].map(guide => guide.path)];
    for (const route of routes) {
      const response = await page.goto(`${base}${route}`);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator(".ml-reg-form input").first(), route).toHaveAttribute("placeholder", "Enter your registration (e.g. GY26 ABC)");
      await expect(page.getByPlaceholder(/GY23/)).toHaveCount(0);
    }
  });
});

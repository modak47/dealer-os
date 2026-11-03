import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { bmwGuide, harleyGuide, hondaGuide, kawasakiGuide, ktmGuide, piaggioGuide, royalEnfieldGuide, suzukiGuide, triumphGuide, yamahaGuide } from "../../apps/motorleads/app/brand-guides";

const guides = [hondaGuide, yamahaGuide, bmwGuide, piaggioGuide, suzukiGuide, kawasakiGuide, triumphGuide, harleyGuide, ktmGuide, royalEnfieldGuide];
const routes = ["/motorcycle-brands", ...guides.map(guide => guide.path)];
const out = `${process.env.MOTORGEEKS_VISUAL_OUTPUT || "design-references/current/motorgeeks-brand-copy/after"}/brands`;

test.describe("MotorGeeks customer-friendly manufacturer guides @visual", () => {
  test.skip(!process.env.MOTORGEEKS_VISUAL_URL, "Use --config=playwright.motorgeeks.config.ts for the public-site visual server.");

  for (const [width, height] of [[1440, 900], [1280, 800], [768, 1024], [390, 844]]) {
    for (const path of routes) test(`${path} at ${width}x${height}`, async ({ page }) => {
      mkdirSync(out, { recursive: true });
      const errors: string[] = [], failed: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") failed.push(request.url()); });
      page.on("response", response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
      // Reading guides and opening FAQs must never create seller leads or run VRM lookups.
      await page.route("**/api/**", route => { throw new Error(`Unexpected API request: ${route.request().url()}`); });
      await page.setViewportSize({ width, height });
      const response = await page.goto(`${process.env.MOTORGEEKS_VISUAL_URL}${path}`, { waitUntil: "networkidle" });
      expect(response?.status()).toBe(200);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator(".ml-guide-hero .ml-button")).toHaveAttribute("href", "/valuation");
      await expect(page.locator(".ml-brand-registration input")).toHaveAttribute("placeholder", "Enter your registration (e.g. GY26 ABC)");
      const name = `${path.slice(1)}-${width}`;
      await page.screenshot({ path: `${out}/${name}-page.png`, fullPage: true });

      if (path !== "/motorcycle-brands") {
        const guide = guides.find(guide => guide.path === path)!;
        await expect(page.getByRole("heading", { name: guide.h1 })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Tell us your model, version and features" })).toBeVisible();
        const section = page.locator(".ml-guide-main > section").nth(1);
        await section.evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 110));
        await page.screenshot({ path: `${out}/${name}-models.png` });
        const questions = page.locator(".ml-brand-faqs details");
        for (const question of await questions.all()) {
          await question.locator("summary").click();
          await expect(question.locator("p")).toBeVisible();
        }
        await page.locator(".ml-brand-faqs").scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${out}/${name}-faq.png` });
        for (const question of await questions.all()) {
          await question.locator("summary").click();
          await expect(question.locator("p")).toBeHidden();
        }
      } else {
        for (const guide of guides) await expect(page.locator(".ml-brand-grid").getByRole("link", { name: `Read the ${guide.brand === "BMW" ? "BMW Motorrad" : guide.brand} guide`, exact: false })).toHaveAttribute("href", guide.path);
      }

      expect(await page.locator("main").textContent()).not.toMatch(/\b(?:derivative|variant|designation|specification)s?\b/i);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(await page.locator("main img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
      await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
      const accessibility = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (scope: string) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
        return (await axe.run("main")).violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) }));
      });
      writeFileSync(`${out}/${name}-accessibility.json`, JSON.stringify(accessibility, null, 2));
      // The unchanged orange buttons and registration prefix already fail
      // contrast on the live site (before/live-accessibility.json). Keep the
      // complete report and reject any new issue, including contrast in copy.
      const existingContrastTargets = new Set([
        '.ml-shell > .ml-button-orange.ml-button[href$="valuation"]',
        'aside > .ml-button-orange.ml-button[href$="valuation"]',
        'form > span',
        'button[type="submit"]',
        'button',
      ]);
      const newIssues = accessibility.filter(v => v.id !== "color-contrast" || v.targets.some(target => !existingContrastTargets.has(target.join(" "))));
      expect(newIssues).toEqual([]);
      expect(errors).toEqual([]);
      expect(failed).toEqual([]);
    });
  }
});

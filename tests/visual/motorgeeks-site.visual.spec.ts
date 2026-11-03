import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isolateMotorGeeksApis } from "./support/motorgeeks-fixtures";

const routes = ["/sell-my-motorbike", "/motorbike-valuation", "/how-to-sell-a-motorbike", "/how-it-works", "/for-dealers", "/about", "/faq", "/contact", "/dealer-access", "/valuation", "/privacy", "/terms", "/cookies", "/seller", "/seller/recover", "/seller/verify", "/seller/invalid"];
const out = `${process.env.MOTORGEEKS_VISUAL_OUTPUT || "design-references/current/motorgeeks-site-review/after"}/site`;
const baseline = "design-references/current/motorgeeks-site-review/before/accessibility";

test.describe("MotorGeeks site-wide copy and indexing @visual", () => {
  test.skip(!process.env.MOTORGEEKS_VISUAL_URL, "Use the MotorGeeks Playwright config.");
  for (const [width, height] of [[1440, 900], [1280, 800], [768, 1024], [390, 844]]) {
    for (const path of routes) test(`${path} at ${width}x${height}`, async ({ page }) => {
      mkdirSync(out, { recursive: true });
      const errors: string[] = [], failed: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") failed.push(request.url()); });
      page.on("response", response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
      await isolateMotorGeeksApis(page);
      await page.setViewportSize({ width, height });
      const response = await page.goto(`${process.env.MOTORGEEKS_VISUAL_URL}${path}`, { waitUntil: "networkidle" });
      expect(response?.status()).toBe(200);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://motorgeeks.co.uk${path}`);
      const robots = await page.locator('meta[name="robots"]').getAttribute("content");
      if (path.startsWith("/seller")) {
        expect(robots).toContain("noindex");
        expect(response?.headers()["x-robots-tag"]).toContain("noindex");
        for (const content of await page.locator('meta[name="googlebot"]').evaluateAll(nodes => nodes.map(node => node.getAttribute("content")))) expect(content).not.toMatch(/(?:^|,\s*)index(?:,|$)/);
      } else {
        expect(robots).not.toContain("noindex");
        await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `https://motorgeeks.co.uk${path}`);
      }
      expect(await page.locator("main").innerText()).not.toMatch(/\b(?:derivative|variant|designation|consumables|V1)\b|blind offers|successful claim|opportunity information/i);
      if (path === "/faq") {
        for (const item of await page.locator(".ml-faq-grid details").all()) {
          await item.locator("summary").click();
          await expect(item.locator("p")).toBeVisible();
        }
      }
      const name = `${path.slice(1).replaceAll("/", "-")}-${width}`;
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
      await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
      const violations = await page.evaluate(async () => (await (window as unknown as { axe: { run: (scope: string) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run("main")).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target.join(" ")) })));
      writeFileSync(`${out}/${name}-accessibility.json`, JSON.stringify(violations, null, 2));
      const existing = JSON.parse(readFileSync(`${baseline}/${name}.json`, "utf8")) as typeof violations;
      // Next's development toolbar adds buttons outside main, so axe may
      // qualify the same unchanged button differently than in production.
      const normalize = (target: string) => target === ".ml-button" && ["/seller/recover", "/seller/verify"].includes(path)
        ? "button" : target.replace(/button\[type="(?:button|submit)"\]/g, "button");
      const newIssues = violations.flatMap(v => v.targets.filter(target => !existing.some(old => old.id === v.id && old.targets.some(before => normalize(before) === normalize(target)))).map(target => `${v.id}: ${target}`));
      expect(newIssues).toEqual([]);
      expect(errors).toEqual([]); expect(failed).toEqual([]);
    });
  }
});

import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

const out = "design-references/current/shop-style/verified";
const categories = ["Scooters", "125cc", "Super Sports", "Roadster", "Adventure", "Custom"];

for (const [width, height] of [[1440, 900], [1280, 800], [768, 1024], [390, 844]]) {
  test(`homepage style cards, benefits, fallback and navigation at ${width} @visual`, async ({ page }) => {
    const errors: string[] = [], failed: string[] = [], expectedFailures: string[] = [];
    let brokenImage = false;
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() !== "error") return;
      if (brokenImage && message.location().url.includes("/images/style-categories/scooters.png") && message.text().includes("404")) return;
      errors.push(message.text());
    });
    page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") failed.push(request.url()); });
    page.on("response", response => {
      if (response.status() < 400) return;
      if (brokenImage && response.status() === 404 && new URL(response.url()).pathname === "/images/style-categories/scooters.png") expectedFailures.push(response.url());
      else failed.push(`${response.status()} ${response.url()}`);
    });
    await page.route("https://images.unsplash.com/**", route => route.fulfill({ contentType: "image/png", body: readFileSync("public/images/style-categories/roadster.png") }));
    // Stock elsewhere on the homepage uses third-party dealer photos. Keep
    // those deterministic while exercising the real local category images.
    await page.route(/^https:\/\/[^/]*\.cd5\.uk\//, route => route.fulfill({ contentType: "image/png", body: readFileSync("public/images/style-categories/roadster.png") }));
    await page.setViewportSize({ width, height });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const section = page.getByRole("region", { name: /shop by style/i });
    const cards = section.locator(".style-card");
    await expect(cards).toHaveCount(6);
    await expect(section.getByRole("link", { name: /view all motorcycles/i })).toBeVisible();
    const boxes = await cards.evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect(), copy = node.querySelector(".style-card-body")!;
      const body = copy.getBoundingClientRect();
      return { x: box.x, right: box.right, y: Math.round(box.y), height: box.height, bottom: box.bottom, bodyBottom: body.bottom, clipped: copy.scrollHeight > copy.clientHeight + 1 };
    }));
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width + 1);
      expect(box.bodyBottom).toBeLessThanOrEqual(box.bottom + 1); expect(box.clipped).toBe(false);
      for (const other of boxes.filter(other => other.y === box.y)) expect(Math.abs(box.height - other.height)).toBeLessThan(1);
    }
    expect(await section.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    for (const [index, category] of categories.entries()) {
      await expect(cards.nth(index).getByRole("heading", { name: category, exact: true })).toBeVisible();
      await expect(cards.nth(index)).toHaveAttribute("href", `/stock?category=${encodeURIComponent(category)}`);
    }
    const benefits = page.locator(".trust-bar article");
    await expect(benefits).toHaveCount(5);
    expect(await benefits.evaluateAll(nodes => nodes.every(node => {
      const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1;
    }))).toBe(true);
    const next = await page.locator(".home-checks").boundingBox(), current = await section.boundingBox();
    expect(next!.y).toBeGreaterThanOrEqual(current!.y + current!.height - 1);
    await cards.first().focus();
    expect(await cards.first().evaluate(node => getComputedStyle(node).outlineStyle)).toBe("solid");
    mkdirSync(out, { recursive: true });
    await section.screenshot({ path: `${out}/style-${width}.png` });
    await page.locator(".trust-strip").screenshot({ path: `${out}/benefits-${width}.png` });
    await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
    const issues = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (scope: string[]) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
      return (await axe.run([".home-section", ".trust-strip"])).violations.filter(v => ["serious", "critical"].includes(v.impact)).map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }));
    });
    expect(issues).toEqual([]);
    expect(errors).toEqual([]); expect(failed).toEqual([]);

    // Exercise the real image error handler without accepting other failures.
    brokenImage = true;
    await page.route("**/images/style-categories/scooters.png", route => route.fulfill({ status: 404, body: "Expected missing-photo fixture" }));
    await page.reload({ waitUntil: "networkidle" });
    await expect(cards.first().locator(".style-card-placeholder")).toBeVisible();
    await expect(cards.first().getByRole("heading", { name: "Scooters" })).toBeVisible();
    await section.screenshot({ path: `${out}/fallback-${width}.png` });
    expect(expectedFailures).toHaveLength(1);
    expect(errors).toEqual([]); expect(failed).toEqual([]);
    await cards.first().click();
    await expect(page).toHaveURL(/\/stock\?category=Scooters$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

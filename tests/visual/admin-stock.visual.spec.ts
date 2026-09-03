import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const standardViewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

test.describe("admin stock visual regression @visual", () => {
  for (const viewport of standardViewports) {
    test(`admin stock remains usable at ${viewport.name}`, async ({ page }, testInfo) => {
      const diagnostics = collectPageDiagnostics(page);
      await stabilizeVisualPage(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/admin/stock", { waitUntil: "networkidle" });
      await page.waitForLoadState("domcontentloaded");
      await page.evaluate(() => document.fonts.ready);

      await expect(page.getByRole("heading", { name: /stock management/i })).toBeVisible();
      await expect(page.locator(".admin-stock-card").first()).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await assertNamedInteractiveControls(page);
      if (process.env.VISUAL_TEST_FORCE_DIFF === "1") {
        await page.addStyleTag({ content: ".admin-stock-card:first-child{background:#ff00ff!important}" });
      }

      const seriousA11yViolations = await runAxe(page);
      expect(seriousA11yViolations, JSON.stringify(seriousA11yViolations, null, 2)).toEqual([]);
      expect(diagnostics.consoleErrors, diagnostics.consoleErrors.join("\n")).toEqual([]);
      expect(diagnostics.failedRequests, diagnostics.failedRequests.join("\n")).toEqual([]);

      if (process.env.VISUAL_CANDIDATE_SCREENSHOTS === "1") {
        await page.screenshot({
          path: path.join("design-references", "current", `admin-stock-${viewport.name}.png`),
          fullPage: true,
        });
      }

      await expect(page).toHaveScreenshot(`admin-stock-${viewport.name}.png`, {
        fullPage: true,
        timeout: 10_000,
      });
      await testInfo.attach(`admin-stock-${viewport.name}`, {
        path: testInfo.snapshotPath(`admin-stock-${viewport.name}.png`),
        contentType: "image/png",
      });
    });
  }
});

async function stabilizeVisualPage(page: Page) {
  const placeholder = path.resolve("public", "bike-placeholder.svg");
  await page.route("https://images.unsplash.com/**", async (route) => {
    await route.fulfill({ path: placeholder, contentType: "image/svg+xml" });
  });
  await page.addInitScript(() => {
    const fixed = new Date("2026-09-02T09:00:00.000Z").valueOf();
    Date.now = () => fixed;
  });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
}

function collectPageDiagnostics(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes("chrome-extension://")) failedRequests.push(`${request.method()} ${url}: ${request.failure()?.errorText ?? "failed"}`);
  });
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 500 && !url.includes("/__nextjs")) failedRequests.push(`${response.status()} ${url}`);
  });
  return { consoleErrors, failedRequests };
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const documentWidth = document.documentElement.clientWidth;
    const offenders = Array.from(document.body.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        if (element.closest(".admin-side:not(.mobile-open)")) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > documentWidth + 1);
      })
      .slice(0, 10)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: element.className,
        text: element.textContent?.trim().slice(0, 80),
      }));
    return { documentWidth, scrollWidth: document.documentElement.scrollWidth, offenders };
  });
  expect(overflow.scrollWidth, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(overflow.documentWidth + 1);
  expect(overflow.offenders, JSON.stringify(overflow, null, 2)).toEqual([]);
}

async function assertNamedInteractiveControls(page: Page) {
  const unnamed = await page.locator("button, a[href], input, select, textarea").evaluateAll((elements) => elements
    .filter((element) => {
      const htmlElement = element as HTMLElement;
      if (htmlElement.getAttribute("aria-hidden") === "true") return false;
      const text = htmlElement.innerText?.trim();
      const aria = htmlElement.getAttribute("aria-label")?.trim();
      const title = htmlElement.getAttribute("title")?.trim();
      const input = element as HTMLInputElement;
      const inputName = input.labels?.[0]?.textContent?.trim() || input.placeholder || input.name;
      return !text && !aria && !title && !inputName;
    })
    .map((element) => element.outerHTML.slice(0, 120)));
  expect(unnamed, unnamed.join("\n")).toEqual([]);
}

async function runAxe(page: Page) {
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js") });
  const results = await page.evaluate(async () => {
    return await window.axe.run(document, {
      resultTypes: ["violations"],
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
  });
  return results.violations
    .filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
    }));
}

declare global {
  interface Window {
    axe: {
      run: (context: Document, options: unknown) => Promise<{
        violations: Array<{
          id: string;
          impact: string | null;
          description: string;
          nodes: Array<{ target: string[] }>;
        }>;
      }>;
    };
  }
}

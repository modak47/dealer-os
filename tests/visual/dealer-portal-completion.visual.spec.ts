import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const out = "design-references/current/motorgeeks-finish/portal";
const sizes = [[1440, 900], [1280, 800], [768, 1024], [390, 844]];

async function accessible(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const issues = await page.evaluate(async () => {
    const engine = (window as unknown as { axe: { run: (scope: Element, options: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    return (await engine.run(document.querySelector("main")!, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }));
  });
  expect(issues).toEqual([]);
  mkdirSync(out, { recursive: true });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}

for (const [width, height] of sizes) {
  test(`dealer portal pages are accessible at ${width} @visual`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    const errors: string[] = [], failed: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("requestfailed", r => { if (r.failure()?.errorText !== "net::ERR_ABORTED") failed.push(r.url()); });
    page.on("response", r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
    for (const route of ["/dealer-login", "/dealer-portal", "/dealer-portal/opportunities", "/dealer-portal/offer-leads", "/dealer-portal/offer-leads/9901", "/dealer-portal/my-offers", "/dealer-portal/active", "/dealer-portal/purchased", "/dealer-portal/lost", "/dealer-portal/payments", "/dealer-portal/dealership", "/dealer-portal/settings", "/dealer-portal/support"]) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator("h1").first()).toBeVisible();
      await accessible(page, `${route.slice(1).replaceAll("/", "-")}-${width}`);
    }
    await page.goto("/dealer-portal/leads/9002", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Customer / Work Lead" }).click();
    await expect(page.getByRole("textbox", { name: "Activity note" })).toBeVisible();
    await accessible(page, `work-lead-${width}`);
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    expect(errors).toEqual([]); expect(failed).toEqual([]);
  });

  test(`dealer load, offer and photo gallery recover at ${width} @visual`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/api/dealer-portal/leads", route => route.fulfill({ status: 502, contentType: "text/html", body: "<h1>Gateway timeout</h1>" }));
    await page.goto("/dealer-portal");
    await expect(page.getByText("Unable to connect to the dealer portal. Please try again.")).toBeVisible();
    await accessible(page, `connection-error-${width}`);
    await page.unroute("**/api/dealer-portal/leads");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
    await page.goto("/dealer-portal/offer-leads/9901");
    const opener = page.getByRole("button", { name: "Open photo gallery" });
    await opener.click();
    const close = page.getByRole("button", { name: "Close gallery" });
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("dialog").getByRole("button", { name: "Next photo" })).toBeFocused();
    await page.keyboard.press("Tab"); await expect(close).toBeFocused();
    await page.keyboard.press("Escape"); await expect(opener).toBeFocused();
    await page.route("**/api/dealer-portal/offer-leads/9901/offer", r => r.fulfill({ status: 503, contentType: "text/plain", body: "Offline" }));
    const amount = page.getByRole("spinbutton", { name: /offer amount/i });
    await amount.fill("3500");
    const submit = page.getByRole("button", { name: "Make an offer", exact: true });
    await submit.click();
    await expect(page.getByText("Unable to connect to the dealer portal. Please try again.")).toBeVisible();
    await expect(submit).toBeEnabled(); await expect(amount).toHaveValue("3500");
    expect(errors).toEqual([]);
  });

  test(`dealer login and password completion at ${width} @visual`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const user = { id: "10000000-0000-4000-8000-000000000001", email: "dealer@example.test", aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {} };
    const token = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture-signature`;
    let failUpdate = true, resetUrl = "";
    await page.route("**/auth/v1/**", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.endsWith("/recover")) { resetUrl = url.searchParams.get("redirect_to") || ""; return route.fulfill({ json: {} }); }
      if (url.pathname.endsWith("/token")) return route.fulfill({ json: { access_token: token, token_type: "bearer", expires_in: 3600, refresh_token: "fixture-refresh", user } });
      if (url.pathname.endsWith("/user")) return request.method() === "PUT" && failUpdate
        ? route.fulfill({ status: 503, json: { message: "Service unavailable", code: "unexpected_failure" } }) : route.fulfill({ json: user });
      if (url.pathname.endsWith("/logout")) return route.fulfill({ status: 204 });
      throw new Error(`Unexpected auth request: ${url.pathname}`);
    });
    await page.goto("/dealer-login?next=/dealer-portal/reset-password");
    await expect(page.getByRole("link", { name: "Request dealer access" })).toHaveAttribute("href", "https://motorgeeks.co.uk/dealer-access");
    await page.getByLabel("Email address", { exact: true }).fill(user.email);
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("status")).toContainText("we’ll send");
    expect(new URL(resetUrl).searchParams.get("next")).toBe("/dealer-portal/reset-password");
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("FixturePassword123");
    await page.getByRole("button", { name: "Show password" }).click(); await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click(); await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Log in", exact: false }).click();
    await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill("FixturePassword456");
    await page.getByLabel("Confirm new password").fill("MismatchedPassword");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Passwords do not match.");
    await page.getByLabel("Confirm new password").fill("FixturePassword456");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Unable to update your password. Please try again.");
    await accessible(page, `password-retry-${width}`);
    failUpdate = false;
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/dealer-login$/);
  });

  test(`accepted marketplace sale closes through its own workflow at ${width} @visual`, async ({ page, request }) => {
    await page.setViewportSize({ width, height });
    const data = await (await request.get("/api/dealer-portal/leads")).json();
    const lead = data.claimed.find((item: { id: number }) => item.id === 9002);
    Object.assign(lead, { opportunity_mode: "marketplace_offer", marketplace_status: "offer_accepted", portal_claim_status: "agreed_to_purchase", accepted_offer_amount: 3500, marketplace_fee_amount: 79 });
    await page.route("**/api/dealer-portal/leads", r => r.fulfill({ json: data }));
    await page.route("**/api/dealer-portal/claims/*", async route => {
      expect(route.request().method()).toBe("PATCH");
      expect(route.request().postDataJSON()).toMatchObject({ status: "lost", lost_reason: "Customer sold elsewhere" });
      Object.assign(lead, { portal_claim_status: "lost", marketplace_status: "cancelled" });
      return route.fulfill({ json: { claim: { status: "lost" } } });
    });
    await page.goto("/dealer-portal/leads/9002");
    await page.getByRole("button", { name: "Customer / Work Lead" }).click();
    await expect(page.getByRole("button", { name: "Contacted", exact: true })).toHaveCount(0);
    await page.getByText("Report Purchase", { exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "Purchase price", exact: true })).toHaveValue("3500");
    await expect(page.getByRole("button", { name: "Mark as Purchased" })).toBeDisabled();
    await accessible(page, `accepted-sale-${width}`);
    await page.getByText("Sale did not complete", { exact: true }).click();
    await page.getByLabel("Lost reason", { exact: true }).selectOption("Customer sold elsewhere");
    await expect(page.getByRole("button", { name: "Return to Pool", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Close sale as not completed" }).click();
    await expect(page.getByRole("heading", { name: "Closed marketplace sale", exact: true })).toBeVisible();
    await expect(page.getByText("contact MotorGeeks to reopen it", { exact: false })).toBeVisible();
    await accessible(page, `closed-sale-${width}`);
  });
}

test("expired dealer password link cannot update an account", async ({ page }) => {
  await page.goto("/dealer-portal/reset-password");
  await expect(page.getByRole("status")).toContainText("expired");
  await expect(page.getByRole("button", { name: "Save password" })).toHaveCount(0);
});

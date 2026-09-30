import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const feePayload = {
  updated_at: "2026-09-30T10:00:00.000Z",
  updated_by: "staff-qa",
  bands: [
    { id: "b1", min_purchase_price: 0, max_purchase_price: 2000, fee_amount: 49, sort_order: 0 },
    { id: "b2", min_purchase_price: 2000, max_purchase_price: 4000, fee_amount: 79, sort_order: 1 },
    { id: "b3", min_purchase_price: 4000, max_purchase_price: 6000, fee_amount: 99, sort_order: 2 },
    { id: "b4", min_purchase_price: 6000, max_purchase_price: 10000, fee_amount: 129, sort_order: 3 },
    { id: "b5", min_purchase_price: 10000, max_purchase_price: null, fee_amount: 149, sort_order: 4 },
  ],
};

for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [430, 932], [390, 844]]) {
  test(`marketplace fee admin is usable at ${width} @visual`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/dealer-portal/admin/accounts", route => route.fulfill({ json: { accounts: [] } }));
    await page.route("**/api/dealer-portal/admin/marketplace-fees", route => route.fulfill({ json: feePayload }));
    await page.route("**/api/dealer-portal/admin/overview", route => route.fulfill({ json: {
      claims: [], notes: [], purchases: [], fees: [], ledger: [], marketplaceOverrides: [],
      marketplaceDeals: [{ id: 9901, reg: "GY23FFW", make: "Honda", model: "CBR650R", year: "2023", fname: "QA", lname: "Seller", marketplace_status: "offer_accepted", marketplace_accepted_at: "2026-09-30T09:00:00.000Z", accepted_offer_amount: 4500, marketplace_fee_default_amount: 99, marketplace_fee_amount: 75, marketplace_fee_override_amount: 75, marketplace_fee_override_reason: "Dealer agreement", marketplace_fee_overridden_at: "2026-09-30T09:30:00.000Z", dealer_name: "QA Motorcycles", purchased_at: null }],
    } }));
    await page.goto("/admin/dealer-portal");
    await page.getByRole("button", { name: /Marketplace Fees/ }).click();
    await expect(page.getByRole("heading", { name: "MotorGeeks Marketplace Fees" })).toBeVisible();
    await expect(page.locator(".marketplace-fee-band input").nth(2)).toHaveValue("49");
    await expect(page.getByText("Final fee")).toBeVisible();
    await expect(page.getByText("£75").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
    if (width === 1440 || width === 390) {
      mkdirSync("tmp/marketplace-fee-admin-qa", { recursive: true });
      await page.screenshot({ path: `tmp/marketplace-fee-admin-qa/admin-${width}.png`, fullPage: true });
    }
  });
}

test("dealer sees the correct fee band and total before offering @visual", async ({ page }) => {
  await page.goto("/dealer-portal/offer-leads/9901");
  await page.getByLabel("Offer amount").fill("4500");
  await expect(page.getByText("MotorGeeks successful purchase fee:").locator("..")).toContainText("£99");
  await expect(page.getByText("Total buying cost if purchase completes:").locator("..")).toContainText("£4,599");
  await expect(page.getByText(/fee applies only if the motorcycle is actually purchased/i)).toBeVisible();
});

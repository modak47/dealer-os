import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

for (const [width, height] of [[1440,900],[1280,800],[768,1024],[390,844]]) {
  test(`dealer portal has one complete sidebar logo at ${width} @visual`, async ({ page }) => {
    await page.setViewportSize({width,height});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/dealer-portal/leads', route => route.fulfill({json:{dealer:{id:'qa',trading_name:'DWB Trading',account_status:'active'},role:'dealer_user',available:[],claimed:[]}}));
    await page.route('**/api/dealer-portal/offer-leads', route => route.fulfill({json:{available:[],offers:[],marketplace_fee_amount:0}}));
    await page.goto('/dealer-portal');
    await expect(page.getByRole('heading',{name:'Welcome back, DWB Trading'})).toBeVisible();
    await expect(page.getByRole('img',{name:'MotorGeeks',exact:true})).toHaveCount(1);
    await expect(page.locator('aside').getByRole('img',{name:'MotorGeeks',exact:true})).toBeVisible();
    await expect(page.locator('[data-dealer-topbar] img')).toHaveCount(0);
    const title=page.locator('[data-dealer-topbar] small');
    await expect(title).toHaveText('Dealer Portal');
    const titleBox=await title.boundingBox(), barBox=await page.locator('[data-dealer-topbar]').boundingBox();
    expect(titleBox!.x-barBox!.x).toBeLessThan(35);
    expect(await page.getByRole('img',{name:'MotorGeeks',exact:true}).evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(errors).toEqual([]);
    mkdirSync('design-references/current/portal-branding',{recursive:true});
    await page.screenshot({path:`design-references/current/portal-branding/dashboard-${width}.png`});
  });
}

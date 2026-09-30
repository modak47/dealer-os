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

for (const [width, height] of [[1440,900],[1280,800],[1024,768],[768,1024],[430,932],[390,844]]) {
  test(`marketplace offer journey stays distinct and usable at ${width} @visual`, async ({ page }) => {
    await page.setViewportSize({width,height});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/dealer-portal/offer-leads');
    await expect(page.getByRole('heading',{name:'Offer Leads'}).first()).toBeVisible();
    await expect(page.getByText('Make an offer, not claim')).toBeVisible();
    await expect(page.getByText('Honda CBR650R').first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);

    await page.goto('/dealer-portal/offer-leads/9901');
    await expect(page.getByRole('heading',{name:/Honda CBR650R/}).first()).toBeVisible();
    await expect(page.getByText('Your offer',{exact:true})).toBeVisible();
    await expect(page.getByText('No offer submitted yet',{exact:true})).toBeVisible();
    await expect(page.getByText('Variant',{exact:true})).toBeVisible();
    await expect(page.getByText('Fuel',{exact:true})).toBeVisible();
    await expect(page.getByRole('tab',{name:/Customer/})).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);

    await page.goto('/dealer-portal/my-offers');
    await expect(page.getByRole('heading',{name:'My Offers',level:1})).toBeVisible();
    await expect(page.getByText('Yamaha MT-09').first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

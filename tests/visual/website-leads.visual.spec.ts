import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mockLeadWorkspace } from "./website-leads-fixtures";
const sizes=[[1440,900],[1280,800],[1024,900],[768,1024],[390,844]];
const directory="design-references/current/website-leads";
test.describe("Website Leads and release workspace @visual",()=>{
 for(const [width,height] of sizes) for(const [name,path] of [["website","/website-leads"],["queue","/admin/dealer-portal"]]) {
  test(`${name} usable at ${width}`,async({page})=>{
   mkdirSync(directory,{recursive:true});
   const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
   const failed:string[]=[];page.on("requestfailed",r=>{if(r.failure()?.errorText!=="net::ERR_ABORTED")failed.push(r.url());});
   await mockLeadWorkspace(page); await page.setViewportSize({width,height});
   let listResponseBytes=0;
   page.on('response',async response=>{ const url=new URL(response.url()); if(url.pathname==='/api/website-leads'&&!url.searchParams.has('counts')){try{listResponseBytes=(await response.body()).length;}catch{}} });
   let imageRequests=0;page.on('request',r=>{if(r.resourceType()==='image')imageRequests++;});
   const start=Date.now(); await page.goto(path);
   await expect(page.locator(".lead-summary-card")).toHaveCount(50);
   const visibleMs=Date.now()-start;
   await expect(page.locator(".lead-summary-grid")).toHaveCSS("display","grid");
   await expect(page.locator(".lead-browser-filters")).toHaveCSS("display","grid");
   await expect(page.getByRole("button",{name:"Load more (50)"})).toBeEnabled();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
   const violations=await page.evaluate(async()=>{
     const axe=(window as unknown as {axe:{run:(scope:string)=>Promise<{violations:{id:string;impact:string}[]}>}}).axe;
     return (await axe.run(".lead-browser")).violations.filter(v=>["serious","critical"].includes(v.impact));
   });
   expect(violations).toEqual([]);expect(errors).toEqual([]);expect(failed).toEqual([]);
   await page.screenshot({path:`${directory}/${name}-${width}.png`,fullPage:false});
   if(name==="website"&&width===1440){
    const perf=await page.evaluate(()=>({rows:document.querySelectorAll('.lead-summary-card').length,images:document.querySelectorAll('.lead-summary-card img').length,iframes:document.querySelectorAll('iframe').length,resources:performance.getEntriesByType('resource').filter(x=>x.name.includes('/api/website-leads')).map(x=>({name:x.name,duration:x.duration}))}));
    writeFileSync(`${directory}/fixture-browser-metrics.json`,JSON.stringify({kind:"Local dev browser with intercepted fixture API; not production/database latency",visibleMs,imageRequests,listResponseBytes,...perf},null,2));
   }
   await page.locator('.lead-browser-filters').scrollIntoViewIfNeeded();
   await page.screenshot({path:`${directory}/${name}-${width}-filters.png`});
   await page.locator('.lead-summary-card').first().scrollIntoViewIfNeeded();
   await page.screenshot({path:`${directory}/${name}-${width}-cards.png`});

  });
 }
 test("history search, August review, cursor, archive selection, details and map",async({page})=>{
  const {requests}=await mockLeadWorkspace(page); await page.goto('/website-leads'); await expect(page.locator('.lead-summary-card')).toHaveCount(50);
  const before=await page.locator('.lead-summary-card>label').allTextContents();
  await page.getByRole('button',{name:'Load more (50)'}).click(); await expect(page.locator('.lead-summary-card')).toHaveCount(100);
  const all=await page.locator('.lead-summary-card>label').allTextContents();expect(new Set(all).size).toBe(100);expect(all.slice(0,50)).toEqual(before);expect(all).toEqual(Array.from({length:100},(_,i)=>`Select #${1408-i}`));
  await page.getByLabel('Date',{exact:true}).selectOption('30');
  await page.getByLabel('Search All history',{exact:true}).fill('HISTORICAL1');
  await expect(page.locator('.lead-summary-card')).toHaveCount(1);await expect(page.getByText('Select #1',{exact:true})).toBeVisible();
  expect(requests.some(r=>r.includes('q=HISTORICAL1')&&r.includes('period=all'))).toBe(true);
  await page.screenshot({path:`${directory}/historical-search.png`});
  await page.getByLabel('Search All history',{exact:true}).fill('ARCHIVEDHISTORY2');await expect(page.locator('.lead-summary-card')).toHaveCount(0);await page.getByLabel('Include archived',{exact:true}).check();await expect(page.getByText('Select #2',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await page.getByLabel('Date',{exact:true}).selectOption('custom');await page.getByLabel('From',{exact:true}).fill('2026-08-01');await page.getByLabel('To',{exact:true}).fill('2026-08-31');await page.getByLabel('Review',{exact:true}).selectOption('not_reviewed');
  await expect(page.locator('.lead-summary-card').first()).toContainText('08/2026');
  await page.screenshot({path:`${directory}/august-not-reviewed.png`});
  expect(requests.some(r=>r.includes('from=2026-08-01')&&r.includes('to=2026-08-31')&&r.includes('review=not_reviewed'))).toBe(true);
  await page.getByRole('button',{name:'Backlog / Older',exact:true}).click();await expect(page.getByText('Older than 30 days.',{exact:false})).toBeVisible();
  await page.screenshot({path:`${directory}/backlog.png`});
  await page.getByRole('button',{name:'Clear filters',exact:true}).click(); await expect(page.locator('.lead-summary-card')).toHaveCount(50);
  await page.getByLabel('Select #1408',{exact:true}).check();await page.getByLabel('Select #1406',{exact:true}).check();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Archive',exact:true}).click();
  await expect(page.getByText('1 succeeded; 1 refused or failed.')).toBeVisible();
  await page.screenshot({path:`${directory}/bulk-results.png`});
  await page.locator('.lead-open').first().click();await expect(page.getByRole('heading',{level:1})).toContainText('AB0');
  await expect(page.locator('iframe')).toHaveCount(0);await expect(page.getByRole('button',{name:'Show location map'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Book Into Stock',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Send to Dealer',exact:true})).toBeVisible();
  await page.screenshot({path:`${directory}/detail.png`});
 });
 test("loading, empty, migration error and broken photo stay usable",async({page})=>{
  await mockLeadWorkspace(page); await page.goto('/website-leads');await expect(page.locator('.lead-summary-card')).toHaveCount(50);
  await page.getByLabel('Search All history',{exact:true}).fill('NO-SUCH-LEAD');await expect(page.getByText('No leads match these filters.',{exact:true})).toBeVisible();
  await page.screenshot({path:`${directory}/empty.png`});
  await page.route('**/api/website-leads?**',async route=>route.fulfill({status:503,json:{error:'Website Leads migration required. Ask an administrator to apply the reviewed SQL.'}}));
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(page.locator('.lead-browser').getByRole('alert')).toContainText('migration required');
  await page.screenshot({path:`${directory}/migration-required.png`});
  await page.unroute('**/api/website-leads?**');
  await page.route('**/bike-placeholder.svg?lead=*',route=>route.fulfill({status:200,contentType:'image/png',body:'invalid image'}));
  await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByText('Photo unavailable').first()).toBeVisible();
  await page.screenshot({path:`${directory}/broken-photo.png`});
 });
 for(const [width,height] of sizes) test(`detail actions and map at ${width}`,async({page})=>{
  await mockLeadWorkspace(page);await page.setViewportSize({width,height});await page.goto('/website-leads/1408');
  await expect(page.getByRole('heading',{level:1})).toContainText('AB0');
  await expect(page.locator('.website-thumbs img')).toHaveCount(2);
  expect(await page.locator('.website-main-image img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.route('**/maps**',route=>route.fulfill({contentType:'text/html',body:'<p>Location map fixture</p>'}));
  await page.getByRole('button',{name:'Show location map',exact:true}).click();await expect(page.locator('iframe')).toHaveCount(1);
  await page.getByRole('button',{name:'Book Into Stock',exact:true}).click();await expect(page.getByRole('heading',{name:'Book into stock',exact:false})).toBeVisible();
  const geometry = await page.locator('.website-book-modal').evaluate(modal=>{
   const header=modal.querySelector('header')!.getBoundingClientRect(), first=modal.querySelector('.website-book-grid label')!.getBoundingClientRect();
   return {headerBottom:header.bottom,firstTop:first.top,overflow:modal.scrollWidth>modal.clientWidth+1};
  });
  expect(geometry.firstTop).toBeGreaterThanOrEqual(geometry.headerBottom);
  expect(geometry.overflow).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:`${directory}/detail-booking-${width}.png`});
 });
 test("dashboard summary consumes the lightweight list",async({page})=>{
  const {leads}=await mockLeadWorkspace(page);
  await page.route('**/api/website-leads?summary=true**',route=>route.fulfill({json:{summary:{total:1408,new:1300,pendingValuations:900,receivedToday:4,receivedThisWeek:40,purchasedThisMonth:0,sourceCounts:{bikebuyeruk:900,sellyourmotorbike:400,motorcyclebuyer:100},latestLeads:leads.slice(0,5)}}}));
  await page.setViewportSize({width:1440,height:900});await page.goto('/admin/dashboard');await expect(page.locator('.overview-latest-leads>a')).toHaveCount(5);
  await page.locator('.overview-website-leads').scrollIntoViewIfNeeded();await page.screenshot({path:`${directory}/dashboard-summary.png`});
 });
 test("Ready view searches all ages after explicit approval",async({page})=>{
  const {requests}=await mockLeadWorkspace(page);await page.goto('/admin/dealer-portal');await expect(page.locator('.lead-summary-card')).toHaveCount(50);
  await page.getByRole('button',{name:'Ready to Release',exact:true}).click();
  await expect(page.getByLabel('Date',{exact:true})).toHaveValue('all');
  await expect(page.locator('.lead-summary-card')).toHaveCount(50);
  expect(requests.some(r=>r.includes('view=ready')&&r.includes('period=all'))).toBe(true);
  await page.locator('.lead-release-options').scrollIntoViewIfNeeded();await page.screenshot({path:`${directory}/ready-to-release.png`});
 });
 test("real signed-out endpoints fail closed",async({playwright})=>{
   const context=await playwright.request.newContext({baseURL:'http://127.0.0.1:3100',extraHTTPHeaders:{}});
   for(const path of ['/api/website-leads','/api/website-leads?counts=true','/api/website-leads/1','/api/website-leads/image?url=https://example.com/a.heic']) {
    const r=await context.get(path);expect(r.status()).toBe(401);expect(await r.text()).not.toContain('fname');
   }
   const r=await context.get('/website-leads',{maxRedirects:0});expect(r.status()).toBe(307);await context.dispose();
 });
});

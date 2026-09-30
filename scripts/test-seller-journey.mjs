import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
const base=process.env.MOTORGEEKS_VISUAL_URL||'http://localhost:3102';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Use a local preview only');
const out='reports/seller-reliability';await mkdir(out,{recursive:true});
const browser=await chromium.launch();const results=[];
try{for(const [width,height] of [[1440,900],[1280,800],[768,1024],[390,844]]){
 const context=await browser.newContext({viewport:{width,height}});const page=await context.newPage();let revision=0,failSave=false,finalBody,submitted=false;const saves=[],errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>requests.push({url:r.url(),error:r.failure()?.errorText}));
 // UI fixtures only. Real HTTP + SQL verification lives in seller-handlers/database.test.ts.
 // Catch ALL API traffic so this preview cannot write to production or contact providers.
 await context.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/valuation/draft'&&req.method()==='GET'){await new Promise(r=>setTimeout(r,250));await route.fulfill({json:{draft:{revision,current_step:1,registration:'TEST123',vehicle_snapshot:{registration:'TEST123',make:'Honda',model:'Restored motorcycle',year:'2020'},condition_snapshot:{mileage:'1234'},seller_snapshot:{}}}});return;}
  if(path==='/api/valuation/draft'&&req.method()==='PATCH'){const body=req.postDataJSON();saves.push(body);await new Promise(r=>setTimeout(r,200));if(failSave){await route.fulfill({status:503,json:{error:'Controlled save failure. Retry.'}});return;}assert.equal(body.version,revision);revision++;await route.fulfill({json:{draft:{revision}}});return;}
  if(path.endsWith('/photos')){await route.fulfill({json:{photos:[],editable:true}});return;}
  if(path==='/api/valuation/submit'){finalBody=req.postDataJSON();assert.equal(finalBody.version,revision);submitted=true;await route.fulfill({json:{ok:true,reference:'MG-TEST',emailStatus:'failed'}});return;}
  if(path==='/api/valuation/lookup'){await route.fulfill({status:503,json:{error:'Lookup unavailable. Use manual entry.'}});return;}
  if(path==='/api/seller/recover'){await route.fulfill({json:{message:'If that email has a saved MotorGeeks profile, a secure link will be sent.'}});return;}
  await route.fulfill({status:503,json:{error:'Unconfigured isolated UI fixture'}});
 });
 await page.goto(base+'/valuation');await page.getByRole('button',{name:'Next step'}).waitFor();await page.waitForTimeout(350);assert.equal(saves.length,0,'No saves before restoration');
 await page.getByRole('button',{name:'Next step'}).click();await page.getByRole('alert').filter({hasText:'registered keeper'}).waitFor();
 await page.getByRole('group',{name:'Are you the registered keeper?'}).getByLabel('Yes',{exact:true}).check();
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/valuation-vehicle-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Next step'}).click();assert.equal(await page.getByRole('combobox',{name:/Overall condition/}).inputValue({timeout:3000}).catch(async e=>{await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/failure.png',fullPage:true});console.log(await page.locator('body').innerText());throw e;}),'');assert.equal(await page.locator('input[type=radio]:checked').count(),0);
 await page.getByRole('button',{name:'Next step'}).click();await page.getByRole('alert').filter({hasText:'condition'}).waitFor();
 await page.getByRole('combobox',{name:/Overall condition/}).selectOption('Good');await page.getByRole('combobox',{name:/Service history/}).selectOption('Unknown');
 for(const [name,answer] of [['Running and rideable?','Yes'],['Has the motorcycle ever been recorded as a write-off?','No'],['Outstanding finance?','No'],['Any mechanical faults?','No'],['Any cosmetic damage?','No']])await page.getByRole('group',{name,exact:true}).getByLabel(answer,{exact:true}).check();
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/valuation-condition-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Next step'}).click();await page.getByText('Choose photos',{exact:true}).waitFor();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/valuation-photos-${width}.png`,fullPage:true});await page.getByRole('button',{name:'Next step'}).click();
 assert.equal(await page.getByRole('checkbox').isChecked(),false);
 for(const [name,value] of [['First name','Test'],['Last name','Seller'],['Email address','test@example.invalid'],['Mobile number','07123456789'],['Postcode','SW1A 1AA']])await page.getByLabel(new RegExp(name)).fill(value);
 await page.getByRole('checkbox').check();failSave=true;await page.waitForTimeout(800);await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/valuation-save-error-${width}.png`,fullPage:true});failSave=false;await page.getByRole('button',{name:'Retry save',exact:true}).click();await page.waitForTimeout(450);
 await page.getByLabel(/Last name/).fill('Immediate final edit');await page.getByRole('button',{name:'Complete my motorcycle profile'}).click();await page.getByText('Your motorcycle profile has been saved.',{exact:true}).waitFor();assert.equal(finalBody.seller.lastName,'Immediate final edit');assert.ok(submitted);assert.equal(finalBody.vehicle.model,'Restored motorcycle');
 assert.equal(await page.getByRole('link',{name:'Add more photos now'}).getAttribute('href'),'/seller#photos');const count=saves.length;await page.waitForTimeout(650);assert.equal(saves.length,count,'No stale save after submission');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/valuation-saved-${width}.png`,fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
 for(const path of ['/seller/recover','/seller/verify','/seller/invalid','/seller']){await page.goto(base+path);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${path.replaceAll('/','-').slice(1)}-${width}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,path+' overflow');}
 assert.deepEqual(errors,[]);results.push({width,height,passed:true,errors,failedRequests:requests,evidence:'FIXTURE ONLY'});await context.close();
}}finally{await browser.close();await writeFile(`${out}/browser-results.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));

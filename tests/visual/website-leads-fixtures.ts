import { listFilters, encodeLeadCursor, decodeLeadCursor, type LeadListRow } from "../../lib/website-lead-list";
import type { Page } from "@playwright/test";

export function fixtureLeads(): LeadListRow[] {
  return Array.from({ length: 1408 }, (_, index) => ({
    id: 1408-index, public_id: `00000000-0000-4000-8000-${String(index).padStart(12,"0")}`,
    received_at: new Date(Date.parse("2026-09-21T12:00:00Z")-Math.floor(index/3)*4*3600000).toISOString(), received_date_basis: "iso_offset",
    lead_source: index % 4 === 0 ? "motorgeeks" : "bike_buyer_uk", reg: index === 1407 ? "HISTORICAL1" : index === 1406 ? "ARCHIVEDHISTORY2" : `AB${index} CDE`,
    make: index % 2 ? "Honda" : "Ducati", model: index % 2 ? "CB650R" : "Multistrada V4 Rally Adventure Touring", year: "2021", mileage: "12000", price: "£8,500", location_town: "Portsmouth",
    status: index === 2 ? "dealer_claimed" : index === 3 ? "dealer_pool_available" : "new",
    opportunity_mode: index % 4 === 0 ? "marketplace_offer" : "direct_claim", marketplace_status: index % 4 === 0 ? "submitted" : null,
    portal_reviewed_at: index % 3 === 0 ? "2026-09-21T13:00:00Z" : null,
    portal_ready_at: index % 3 === 0 ? "2026-09-21T13:00:00Z" : null, archived_at: index === 1406 ? "2026-09-21T13:00:00Z" : null,
    valuation_status: "pending", retail_estimate: 9500, suggested_offer: 7500, estimated_margin: 2000, vehicle_check_status: index % 2 ? "pending" : "checked",
    photo_count: index % 5 === 0 ? 0 : 4, thumbnail_url: index % 5 === 0 ? null : `/bike-placeholder.svg?lead=${1408-index}`,
  }));
}
export async function mockLeadWorkspace(page: Page) {
  const leads = fixtureLeads();
  const requests: string[] = [];
  await page.route("**/api/dealer-portal/admin/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("release")) return route.fulfill({ json: { allocations: [], status: "dealer_pool_available" } });
    return route.fulfill({ json: { accounts: [{ id:"dealer-1",trading_name:"Example Motorcycles",account_status:"active" }], claims:[],notes:[],purchases:[],fees:[],ledger:[] } });
  });
  await page.route("**/api/website-leads**", async route => {
    requests.push(route.request().url());
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/bulk")) {
      const body=route.request().postDataJSON();
      return route.fulfill({json:{results:body.ids.map((id:number)=>({id,ok:id!==1406,error:id===1406?"Active opportunity cannot be archived":undefined}))}});
    }
    if (url.pathname.endsWith("/referrals")) return route.fulfill({json:{referrals:[]}});
    if (/\/website-leads\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split("/").pop()); const lead=leads.find(l=>l.id===id)!;
      return route.fulfill({json:{lead:{...lead,website:lead.lead_source,date:lead.received_at,created_at:lead.received_at,fname:"Example",lname:"Seller",phone:"07000000000",email:"seller@example.test",postcode:"PO1",images:[],resolved_images:["/bike-placeholder.svg?photo=1","/bike-placeholder.svg?photo=2"],latitude:50.8,longitude:-1.08}}});
    }
    if (url.searchParams.has("counts")) return route.fulfill({json:{summary:{total:1408,new:1300,needsReview:800,ready:40,released:20,receivedToday:4,pendingValuations:900}}});
    const f=listFilters(url.searchParams,new Date("2026-09-21T12:00:00Z"));
    const cursor=decodeLeadCursor(url.searchParams.get("cursor"),f);
    const filtered=leads.filter(l=>
      (f.include_archived || !l.archived_at) && (!f.q || `${l.id} ${l.reg} ${l.make} ${l.model}`.toLowerCase().includes(f.q.toLowerCase())) &&
      (!f.source||l.lead_source===f.source)&&(!f.mode||l.opportunity_mode===f.mode)&&(!f.status||l.status===f.status||l.marketplace_status===f.status)&&
      (f.review!=="not_reviewed"||!l.portal_reviewed_at)&&(f.review!=="reviewed"||Boolean(l.portal_reviewed_at))&&
      (!f.from||l.received_at>=f.from)&&(!f.to||l.received_at<f.to)&&
      (f.view!=="needs_review"||(!l.portal_reviewed_at&&l.status==="new"))&&(f.view!=="ready"||(Boolean(l.portal_ready_at)&&l.status==="new"))&&
      (f.view!=="archived"||Boolean(l.archived_at))&&(f.view!=="backlog"||l.received_at<f.backlog_before)&&
      (f.view!=="released"||l.status==="dealer_pool_available")&&(f.view!=="active"||l.status==="dealer_claimed")&&
      (!cursor||l.received_at<cursor.at||(l.received_at===cursor.at&&l.id<cursor.id)));
    const rows=filtered.slice(0,50),hasMore=filtered.length>50;
    return route.fulfill({json:{leads:rows,hasMore,nextCursor:hasMore?encodeLeadCursor(rows[rows.length-1],f):null},headers:{"Cache-Control":"no-store"}});
  });
  return { leads, requests };
}

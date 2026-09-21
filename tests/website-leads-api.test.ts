import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import Module from "node:module";
import { readFileSync } from "node:fs";

// Exercise the actual HTTP handlers with auth/database dependencies isolated.
// No migration or production mutations are executed by this test.
const require = createRequire(import.meta.url);
const loader = Module as unknown as { _load: (name: string, parent: unknown, main: boolean) => unknown };
const originalLoad = loader._load;
let role: string | null = null;
let active = true;
let calls: { name: string; args: Record<string, unknown> }[] = [];
let signedBatches = 0;
let rows: Record<string, unknown>[] = [];
let commitError: { message: string; code: string } | null = null;
const db = {
  rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "staff_website_lead_action") return args.p_id === 2 ? { data: null, error: { message: "Active opportunity cannot be archived" } } : { data: { id: args.p_id, ok: true }, error: null };
    return { data: rows, error: commitError };
  },
  storage: { from: () => ({ createSignedUrls: async (paths: string[]) => { signedBatches++; return { data: paths.map(path => ({ path, signedUrl: `https://private.example/${path}` })), error: null }; } }) },
};
loader._load = function(name, parent, main) {
  if (name === "server-only") return {};
  if (name === "next/headers") return { headers: async () => new Headers() };
  if (name === "@/lib/supabase/server") return { createClient: async () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { role, active }, error: null }) };
    return { auth: { getUser: async () => ({ data: { user: role ? { id: "staff-id" } : null } }) }, from: () => query };
  } };
  if (name === "@/lib/supabase-admin") return { getSupabaseAdminClient: () => db };
  return originalLoad.call(this, name, parent, main);
};
const { GET } = require("../app/api/website-leads/route.ts") as { GET: (request: Request) => Promise<Response> };
const { POST } = require("../app/api/website-leads/bulk/route.ts") as { POST: (request: Request) => Promise<Response> };
loader._load = originalLoad;

test("real list handler denies signed-out, dealer roles and inactive staff before database access", async () => {
  for (const candidate of [null,"dealer_admin","dealer_user","future_role","admin"]) {
    role = candidate; calls=[];
    const response = await GET(new Request("http://localhost/api/website-leads"));
    assert.equal(response.status,401); assert.equal(calls.length,0); assert.equal((await response.json()).leads,undefined);
  }
  role="team_member"; active=false;
  assert.equal((await GET(new Request("http://localhost/api/website-leads"))).status,401);
  active=true;
});
test("authorised staff get 50 lightweight rows, one batched thumbnail each and a stable cursor",async()=>{
  role="team_member"; calls=[]; signedBatches=0;
  rows=Array.from({length:51},(_,i)=>({id:2000-i,received_at:"2026-09-21T12:00:00.123456Z",thumbnail_bucket:"private",thumbnail_path:`${i}.jpg`,thumbnail_url:null,photo_count:4,raw_payload:{private:true},fname:"Private customer",autotrader_vehicle_check_data:{private:true}}));
  const r=await GET(new Request("http://localhost/api/website-leads")); const p=await r.json();
  assert.equal(r.status,200); assert.equal(p.leads.length,50); assert.equal(p.hasMore,true); assert.equal(signedBatches,1);
  assert.equal(calls[0].args.p_limit,51);
  assert.equal(p.leads[0].thumbnail_bucket,undefined); assert.equal(p.leads[0].thumbnail_path,undefined);
  assert.ok(p.leads.every((l: Record<string,unknown>)=>!l.images&&!l.raw_payload));
  assert.equal(p.leads[0].fname,undefined); assert.equal(p.leads[0].autotrader_vehicle_check_data,undefined);
  calls=[]; await GET(new Request(`http://localhost/api/website-leads?cursor=${p.nextCursor}`));
  assert.equal(calls[0].args.p_id,1951); assert.equal(calls[0].args.p_at,"2026-09-21T12:00:00.123456Z");
});
test("historical search and date/source filters are passed to the server, never applied after paging",async()=>{
  calls=[]; rows=[{id:1,received_at:"2017-12-17T00:33:00Z",thumbnail_url:null}];
  const r=await GET(new Request("http://localhost/api/website-leads?q=historical&period=30"));
  assert.equal((await r.json()).leads[0].id,1);
  assert.deepEqual((calls[0].args.p_filters as Record<string,unknown>).from,null);
  calls=[]; await GET(new Request("http://localhost/api/website-leads?period=custom&from=2026-08-01&to=2026-08-31&source=motorgeeks&review=not_reviewed"));
  const f=calls[0].args.p_filters as Record<string,unknown>;
  assert.equal(f.from,"2026-07-31T23:00:00.000Z"); assert.equal(f.source,"motorgeeks"); assert.equal(f.review,"not_reviewed");
  const sql=readFileSync("supabase/migrations/20260921000200_website_lead_review_pagination.sql","utf8");
  assert.ok(sql.indexOf("p_filters->>'q'")<sql.indexOf("limit least(greatest(p_limit"));
  assert.match(sql,/\(l.received_at,l.id\)<\(p_at,p_id\)/);
});
test("missing migration fails closed without falling back to select all",async()=>{
  commitError={code:"PGRST202",message:"not found"};
  const r=await GET(new Request("http://localhost/api/website-leads")); assert.equal(r.status,503); assert.match((await r.json()).error,/migration/); commitError=null;
});
test("bulk handler reports independent per-lead successes and refused active opportunities",async()=>{
  role="dealer_user";
  const request=()=>new Request("http://localhost/api/website-leads/bulk",{method:"POST",body:JSON.stringify({ids:[1,2],action:"archive"})});
  assert.equal((await POST(request())).status,401);
  role="team_member"; calls=[];
  const r=await POST(request()); const p=await r.json();
  assert.deepEqual(p.results.map((x:{ok:boolean})=>x.ok),[true,false]);
  assert.ok(calls.every(c=>c.args.p_actor==="staff-id"));
  const sql=readFileSync("supabase/migrations/20260921000200_website_lead_review_pagination.sql","utf8");
  assert.match(sql,/where id=p_id for update/); assert.match(sql,/marketplace_accepted_offer_id is not null/); assert.match(sql,/revoke all on function/);
});

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import Module from "node:module";

const require = createRequire(import.meta.url);
const loader = Module as unknown as { _load: (name: string, parent: unknown, main: boolean) => unknown };
const originalLoad = loader._load;
const caches: Map<string, Promise<unknown>>[] = [];
let rpcCalls: { name: string; args: unknown }[] = [];
let reads: { table: string; select?: string; head?: boolean; range?: number[]; conditions: unknown[][] }[] = [];
let rpcError: { code: string; message: string } | null = null;
let rows: Record<string, unknown>[] = [];
const generatedAt = "2026-10-20T12:00:00.000Z";
const analytics = { totalRows: 150, filteredRows: 150, activeCount: 110, removedCount: 40, dealerCount: 5,
  averageAskingPrice: 3500, medianAskingPrice: 3200, averageDaysLive: 14,
  dealerLeaderboard: [], makeModelSoldCounts: [], activeStockByDealer: [], removedTrend: [] };
const db = {
  rpc: async (name: string, args: unknown) => {
    rpcCalls.push({ name, args });
    if (rpcError) return { data: null, error: rpcError };
    return { error: null, data: name === "get_market_intelligence_bootstrap"
      ? { summary: analytics, options: { dealerNames: ["Alpha"], makes: ["Yamaha"], models: ["MT-125"], years: ["2023"] }, generatedAt }
      : { ...analytics, generatedAt } };
  },
  from: (table: string) => {
    const read: typeof reads[number] = { table, conditions: [] }; reads.push(read);
    const query = {
      select: (value: string, options?: { head?: boolean }) => { read.select = value; read.head = options?.head; return query; },
      eq: (...args: unknown[]) => { read.conditions.push(["eq", ...args]); return query; },
      ilike: (...args: unknown[]) => { read.conditions.push(["ilike", ...args]); return query; },
      gte: (...args: unknown[]) => { read.conditions.push(["gte", ...args]); return query; },
      lte: (...args: unknown[]) => { read.conditions.push(["lte", ...args]); return query; },
      order: (...args: unknown[]) => { read.conditions.push(["order", ...args]); return query; },
      range: (from: number, to: number) => { read.range = [from, to]; return query; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null, count: rows.length,
        data: read.head ? null : read.range ? rows.slice(read.range[0], read.range[1] + 1) : rows }).then(resolve),
    };
    return query;
  },
};
loader._load = function(name, parent, main) {
  if (name === "server-only") return {};
  if (name === "@/lib/supabase/admin") return { getSupabaseAdmin: () => db };
  if (name === "next/cache") return { unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => {
    const cache = new Map<string, Promise<unknown>>(); caches.push(cache);
    return (...args: unknown[]) => {
      const key = JSON.stringify(args);
      if (!cache.has(key)) cache.set(key, Promise.resolve().then(() => fn(...args)).catch(error => { cache.delete(key); throw error; }));
      return cache.get(key);
    };
  } };
  return originalLoad.call(this, name, parent, main);
};
const { GET } = require("../app/api/market-intelligence/route.ts") as { GET: (request: Request) => Promise<Response> };
loader._load = originalLoad;
const request = (query = "") => GET(new Request(`http://localhost/api/market-intelligence?${query}`));
beforeEach(() => {
  caches.forEach(cache => cache.clear()); rpcCalls = []; reads = []; rpcError = null;
  rows = Array.from({ length: 150 }, (_, index) => ({ listing_id: index + 1, make: "Yamaha", model: "MT-125", year: "2023",
    listing_status: "Active", dealer_or_private: "Dealer", dealer_name: "Alpha", listed_price: 3999,
    mileage: 1000, first_seen_date: "2026-10-01", last_seen_date: "2026-10-20", advert_url: `https://example.test/${index + 1}` }));
});

test("summary and suggestions share the fast bootstrap and report snapshot freshness", async () => {
  const [summary, options] = await Promise.all([request(), request("options=filters")]);
  assert.equal(summary.status, 200); assert.equal(options.status, 200);
  const body = await summary.json();
  assert.equal(body.analytics.totalRows, 150); assert.equal(body.meta.generatedAt, generatedAt);
  assert.deepEqual(body.rows, []); assert.equal(body.meta.summaryOnly, true);
  assert.deepEqual((await options.json()).options.makes, ["Yamaha"]);
  assert.deepEqual(rpcCalls.map(call => call.name), ["get_market_intelligence_bootstrap"]);
  assert.equal(reads.length, 0);
});

test("pagination and sorting reuse analytics while requesting only the current snapshot page", async () => {
  const first = await (await request("make=Yamaha&page=1&pageSize=50")).json();
  const second = await (await request("make=Yamaha&page=2&pageSize=50&sort=price&direction=asc")).json();
  assert.equal(first.rows.length, 50); assert.equal(second.rows[0].listingId, "51");
  assert.equal(second.pagination.total, 150); assert.equal(second.pagination.pages, 3);
  assert.equal(rpcCalls.length, 1); assert.equal(rpcCalls[0].name, "get_market_intelligence_analytics");
  assert.ok(reads.every(read => read.table === "market_intelligence_snapshot" && !read.head && read.select !== "*"));
  assert.deepEqual(reads[1].range, [50, 99]);
  assert.ok(reads[1].conditions.some(c => c[0] === "order" && c[1] === "listing_id"));
  await request("make=Honda"); assert.equal(rpcCalls.length, 2);
});

test("numeric, status and date constraints target the typed reporting columns", async () => {
  await request("listingStatus=Active&dealerPrivate=Dealer&year=2023&minPrice=1000&maxMileage=5000&to=2026-10-20");
  assert.ok(reads[0].conditions.some(c => JSON.stringify(c) === JSON.stringify(["gte", "listed_price", 1000])));
  assert.ok(reads[0].conditions.some(c => JSON.stringify(c) === JSON.stringify(["eq", "listing_status", "active"])));
  assert.ok(reads[0].conditions.some(c => JSON.stringify(c) === JSON.stringify(["lte", "last_seen_date", "2026-10-20"])));
});

test("failed aggregates are retryable and never trigger a source-table scan or count fallback", async () => {
  rpcError = { code: "57014", message: "canceling statement due to statement timeout" };
  const failure = await request(); assert.equal(failure.status, 500);
  assert.match((await failure.json()).error, /retry|narrower/i); assert.equal(reads.length, 0);
  rpcError = null;
  assert.equal((await request()).status, 200); assert.equal(rpcCalls.length, 2);
});

test("CSV exports every matching snapshot row rather than only the displayed page", async () => {
  rows = Array.from({ length: 1005 }, (_, i) => ({ listing_id: i + 1, make: "Yamaha", listed_price: 1000 + i, dealer_name: 'Alpha, "Bikes"' }));
  const response = await request("format=csv&page=2&pageSize=25");
  assert.equal(response.status, 200); assert.match(response.headers.get("Content-Type") || "", /text\/csv/);
  const csv = await response.text(); const lines = csv.trim().split("\n");
  assert.equal(lines.length, 1006); assert.match(lines[1], /^1,/); assert.match(lines.at(-1) || "", /^1005,/);
  assert.match(lines[1], /"Alpha, ""Bikes"""/);
  assert.equal(rpcCalls.length, 0); assert.ok(reads.every(read => read.table === "market_intelligence_snapshot"));
  assert.deepEqual(reads.filter(read => read.range).map(read => read.range), [[0, 999], [1000, 1004]]);
});

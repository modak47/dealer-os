import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("market reporting snapshot preserves analytics, source data and access boundaries", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema cron;
      create table cron.jobs(name text primary key, schedule text, command text);
      create function cron.schedule(text,text,text) returns bigint language plpgsql as $$
        begin insert into cron.jobs values ($1,$2,$3) on conflict(name) do update set schedule=$2,command=$3; return 1; end;
      $$;
      create table public.autotrader_listings (
        "Listing ID" bigint primary key, "Listing Status" text, "Dealer or Private" text,
        "Dealer Name" text, "Make" text, "Model" text, "Derivative ID" text, "Variant" text,
        "Year" text, "Listed Price" text, "Mileage" text, "Days Live" text,
        "Location" text, "Dealer Postcode" text, "Postcode Area" text,
        "First Seen Date" text, "Last Seen Date" text, "Source URL" text
      );
      insert into public.autotrader_listings values
        (1,'Active','Dealer','Alpha','Yamaha','MT-125','ABS','ABS','2023','£3,999','1,000','10','Crawley','RH1',null,'2026-10-01','2026-10-20','https://example.test/1'),
        (2,'Removed','Dealer','Alpha','Yamaha','MT-125','ABS','ABS','2022','2999','5000','20','London','SW1',null,'2026-09-01','2026-10-19','https://example.test/2'),
        (3,'Removed','Private',null,'Honda','CB125F',null,'Standard','2021','1999','7000',null,'Brighton',null,'BN','2026-09-01','2026-10-18','https://example.test/3'),
        (4,'Active','Dealer','Beta','Honda','CB650R',null,'Standard','2024','bad','unknown','0',null,null,null,null,'2026-10-20','https://example.test/4');
    `);
    await db.exec(readFileSync("supabase/migrations/20260717140000_autotrader_listing_count_rpc.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20260724000100_autotrader_market_summary_rpc.sql", "utf8"));
    const originalSource = (await db.query('select * from public.autotrader_listings order by "Listing ID"')).rows;
    const scannerBefore = (await db.query("select pg_get_functiondef('public.get_autotrader_listing_count()'::regprocedure) as definition")).rows;
    await db.exec(readFileSync("supabase/migrations/20261020000100_market_intelligence_reporting_snapshot.sql", "utf8"));

    assert.deepEqual((await db.query('select * from public.autotrader_listings order by "Listing ID"')).rows, originalSource);
    assert.deepEqual((await db.query("select pg_get_functiondef('public.get_autotrader_listing_count()'::regprocedure) as definition")).rows, scannerBefore);
    for (const filters of [{}, { make: "Yamaha" }, { listingStatus: "Removed" }, { dealerPrivate: "Private" },
      { minPrice: "2500", maxPrice: "4000" }, { from: "2026-10-19", to: "2026-10-20" },
      { dealerName: "alpha", minMileage: "3000" }, { model: "MT-125", year: "2022" }, { make: "No matches" }]) {
      const result = await db.query<{ old: Record<string, unknown>; current: Record<string, unknown> }>(
        "select public.get_autotrader_filtered_analytics($1::jsonb) as old, public.get_market_intelligence_analytics($1::jsonb) - 'generatedAt' as current", [JSON.stringify(filters)]);
      assert.deepEqual(result.rows[0].current, result.rows[0].old, JSON.stringify(filters));
    }
    const bootstrap = (await db.query<{ value: { summary: { totalRows: number }; options: { makes: string[] }; generatedAt: string } }>("select public.get_market_intelligence_bootstrap() as value")).rows[0].value;
    assert.equal(bootstrap.summary.totalRows, 4);
    assert.deepEqual(bootstrap.options.makes, ["Honda", "Yamaha"]);
    assert.ok(bootstrap.generatedAt);
    assert.equal((await db.query<{ name: string }>("select name from cron.jobs")).rows[0].name, "dealeros-market-intelligence-refresh");

    // A malformed source date must not stop the entire reporting refresh.
    await db.exec(`update public.autotrader_listings set "Last Seen Date"='2026-02-31' where "Listing ID"=4;
      select public.refresh_market_intelligence();`);
    assert.equal((await db.query<{ date: string | null }>("select last_seen_date as date from public.market_intelligence_snapshot where listing_id=4")).rows[0].date, null);
    assert.equal((await db.query<{ count: number }>("select public.get_autotrader_listing_count()::integer as count")).rows[0].count, 4);

    // Concurrent refresh and metadata publish form one transaction: rollback
    // must retain both the previous rows and their timestamp.
    const stable = (await db.query("select public.get_market_intelligence_bootstrap() as data")).rows;
    await db.exec(`begin; delete from public.autotrader_listings where "Listing ID"=1;
      select public.refresh_market_intelligence(); rollback;`);
    assert.deepEqual((await db.query("select public.get_market_intelligence_bootstrap() as data")).rows, stable);
    assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from public.market_intelligence_snapshot")).rows[0].count, 4);

    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select * from public.market_intelligence_snapshot"), /permission denied/);
      await assert.rejects(db.query("select public.get_market_intelligence_bootstrap()"), /permission denied/);
      await assert.rejects(db.query("select public.refresh_market_intelligence()"), /permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.ok((await db.query("select public.get_market_intelligence_bootstrap()")).rows.length);
    assert.ok((await db.query("select * from public.market_intelligence_snapshot")).rows.length);
    await assert.rejects(db.query("select public.refresh_market_intelligence()"), /permission denied/);
  } finally { await db.close(); }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync("supabase/migrations/20261001000100_staff_lead_workflow_views.sql", "utf8");

test("isolated PostgreSQL: simplified staff workflow views reconcile without contradictory stages", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create table public.website_leads(
        id bigint primary key, public_id uuid default gen_random_uuid(), received_at timestamptz not null,
        received_date_basis text default 'submitted_at', lead_source text, website text, reg text, make text,
        model text, year text, mileage text, price text, location_town text, status text not null,
        opportunity_mode text not null, marketplace_status text, marketplace_accepted_offer_id uuid,
        marketplace_released_at timestamptz, portal_reviewed_at timestamptz, portal_ready_at timestamptz,
        archived_at timestamptz, valuation_status text, retail_estimate numeric, suggested_offer numeric,
        estimated_margin numeric, vehicle_check_status text, images jsonb default '[]', "Images" text,
        image1 text, image2 text, image3 text, image4 text, image5 text, image6 text, image7 text,
        image8 text, image9 text, image10 text, fname text, lname text, email text, phone text,
        postcode text, purchased_at timestamptz
      );
      create table public.dealer_lead_allocations(website_lead_id bigint, allocation_status text);
      create table public.dealer_lead_claims(website_lead_id bigint, status text);
      create table public.dealer_purchases(website_lead_id bigint);
      create table public.lead_photos(id uuid default gen_random_uuid(), website_lead_id bigint,
        storage_bucket text, storage_path text, sort_order int, status text default 'active');
      create function public.staff_lead_source(value text) returns text language sql immutable as $$
        select case when lower(coalesce(value,'')) like '%motorgeeks%' then 'motorgeeks' else coalesce(value,'unknown') end
      $$;
      create function public.staff_lead_is_blocked(l public.website_leads) returns boolean language sql stable as $$
        select l.status in ('purchased','internal_buying','purchase_agreed','dealer_claimed','dealer_purchased','closed','declined','accepted')
          or coalesce(l.marketplace_status in ('offer_accepted','purchase_pending','purchased','closed','cancelled'),false)
      $$;
      create function public.staff_lead_is_distributed(l public.website_leads) returns boolean language sql stable as $$
        select l.status in ('dealer_pool_available','dealer_allocated')
          or coalesce(l.marketplace_status in ('live_to_dealers','offer_received'),false)
      $$;
    `);

    const rows = [
      [1, "direct_claim", "new", null, null, null, null, "bike_buyer_uk", "12300"],
      [2, "direct_claim", "new", null, "2026-10-01", null, null, "bike_buyer_uk", null],
      [3, "direct_claim", "new", null, "2026-10-01", "2026-10-01", null, "bike_buyer_uk", null],
      [4, "direct_claim", "dealer_pool_available", null, "2026-10-01", null, null, "bike_buyer_uk", null],
      [5, "direct_claim", "dealer_claimed", null, "2026-10-01", null, null, "bike_buyer_uk", null],
      [6, "direct_claim", "referred_to_dealer", null, "2026-10-01", null, null, "bike_buyer_uk", null],
      [7, "direct_claim", "purchase_agreed", null, "2026-10-01", null, null, "bike_buyer_uk", null],
      [8, "direct_claim", "dealer_purchased", null, "2026-10-01", null, null, "bike_buyer_uk", null],
      [9, "direct_claim", "dealer_purchased", null, "2026-10-01", null, "2026-10-01", "bike_buyer_uk", null],
      [10, "marketplace_offer", "reviewing", "submitted", null, null, null, "motorgeeks.co.uk", null],
      [11, "marketplace_offer", "reviewing", "under_review", "2026-10-01", "2026-10-01", null, "motorgeeks.co.uk", null],
      [12, "marketplace_offer", "reviewing", "live_to_dealers", "2026-10-01", null, null, "motorgeeks.co.uk", null],
      [13, "marketplace_offer", "reviewing", "offer_received", "2026-10-01", null, null, "motorgeeks.co.uk", null],
      [14, "marketplace_offer", "dealer_claimed", "offer_accepted", "2026-10-01", null, null, "motorgeeks.co.uk", null],
      [15, "marketplace_offer", "dealer_purchased", "purchased", "2026-10-01", null, null, "motorgeeks.co.uk", null],
      [16, "marketplace_offer", "reviewing", "cancelled", "2026-10-01", null, null, "motorgeeks.co.uk", null],
      [17, "marketplace_offer", "reviewing", "submitted", null, null, "2026-10-01", "motorgeeks.co.uk", null],
      [18, "direct_claim", "dealer_returned", null, "2026-10-01", null, null, "bike_buyer_uk", null],
    ];
    for (const [id, mode, status, marketplace, reviewed, ready, archived, source, price] of rows) {
      await db.query(`insert into website_leads(id,received_at,lead_source,reg,status,opportunity_mode,marketplace_status,
        portal_reviewed_at,portal_ready_at,archived_at,price,purchased_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, `2026-10-${String(20 - Number(id)).padStart(2, "0")}T12:00:00Z`, source, `QA${id}`, status, mode, marketplace, reviewed, ready, archived, price,
          [8, 9, 15].includes(Number(id)) ? "2026-10-01" : null]);
    }
    await db.exec(`
      update website_leads set suggested_offer=9000 where id=1;
      insert into dealer_lead_allocations values (4,'available'),(8,'claimed'),(9,'claimed'),(12,'available');
      insert into dealer_lead_claims values (5,'contacted'),(7,'agreed'),(8,'purchased'),(9,'purchased');
      insert into dealer_purchases values (8),(9),(15);
    `);

    await db.exec(migration);

    const idsFor = async (view: string, includeArchived = false) => {
      const result = await db.query<{ id: number }>(`select (item->>'id')::int id from public.staff_website_leads_list(
        jsonb_build_object('view',$1::text,'include_archived',$2::boolean),null,null,51) item order by id`, [view, includeArchived]);
      return result.rows.map(row => row.id);
    };
    const website = {
      needs_review: await idsFor("needs_review"),
      ready: await idsFor("ready"),
      released: await idsFor("released"),
      closed: await idsFor("closed"),
      archived: await idsFor("archived", true),
    };
    assert.deepEqual(website, {
      needs_review: [1, 2, 10, 18],
      ready: [3, 11],
      released: [4, 5, 6, 7, 12, 13, 14],
      closed: [8, 15, 16],
      archived: [9, 17],
    });
    assert.deepEqual([...new Set(Object.values(website).flat())].sort((a, b) => a - b), rows.map(row => Number(row[0])));
    assert.equal(Object.values(website).flat().length, rows.length);

    const dealer = {
      ready: await idsFor("ready"),
      live: await idsFor("live"),
      offers: await idsFor("offers"),
      deals_agreed: await idsFor("deals_agreed"),
      completed: await idsFor("completed", true),
    };
    assert.deepEqual(dealer, {
      ready: [3, 11],
      live: [4, 5, 6, 12],
      offers: [13],
      deals_agreed: [7, 14],
      completed: [8, 9, 15],
    });
    const dealerActive = [dealer.ready, dealer.live, dealer.offers, dealer.deals_agreed];
    assert.equal(dealerActive.flat().length, new Set(dealerActive.flat()).size);
    assert.equal(website.released.includes(8), false, "historical allocation must not keep a purchase in Sent to Dealers");

    const countsResult = await db.query<{ staff_website_leads_counts: Record<string, number> }>(
      "select public.staff_website_leads_counts('2026-10-01','2026-09-24','2026-10-01')",
    );
    const counts = countsResult.rows[0].staff_website_leads_counts;
    assert.equal(counts.needsReview, website.needs_review.length);
    assert.equal(counts.ready, website.ready.length);
    assert.equal(counts.released, website.released.length);
    assert.equal(counts.closed, website.closed.length);
    assert.equal(counts.archived, website.archived.length);
    assert.equal(counts.live, dealer.live.length);
    assert.equal(counts.offers, dealer.offers.length);
    assert.equal(counts.dealsAgreed, dealer.deals_agreed.length);
    assert.equal(counts.completed, dealer.completed.length);

    const priced = await db.query<{ item: Record<string, unknown> }>(
      "select item from public.staff_website_leads_list(jsonb_build_object('q','QA1'),null,null,51) item where item->>'id'='1'",
    );
    assert.equal(priced.rows[0].item.price, "12300");
    assert.equal(priced.rows[0].item.suggested_offer, 9000, "the backwards-compatible internal RPC value is retained");

    const privileges = await db.query<{ anon: boolean; authenticated: boolean; service_role: boolean }>(`
      select has_function_privilege('anon','public.staff_website_leads_list(jsonb,timestamptz,bigint,integer)','execute') anon,
        has_function_privilege('authenticated','public.staff_website_leads_list(jsonb,timestamptz,bigint,integer)','execute') authenticated,
        has_function_privilege('service_role','public.staff_website_leads_list(jsonb,timestamptz,bigint,integer)','execute') service_role
    `);
    assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, service_role: true });
  } finally {
    await db.close();
  }
});

test("workflow migration is transactional function replacement only", () => {
  assert.match(migration, /^--[\s\S]*\nbegin;/);
  assert.match(migration, /commit;\s*$/);
  assert.doesNotMatch(migration, /alter table|create table|drop table|\bupdate\s+public\.|\bdelete\s+from|\binsert\s+into/i);
  assert.equal((migration.match(/create or replace function/g) ?? []).length, 2);
});

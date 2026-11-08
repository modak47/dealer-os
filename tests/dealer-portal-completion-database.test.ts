import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("real SQL: membership limits, failed marketplace sales, isolation and transaction rollback", async () => {
  const db = new PGlite();
  const dealer = randomUUID(), other = randomUUID(), user = randomUUID(), claim = randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table dealer_portal_accounts(id uuid primary key, account_status text);
      create table dealer_portal_users(id uuid primary key default gen_random_uuid(),user_id uuid,dealer_account_id uuid,active boolean,unique(dealer_account_id,user_id));
      create table website_leads(id bigint primary key,opportunity_mode text,marketplace_status text,accepted_offer_dealer_account_id uuid,status text,updated_at timestamptz);
      create table dealer_lead_claims(id uuid primary key,website_lead_id bigint,dealer_account_id uuid,status text,lost_reason text,outcome_at timestamptz,returned_at timestamptz,updated_at timestamptz);
      create table dealer_purchases(id uuid primary key,claim_id uuid);
      create table dealer_lead_notes(website_lead_id bigint,claim_id uuid,dealer_account_id uuid,dealer_user_id uuid,note_type text,body text);
      create table dealer_portal_audit_events(website_lead_id bigint,dealer_account_id uuid,dealer_user_id uuid,event_type text,event_data jsonb);
      grant usage on schema public to service_role,anon,authenticated;`);
    await db.exec(readFileSync("supabase/migrations/20261108000100_dealer_portal_completion.sql", "utf8"));
    await db.query("insert into dealer_portal_accounts values($1,'active'),($2,'active')", [dealer, other]);
    await db.query("insert into dealer_portal_users(user_id,dealer_account_id,active) values($1,$2,true)", [user, dealer]);
    for (let n = 0; n < 3; n++) await db.query("insert into dealer_portal_users(user_id,dealer_account_id,active) values($1,$2,true)", [randomUUID(), dealer]);
    await assert.rejects(db.query("insert into dealer_portal_users(user_id,dealer_account_id,active) values($1,$2,true)", [randomUUID(), dealer]), /limited/);
    await assert.rejects(db.query("insert into dealer_portal_users(user_id,dealer_account_id,active) values($1,$2,true)", [user, other]), /another dealer/);
    const inactive = randomUUID();
    await db.query("insert into dealer_portal_users(id,user_id,dealer_account_id,active) values($1,$2,$3,false)", [inactive, randomUUID(), dealer]);
    await assert.rejects(db.query("update dealer_portal_users set active=true where id=$1", [inactive]), /limited/);
    // Updating an existing active membership must not count that person twice.
    await db.query("update dealer_portal_users set active=true where user_id=$1", [user]);
    await db.query("insert into dealer_portal_users(user_id,dealer_account_id,active) values($1,$2,true) on conflict(dealer_account_id,user_id) do update set active=true", [user, dealer]);
    await db.query("insert into website_leads values(1,'marketplace_offer','offer_accepted',$1,'dealer_claimed',now()),(2,'direct_claim',null,null,'dealer_claimed',now())", [dealer]);
    await db.query("insert into dealer_lead_claims(id,website_lead_id,dealer_account_id,status) values($1,1,$2,'agreed_to_purchase')", [claim, dealer]);
    const update = (status: string, account = dealer, actor = user) => db.query<{ claim: { status: string } }>("select dealer_update_marketplace_claim($1,$2,$3,$4,'Customer sold elsewhere',null) as claim", [claim, account, actor, status]);
    await db.exec("set role anon"); await assert.rejects(update("lost"), /permission denied/); await db.exec("reset role");
    await db.exec("set role authenticated"); await assert.rejects(update("lost"), /permission denied/); await db.exec("reset role");
    await assert.rejects(update("lost", other), /Active dealer access/);
    await assert.rejects(update("lost", dealer, randomUUID()), /Active dealer access/);
    await assert.rejects(update("contacted"), /not available/);
    assert.equal((await update("collection_booked")).rows[0].claim.status, "collection_booked");
    assert.equal((await db.query<{ status: string }>("select marketplace_status status from website_leads where id=1")).rows[0].status, "purchase_pending");
    // A failure in the last write rolls back claim and seller state as well.
    await db.exec("alter table dealer_portal_audit_events add constraint injected_failure check(event_type <> 'marketplace_claim_status_updated') not valid");
    await assert.rejects(update("lost"), /injected_failure/);
    assert.equal((await db.query<{ status: string }>("select status from dealer_lead_claims where id=$1", [claim])).rows[0].status, "collection_booked");
    await db.exec("alter table dealer_portal_audit_events drop constraint injected_failure");
    assert.equal((await update("lost")).rows[0].claim.status, "lost");
    assert.equal((await db.query<{ status: string }>("select marketplace_status status from website_leads where id=1")).rows[0].status, "cancelled");
    const notesBefore = (await db.query<{ n: number }>("select count(*)::int n from dealer_lead_notes")).rows[0].n;
    await update("lost");
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from dealer_lead_notes")).rows[0].n, notesBefore);
    await assert.rejects(update("agreed_to_purchase"), /already completed or closed/);
    assert.equal((await db.query<{ status: string }>("select status from website_leads where id=2")).rows[0].status, "dealer_claimed");
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from dealer_purchases")).rows[0].n, 0);
    // A reported purchase cannot be lost, including a partially reconciled claim.
    await db.query("update dealer_lead_claims set status='agreed_to_purchase' where id=$1", [claim]);
    await db.query("update website_leads set marketplace_status='offer_accepted' where id=1");
    await db.query("insert into dealer_purchases values($1,$2)", [randomUUID(), claim]);
    await assert.rejects(update("lost"), /reported purchase/);
  } finally { await db.close(); }
});

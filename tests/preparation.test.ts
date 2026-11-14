import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { inactivePreparationReason, preparationView } from "../lib/preparation-policy";

test("preparation separates active work, retired/completed history and unlinked tasks", () => {
  for (const status of ["Sold", "Sale Completed", "Purchase Cancelled", "Purchase Pending", "Archived", "Delivered", "sale_completed"]) {
    assert.ok(inactivePreparationReason({ status }));
    assert.equal(preparationView({ status: "pending", bike: { status } }), "history");
  }
  for (const status of ["In Stock", "Awaiting Preparation", "Reserved", "Sale Pending"]) {
    assert.equal(inactivePreparationReason({ status }), null);
    assert.equal(preparationView({ status: "pending", bike: { status } }), "active");
    assert.equal(preparationView({ status: "completed", bike: { status } }), "history");
  }
  assert.equal(preparationView({ status: "blocked", bike: null }), "unlinked");
  assert.ok(inactivePreparationReason({ status: "In Stock", is_test_record: true }));
});

test("PostgreSQL task actions, stock status sync, guards and rollback use the actual migration", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table stock_bikes(id bigint primary key,status text,is_test_record boolean default false,workshop_status text,valeting_status text,photo_status text);
      create table dealer_users(id uuid primary key,role text,active boolean);
      create table stock_workflow_tasks(id uuid primary key default gen_random_uuid(),stock_bike_id text,department text,status text,notes text,assigned_to text,
        started_at timestamptz,completed_at timestamptz,completed_by text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(stock_bike_id,department));
      create function touch_task() returns trigger language plpgsql as $$ begin new.updated_at = clock_timestamp(); return new; end $$;
      create trigger touch_task before update on stock_workflow_tasks for each row execute function touch_task();
      insert into dealer_users values ('00000000-0000-0000-0000-000000000001','team_member',true),('00000000-0000-0000-0000-000000000002','dealer_user',true);
      insert into stock_bikes(id,status) values (1,'In Stock'),(2,'Sale Completed'),(3,'Purchase Pending'),(4,'Reserved');
      insert into stock_bikes(id,status,workshop_status) values (5,'In Stock','PDI complete');`);
    await db.exec(readFileSync("supabase/migrations/20261114000100_preparation_lifecycle.sql", "utf8"));
    for (const id of [1, 2, 3, 4, 5, 999]) await db.query<Record<string, unknown>>("select stock_workflow_create_defaults($1)", [String(id)]);
    assert.equal((await db.query<Record<string, unknown>>("select count(*)::int n from stock_workflow_tasks")).rows[0].n, 12);
    assert.equal((await db.query<Record<string, unknown>>("select status from stock_workflow_tasks where stock_bike_id='5' and department='Workshop Preparation'")).rows[0].status, "completed");
    await db.query<Record<string, unknown>>("select stock_workflow_create_defaults('1')");
    assert.equal((await db.query<Record<string, unknown>>("select count(*)::int n from stock_workflow_tasks")).rows[0].n, 12);
    const task = async (department: string, id = "1") => (await db.query<{ id: string; status: string; updated_at: string; started_at: string; completed_at: string; notes: string }>("select *,updated_at::text as updated_at,started_at::text as started_at,completed_at::text as completed_at from stock_workflow_tasks where stock_bike_id=$1 and department=$2", [id, department])).rows[0];
    const actor = "00000000-0000-0000-0000-000000000001";
    const act = (id: string, action: string, extra = {}, expected: string | null = null, user = actor) => db.query<Record<string, unknown>>("select stock_workflow_update_task($1,$2::jsonb,$3,$4)", [id, JSON.stringify({ action, ...extra }), user, expected]);
    const w = await task("Workshop Preparation");
    await assert.rejects(act(w.id, "start", {}, null, "00000000-0000-0000-0000-000000000002"), /Staff access/);
    await assert.rejects(act(w.id, "block"), /Add a note/);
    await act(w.id, "start", { notes: "Inspect brakes" }, w.updated_at);
    const started = await task("Workshop Preparation");
    await assert.rejects(act(w.id, "complete", {}, w.updated_at), /changed since/);
    await act(w.id, "complete", {}, started.updated_at);
    const done = await task("Workshop Preparation");
    assert.equal(done.started_at, started.started_at);
    assert.ok(done.completed_at);
    assert.equal((await db.query<Record<string, unknown>>("select workshop_status from stock_bikes where id=1")).rows[0].workshop_status, "Completed");
    await act(w.id, "complete");
    assert.equal((await task("Workshop Preparation")).completed_at, done.completed_at);
    await act(w.id, "reopen");
    assert.equal((await task("Workshop Preparation")).completed_at, null);
    await db.query<Record<string, unknown>>("select stock_workflow_finish_pdi('1',$1,$2)", [actor,w.id]);
    assert.equal((await task("Workshop Preparation")).status, "completed");
    assert.equal((await db.query<Record<string, unknown>>("select workshop_status from stock_bikes where id=1")).rows[0].workshop_status, "PDI complete");
    await assert.rejects(db.query<Record<string, unknown>>("select stock_workflow_finish_pdi('4',$1,$2)", [actor,w.id]), /not found for this bike/);
    const wash = await task("Wash / Initial Valet"), final = await task("Final Valet");
    await act(wash.id, "complete");
    assert.equal((await db.query<Record<string, unknown>>("select valeting_status from stock_bikes where id=1")).rows[0].valeting_status, "In Progress");
    await act(final.id, "complete");
    assert.equal((await db.query<Record<string, unknown>>("select valeting_status from stock_bikes where id=1")).rows[0].valeting_status, "Completed");
    await act(final.id, "reopen");
    await act(final.id, "block", { notes: "Waiting for delivery date" });
    assert.equal((await db.query<Record<string, unknown>>("select valeting_status from stock_bikes where id=1")).rows[0].valeting_status, "Blocked");
    const photo = await task("Photos");
    await db.exec("alter table stock_bikes add constraint reject_photo_completion check(photo_status is distinct from 'Completed')");
    await assert.rejects(act(photo.id, "complete"), /reject_photo_completion/);
    assert.equal((await task("Photos")).status, "pending");
    await db.exec("alter table stock_bikes drop constraint reject_photo_completion; update stock_bikes set status='Sold' where id=1");
    await assert.rejects(act(photo.id, "start"), /no longer in active/);
    await db.exec("delete from stock_bikes where id=4");
    await assert.rejects(act((await task("Photos", "4")).id, "start"), /no longer exists/);
    await db.exec("update stock_bikes set is_test_record=true where id=5");
    await assert.rejects(act((await task("Photos", "5")).id, "start"), /no longer in active/);
    const privileges = (await db.query<Record<string, unknown>>("select has_function_privilege('authenticated','stock_workflow_update_task(uuid,jsonb,uuid,timestamptz)','EXECUTE') allowed")).rows[0];
    assert.equal(privileges.allowed, false);
  } finally { await db.close(); }
});

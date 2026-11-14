import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import Module from "node:module";

const require = createRequire(import.meta.url);
const loader = Module as unknown as { _load: (name: string, parent: unknown, main: boolean) => unknown };
const original = loader._load;
let authorised = true;
let rpcError: { code: string; message: string } | null = null;
let rpcCalls: Record<string, unknown>[] = [];
let taskRows: Record<string, unknown>[] = [];
let bikeRows: Record<string, unknown>[] = [];
let failBikes = false;
let reads: { table: string; from: number; size: number }[] = [];
const db = {
  rpc: async (name: string, args: Record<string, unknown>) => { rpcCalls.push({ name, ...args }); return { data: { id: args.p_task_id, status: "completed" }, error: rpcError }; },
  from: (table: string) => {
    let from = 0, to = 499, ids: string[] | null = null;
    const query = {
      select: () => query, order: () => query,
      range: (a: number, b: number) => { from = a; to = b; return query; },
      in: (_key: string, values: string[]) => { ids = values; return query; },
      then: (resolve: (v: unknown) => void) => {
        reads.push({ table, from, size: ids?.length || to - from + 1 });
        resolve({ data: table === "stock_bikes" ? bikeRows.filter(bike => ids?.includes(String(bike.id))) : taskRows.slice(from, to + 1), error: table === "stock_bikes" && failBikes ? { code: "XX001", message: "Connection failed" } : null });
      },
    }; return query;
  },
};
loader._load = function(name, parent, main) {
  if (name === "server-only") return {};
  if (name === "@/lib/supabase/admin") return { getSupabaseAdmin: () => db };
  if (name === "@/lib/auth/require-staff") return { requireStaffUser: async () => authorised ? { id: "00000000-0000-0000-0000-000000000001" } : null };
  if (name === "@/lib/supabase-stock") return { normalizeSupabaseStockBike: (bike: Record<string, unknown>) => ({ ...bike, image_urls: [], primary_image_url: null }) };
  return original.call(this, name, parent, main);
};
const { getStockWorkflowTasks } = require("../lib/stock-workflow") as typeof import("../lib/stock-workflow");
const { PATCH } = require("../app/api/workflow/[id]/route") as typeof import("../app/api/workflow/[id]/route");
const { GET, POST } = require("../app/api/workflow/route") as typeof import("../app/api/workflow/route");
loader._load = original;
const taskId = "00000000-0000-0000-0000-000000000123";
const patch = (body: unknown, id = taskId) => PATCH(new Request("http://localhost/api/workflow/" + id, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

test("task endpoint authorises, validates and sends only allowed fields into the transaction", async () => {
  rpcCalls = []; authorised = false;
  assert.equal((await patch({ action: "complete" })).status, 401); assert.equal(rpcCalls.length, 0);
  authorised = true;
  for (const [body, id] of [[{ action: "delete" }, taskId], [{ status: "made_up" }, taskId], [{}, taskId], [{ action: "start" }, "bad-id"], [[], taskId]] as [unknown, string][]) assert.equal((await patch(body, id)).status, 400);
  assert.equal(rpcCalls.length, 0);
  const response = await patch({ action: "complete", notes: "Checked", completed_by: "someone-else", started_at: "1999-01-01", updated_at: "2026-11-14T10:00:00Z" });
  assert.equal(response.status, 200);
  assert.deepEqual(rpcCalls[0], { name: "stock_workflow_update_task", p_task_id: taskId, p_user_id: "00000000-0000-0000-0000-000000000001", p_updates: { action: "complete", notes: "Checked" }, p_expected_updated_at: "2026-11-14T10:00:00Z" });
});

test("stale, sold, unlinked and invalid task updates keep actionable HTTP errors", async () => {
  for (const [code, status] of [["40001",409],["55000",409],["22023",400],["P0002",404],["42501",403],["XX001",500]] as const) {
    rpcError = { code, message: "Database detail" };
    const response = await patch({ action: "start" }); assert.equal(response.status, status);
    if (status === 500) assert.doesNotMatch((await response.json()).error, /Database detail/);
  }
  rpcError = null;
});

test("workflow reads every page, batches stock links and excludes retired, test and orphan tasks from active work", async () => {
  taskRows = Array.from({ length: 1001 }, (_, i) => ({ id: `task-${i}`, stock_bike_id: String(i), department: "Photos", status: "pending", updated_at: "2026-11-14T10:00:00Z" }));
  bikeRows = Array.from({ length: 1000 }, (_, i) => ({ id: i, registration: i === 0 ? null : `VRM${i}`, status: i === 1 ? "Sale Completed" : "In Stock", is_test_record: i === 2, make: "Honda", model: "CB500" }));
  reads = [];
  const active = await getStockWorkflowTasks();
  assert.equal(active.tasks.length, 998);
  assert.ok(active.tasks.find(task => task.stock_bike_id === "0")); // Missing VRM is not a missing stock link.
  assert.equal(reads.filter(read => read.table === "stock_workflow_tasks").length, 3);
  assert.ok(reads.filter(read => read.table === "stock_bikes").every(read => read.size <= 100));
  assert.equal((await getStockWorkflowTasks({ view: "history" })).tasks.length, 1);
  assert.equal((await getStockWorkflowTasks({ view: "unlinked" })).tasks.length, 1);
  assert.equal((await getStockWorkflowTasks({ view: "all" })).tasks.length, 1000);
  assert.equal((await getStockWorkflowTasks({ q: "VRM999" })).tasks.length, 1);
});

test("a stock read failure never fabricates hundreds of unlinked bikes", async () => {
  failBikes = true;
  const result = await getStockWorkflowTasks({ view: "all" });
  assert.equal(result.tasks.length, 0); assert.match(result.error || "", /linked stock/);
  failBikes = false;
});


test("workflow listing and backfill require internal staff before accessing data", async () => {
  authorised = false; reads = []; rpcCalls = [];
  assert.equal((await GET(new Request("http://localhost/api/workflow?view=all"))).status, 401);
  assert.equal((await POST(new Request("http://localhost/api/workflow", { method: "POST", body: JSON.stringify({ action: "backfill" }) }))).status, 401);
  assert.equal(reads.length, 0); assert.equal(rpcCalls.length, 0); authorised = true;
});

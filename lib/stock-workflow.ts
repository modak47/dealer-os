import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import { normalizeSupabaseStockBike } from "@/lib/supabase-stock";

export const workflowDepartments = ["Workshop Preparation", "Wash / Initial Valet", "Final Valet", "Photos"] as const;
export const workflowStatuses = ["pending", "in_progress", "completed", "blocked"] as const;

export type WorkflowDepartment = typeof workflowDepartments[number];
export type WorkflowStatus = typeof workflowStatuses[number];

export interface StockWorkflowTask {
  id: string;
  stock_bike_id: string;
  department: WorkflowDepartment;
  status: WorkflowStatus;
  assigned_to: string | null;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowBikeSummary {
  id: string;
  make: string;
  model: string;
  variant: string;
  registration: string;
  year: number | null;
  status: string;
  image: string;
}

export interface StockWorkflowRow extends StockWorkflowTask {
  bike: WorkflowBikeSummary | null;
}

export interface WorkflowFilters {
  departments?: WorkflowDepartment[];
  status?: WorkflowStatus | "";
  q?: string;
  includeCompleted?: boolean;
}

const stockFields = "id,registration,make,model,variant,year,status,image_urls,primary_image_url,is_test_record";
const migrationMissingCodes = new Set(["42P01", "PGRST205"]);

export function isWorkflowDepartment(value: unknown): value is WorkflowDepartment {
  return workflowDepartments.includes(value as WorkflowDepartment);
}

export function isWorkflowStatus(value: unknown): value is WorkflowStatus {
  return workflowStatuses.includes(value as WorkflowStatus);
}

function bikeSummary(bike: SupabaseStockBike | null | undefined): WorkflowBikeSummary | null {
  if (!bike) return null;
  const normalized = normalizeSupabaseStockBike(bike);
  return {
    id: String(normalized.id),
    make: normalized.make || "Make missing",
    model: normalized.model || "Model missing",
    variant: normalized.variant || "",
    registration: normalized.registration || "Registration pending",
    year: normalized.year,
    status: normalized.status || "Unknown",
    image: normalized.image_urls[0] || normalized.primary_image_url || "/bike-placeholder.svg",
  };
}

function normalizeTask(row: Record<string, unknown>): StockWorkflowTask {
  return {
    id: String(row.id),
    stock_bike_id: String(row.stock_bike_id),
    department: row.department as WorkflowDepartment,
    status: row.status as WorkflowStatus,
    assigned_to: typeof row.assigned_to === "string" ? row.assigned_to : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    started_at: typeof row.started_at === "string" ? row.started_at : null,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
    completed_by: typeof row.completed_by === "string" ? row.completed_by : null,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

export async function getStockWorkflowTasks(filters: WorkflowFilters = {}): Promise<{ tasks: StockWorkflowRow[]; migrationReady: boolean; error?: string }> {
  const db = getSupabaseAdmin();
  let query = db.from("stock_workflow_tasks").select("*").order("updated_at", { ascending: false });
  if (filters.departments?.length) query = query.in("department", filters.departments);
  if (filters.status) query = query.eq("status", filters.status);
  else if (!filters.includeCompleted) query = query.neq("status", "completed");

  const { data, error } = await query;
  if (error) {
    if (migrationMissingCodes.has(error.code)) return { tasks: [], migrationReady: false, error: "Run the stock preparation workflow migration in Supabase." };
    console.error("Unable to load stock workflow tasks", error);
    return { tasks: [], migrationReady: true, error: "Unable to load workflow tasks." };
  }

  const tasks = (data || []).map((row) => normalizeTask(row as Record<string, unknown>));
  const ids = Array.from(new Set(tasks.map((task) => task.stock_bike_id).filter(Boolean)));
  const bikesById = new Map<string, WorkflowBikeSummary>();
  const hiddenBikeIds = new Set<string>();
  if (ids.length) {
    const bikes = await db.from("stock_bikes").select(stockFields).in("id", ids);
    if (!bikes.error) {
      for (const bike of bikes.data || []) {
        if (Boolean((bike as { is_test_record?: boolean }).is_test_record)) {
          hiddenBikeIds.add(String(bike.id));
          continue;
        }
        const summary = bikeSummary(bike as unknown as SupabaseStockBike);
        if (summary) bikesById.set(String(summary.id), summary);
      }
    } else {
      console.warn("Unable to load workflow linked bikes", bikes.error.message);
    }
  }

  const q = filters.q?.trim().toLowerCase();
  const liveTasks = tasks.filter((task) => !hiddenBikeIds.has(task.stock_bike_id));
  const withBikes = liveTasks.map((task) => ({ ...task, bike: bikesById.get(task.stock_bike_id) || null }));
  const filtered = q ? withBikes.filter((task) => {
    const haystack = `${task.department} ${task.status} ${task.notes || ""} ${task.bike?.make || ""} ${task.bike?.model || ""} ${task.bike?.variant || ""} ${task.bike?.registration || ""} ${task.bike?.year || ""}`.toLowerCase();
    return haystack.includes(q);
  }) : withBikes;

  return { tasks: filtered, migrationReady: true };
}

export async function backfillStockWorkflowTasks() {
  const { data, error } = await getSupabaseAdmin().rpc("stock_workflow_backfill");
  if (error) throw error;
  return Number(data || 0);
}

export function workflowStats(tasks: StockWorkflowRow[]) {
  return {
    waiting: tasks.filter((task) => task.status === "pending").length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    completed: tasks.filter((task) => task.status === "completed").length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
  };
}

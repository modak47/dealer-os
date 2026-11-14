import { NextResponse } from "next/server";
import { backfillStockWorkflowTasks, getStockWorkflowTasks, isWorkflowDepartment, isWorkflowStatus, type WorkflowDepartment } from "@/lib/stock-workflow";
import { requireStaffUser } from "@/lib/auth/require-staff";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireStaffUser())) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const url = new URL(request.url);
  const department = url.searchParams.get("department");
  const group = url.searchParams.get("group");
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q") || "";
  const includeCompleted = url.searchParams.get("includeCompleted") === "true";
  let departments: WorkflowDepartment[] | undefined;

  if (group === "valeting") departments = ["Wash / Initial Valet", "Final Valet"];
  else if (department && isWorkflowDepartment(department)) departments = [department];

  const result = await getStockWorkflowTasks({
    departments,
    status: isWorkflowStatus(status) ? status : "",
    q,
    includeCompleted,
    view: ["all", "active", "history", "unlinked"].includes(url.searchParams.get("view") || "") ? url.searchParams.get("view") as "all" | "active" | "history" | "unlinked" : "active",
  });
  return NextResponse.json(result, { status: result.error && result.migrationReady ? 500 : 200 });
}

export async function POST(request: Request) {
  if (!(await requireStaffUser())) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action !== "backfill") return NextResponse.json({ error: "Unknown workflow action." }, { status: 400 });
    const created = await backfillStockWorkflowTasks();
    return NextResponse.json({ created });
  } catch (error) {
    console.error("Workflow backfill failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to backfill workflow tasks." }, { status: 500 });
  }
}

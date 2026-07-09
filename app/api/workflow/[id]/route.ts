import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isWorkflowStatus } from "@/lib/stock-workflow";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const updates: Record<string, unknown> = {};
    const supabase = await createClient();
    const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const userId = user?.id || null;

    if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;
    if (typeof body.assigned_to === "string") updates.assigned_to = body.assigned_to.trim() || null;

    if (action === "start") {
      updates.status = "in_progress";
      updates.started_at = new Date().toISOString();
      updates.completed_at = null;
      updates.completed_by = null;
    } else if (action === "complete") {
      updates.status = "completed";
      updates.started_at = body.started_at || new Date().toISOString();
      updates.completed_at = new Date().toISOString();
      updates.completed_by = userId;
    } else if (action === "block") {
      updates.status = "blocked";
      updates.completed_at = null;
      updates.completed_by = null;
    } else if (action === "reopen") {
      updates.status = "pending";
      updates.started_at = null;
      updates.completed_at = null;
      updates.completed_by = null;
    } else if (body.status && isWorkflowStatus(body.status)) {
      updates.status = body.status;
    }

    if (!Object.keys(updates).length) return NextResponse.json({ error: "No workflow updates supplied." }, { status: 400 });
    const { data, error } = await getSupabaseAdmin().from("stock_workflow_tasks").update(updates).eq("id", id).select("*").maybeSingle();
    if (error) {
      console.error("Unable to update workflow task", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Workflow task not found." }, { status: 404 });
    return NextResponse.json({ task: data });
  } catch (error) {
    console.error("Invalid workflow update", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid workflow update." }, { status: 400 });
  }
}

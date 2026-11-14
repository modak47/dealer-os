import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isWorkflowStatus } from "@/lib/stock-workflow";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const { id } = await params;
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "Valid task ID required." }, { status: 400 });
    const body = await request.json() as Record<string, unknown>;
    if (!body || Array.isArray(body)) return NextResponse.json({ error: "Invalid workflow update." }, { status: 400 });
    if (body.action && !["start", "complete", "block", "reopen"].includes(String(body.action))) return NextResponse.json({ error: "Unknown workflow action." }, { status: 400 });
    if (body.status && !isWorkflowStatus(body.status)) return NextResponse.json({ error: "Invalid workflow status." }, { status: 400 });
    const updates: Record<string, unknown> = {};
    for (const key of ["action", "status", "notes", "assigned_to"]) {
      if (typeof body[key] === "string") updates[key] = body[key];
    }
    if (!Object.keys(updates).length) return NextResponse.json({ error: "No workflow updates supplied." }, { status: 400 });
    const expected = typeof body.updated_at === "string" ? body.updated_at : null;
    if (expected && Number.isNaN(Date.parse(expected))) return NextResponse.json({ error: "Invalid task version." }, { status: 400 });
    const { data, error } = await getSupabaseAdmin().rpc("stock_workflow_update_task", {
      p_task_id: id, p_updates: updates, p_user_id: user.id, p_expected_updated_at: expected,
    });
    if (error) {
      const status = error.code === "P0002" ? 404 : ["55000", "40001"].includes(error.code) ? 409 : error.code === "22023" ? 400 : error.code === "42501" ? 403 : 500;
      return NextResponse.json({ error: status === 500 ? "Unable to save preparation. Try again." : error.message }, { status });
    }
    return NextResponse.json({ task: data });
  } catch {
    return NextResponse.json({ error: "Invalid workflow update." }, { status: 400 });
  }
}

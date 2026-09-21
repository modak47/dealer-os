import { NextResponse } from "next/server";
import { requireWebsiteLeadStaff } from "@/lib/auth/website-lead-staff";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const staff = await requireWebsiteLeadStaff();
  if (!staff) return NextResponse.json({ error: "Staff access required." }, { status: 401 });
  try {
    const body = await request.json();
    if (!["review", "ready", "archive"].includes(body.action) || !Array.isArray(body.ids) || !body.ids.length || body.ids.length > 50 || body.ids.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) < 1)) return NextResponse.json({ error: "Select 1–50 leads and a valid action." }, { status: 400 });
    const db = getSupabaseAdminClient();
    const results = [];
    // Independent per-lead transactions: a failed lead cannot roll back a successful review.
    for (const id of [...new Set<number>(body.ids)]) {
      const { data, error } = await db.rpc("staff_website_lead_action", { p_id: id, p_action: body.action, p_actor: staff.id });
      results.push(error ? { id, ok: false, error: error.code === "PGRST202" ? "Migration required." : error.message } : data);
    }
    return NextResponse.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Invalid bulk request." }, { status: 400 }); }
}

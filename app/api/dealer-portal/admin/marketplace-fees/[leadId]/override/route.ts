import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText, safeNumber } from "@/lib/website-leads";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const staff = await requireStaffUser();
  if (!staff) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const { leadId } = await params;
  const id = Number(leadId);
  const body = await request.json() as Record<string, unknown>;
  const amount = safeNumber(body.final_fee_amount);
  const reason = cleanText(body.reason, 1000);
  if (!Number.isInteger(id) || id <= 0 || amount === null || amount < 0 || !reason) {
    return NextResponse.json({ error: "A valid final fee and internal reason are required." }, { status: 400 });
  }
  const db = getSupabaseAdminClient();
  const result = await db.rpc("staff_override_marketplace_fee", { p_website_lead_id: id, p_final_fee_amount: amount, p_reason: reason, p_staff_user_id: staff.id });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json({ deal: result.data });
}

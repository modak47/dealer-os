import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { cleanText, optionalNumber } from "@/lib/crm-validation";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireStaffUser())) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const amount = optionalNumber(body.amount);
    if (!amount || amount <= 0) throw new Error("Refund amount must be greater than zero.");
    const reason = cleanText(body.reason, 1000);
    if (!reason) throw new Error("Refund reason is required.");
    const { data, error } = await getSupabaseAdmin().rpc("crm_record_refund", {
      p_original_payment_id: id,
      p_amount: amount,
      p_reason: reason,
      p_method: cleanText(body.method, 80) || "Bank Transfer",
      p_reference: cleanText(body.reference, 120) || null,
      p_user_id: await getCurrentUserId(),
    });
    if (error) throw error;
    return NextResponse.json({ refundPaymentId: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record refund." }, { status: 400 });
  }
}

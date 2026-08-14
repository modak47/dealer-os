import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { cleanText, stockId } from "@/lib/crm-validation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await requireStaffUser();
  if (!user) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });

  try {
    const bikeId = stockId((await params).id);
    if (!bikeId) return NextResponse.json({ error: "Valid stock bike ID is required." }, { status: 400 });

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const reason = cleanText(body.reason, 1000);
    if (!reason) return NextResponse.json({ error: "Add a reason before voiding this stock record." }, { status: 400 });

    const { error } = await getSupabaseAdmin().rpc("stock_void_purchase_record", {
      p_stock_bike_id: bikeId,
      p_reason: reason,
      p_user_id: user.id,
    });

    if (error) {
      const missingFunction = /stock_void_purchase_record|schema cache|function/i.test(`${error.message} ${error.details ?? ""}`);
      return NextResponse.json({
        error: missingFunction
          ? "Stock unwind migration is not installed. Run 20260814000300_void_stock_purchase_record.sql in Supabase, then try again."
          : error.message,
      }, { status: missingFunction ? 500 : 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Stock void failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to void stock record." }, { status: 500 });
  }
}

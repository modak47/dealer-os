import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText } from "@/lib/website-leads";
import { cancelPurchasePending, confirmPurchasePendingArrival } from "@/lib/purchase-pending";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 40);
    const db = getSupabaseAdminClient();
    const { data: bike, error } = await db.from("stock_bikes").select("id,status,website_lead_id").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ error: "Unable to load stock record." }, { status: 500 });
    if (!bike) return NextResponse.json({ error: "Stock record not found." }, { status: 404 });
    if (bike.status !== "Purchase Pending") return NextResponse.json({ error: "Only Purchase Pending records can use this action." }, { status: 400 });
    const userId = await getCurrentUserId();
    if (action === "confirm_arrived") {
      const data = await confirmPurchasePendingArrival(db, id, body, userId);
      return NextResponse.json({ stock: data });
    }
    if (action === "cancel_purchase") {
      const reason = cleanText(body.cancellation_reason, 1000);
      const data = await cancelPurchasePending(db, id, bike.website_lead_id, reason || "", userId);
      return NextResponse.json({ stock: data });
    }
    return NextResponse.json({ error: "Unknown purchase pending action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update purchase." }, { status: 400 });
  }
}

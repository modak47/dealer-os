import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText, safeNumber } from "@/lib/website-leads";

export const dynamic = "force-dynamic";

function optionalDate(value: unknown, label: string) {
  const text = cleanText(value, 40);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be valid.`);
  return date.toISOString().slice(0, 10);
}

function nonNegative(value: unknown, label: string) {
  const parsed = safeNumber(value) ?? 0;
  if (parsed < 0) throw new Error(`${label} cannot be negative.`);
  return parsed;
}

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
    const now = new Date().toISOString();
    const userId = await getCurrentUserId();
    if (action === "confirm_arrived") {
      const updates = {
        status: "In Stock",
        purchase_price: nonNegative(body.actual_purchase_price ?? body.purchase_price, "Actual purchase price"),
        mileage: safeNumber(body.actual_mileage ?? body.mileage),
        actual_arrival_date: optionalDate(body.actual_arrival_date, "Arrival date") ?? now.slice(0, 10),
        payment_status: Boolean(body.payment_completed) ? "Paid" : cleanText(body.payment_status, 80) || "Part Paid",
        keys_received: safeNumber(body.keys_received),
        v5_received: Boolean(body.v5_received),
        service_history_received: Boolean(body.service_history_received),
        hpi_completed: Boolean(body.hpi_completed),
        condition_notes: cleanText(body.condition_notes, 4000),
        actual_preparation_cost: nonNegative(body.additional_costs_discovered ?? body.actual_preparation_cost, "Additional costs"),
        parts_required: cleanText(body.parts_required, 4000),
        workshop_status: "pending",
        valeting_status: "pending",
        photo_status: "pending",
        date_in_stock: now.slice(0, 10),
        updated_by: userId,
      };
      const { data, error: updateError } = await db.from("stock_bikes").update(updates).eq("id", id).select("*").single();
      if (updateError) return NextResponse.json({ error: `Unable to confirm arrival: ${updateError.message}` }, { status: 500 });
      const workflow = await db.rpc("stock_workflow_create_defaults", { p_stock_bike_id: String(id) });
      if (workflow.error && !["42883", "PGRST202"].includes(workflow.error.code)) console.warn("Unable to create arrival workflow tasks", workflow.error.message);
      return NextResponse.json({ stock: data });
    }
    if (action === "cancel_purchase") {
      const reason = cleanText(body.cancellation_reason, 1000);
      if (!reason) return NextResponse.json({ error: "Cancellation reason is required." }, { status: 400 });
      const { data, error: updateError } = await db.from("stock_bikes").update({ status: "Purchase Cancelled", cancelled_at: now, cancellation_reason: reason, show_on_website: false, reserve_enabled: false, updated_by: userId }).eq("id", id).select("*").single();
      if (updateError) return NextResponse.json({ error: `Unable to cancel purchase: ${updateError.message}` }, { status: 500 });
      if (bike.website_lead_id) await db.from("website_leads").update({ status: "purchase_cancelled", updated_at: now }).eq("id", bike.website_lead_id);
      return NextResponse.json({ stock: data });
    }
    return NextResponse.json({ error: "Unknown purchase pending action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update purchase." }, { status: 400 });
  }
}

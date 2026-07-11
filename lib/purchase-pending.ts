import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanText, safeNumber } from "@/lib/website-leads";

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

export async function confirmPurchasePendingArrival(db: SupabaseClient, stockId: string, body: Record<string, unknown>, userId: string | null) {
  const now = new Date().toISOString();
  const updates = {
    status: "In Stock",
    purchase_price: nonNegative(body.actual_purchase_price ?? body.purchase_price, "Actual purchase price"),
    mileage: safeNumber(body.actual_mileage ?? body.mileage),
    actual_arrival_date: optionalDate(body.actual_arrival_date, "Arrival date") ?? now.slice(0, 10),
    payment_status: Boolean(body.payment_completed) || body.payment_status === "paid" || body.payment_status === "Paid" ? "Paid" : cleanText(body.payment_status, 80) || "Part Paid",
    keys_received: safeNumber(body.keys_received),
    v5_received: Boolean(body.v5_received),
    service_history_received: Boolean(body.service_history_received),
    hpi_completed: Boolean(body.hpi_completed),
    condition_notes: cleanText(body.condition_notes, 4000),
    actual_preparation_cost: nonNegative(body.additional_costs_discovered ?? body.actual_preparation_cost, "Additional costs"),
    actual_transport_cost: nonNegative(body.actual_transport_cost, "Actual transport cost"),
    parts_required: cleanText(body.parts_required, 4000),
    workshop_status: "pending",
    valeting_status: "pending",
    photo_status: "pending",
    date_in_stock: now.slice(0, 10),
    updated_by: userId,
  };
  const { data, error } = await db.from("stock_bikes").update(updates).eq("id", stockId).select("*").single();
  if (error) throw new Error(`Unable to confirm arrival: ${error.message}`);
  const workflow = await db.rpc("stock_workflow_create_defaults", { p_stock_bike_id: String(stockId) });
  if (workflow.error && !["42883", "PGRST202"].includes(workflow.error.code)) console.warn("Unable to create arrival workflow tasks", workflow.error.message);
  return data;
}

export async function cancelPurchasePending(db: SupabaseClient, stockId: string, websiteLeadId: number | null | undefined, reason: string, userId: string | null) {
  const now = new Date().toISOString();
  if (!reason) throw new Error("Cancellation reason is required.");
  const { data, error } = await db.from("stock_bikes").update({ status: "Purchase Cancelled", cancelled_at: now, cancellation_reason: reason, show_on_website: false, reserve_enabled: false, updated_by: userId }).eq("id", stockId).select("*").single();
  if (error) throw new Error(`Unable to cancel purchase: ${error.message}`);
  if (websiteLeadId) await db.from("website_leads").update({ status: "purchase_cancelled", updated_at: now }).eq("id", websiteLeadId);
  return data;
}

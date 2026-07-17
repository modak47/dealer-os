import "server-only";

import { getCurrentUserId } from "@/lib/current-user";
import { stockId } from "@/lib/crm-validation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const categories = new Set(["parts", "workshop_labour", "external_workshop", "mot", "transport", "collection", "delivery", "valeting", "photography", "advertising", "hpi", "auction_fee", "buyer_fee", "administration", "warranty", "other"]);

export async function addStockCost(stockBikeId: unknown, input: Record<string, unknown>) {
  const id = stockId(stockBikeId);
  if (!id) throw new Error("Invalid stock bike.");
  const category = text(input.category || input.cost_category, 60) || "other";
  if (!categories.has(category)) throw new Error("Invalid cost category.");
  const amount = money(input.amount, "Cost amount");
  if (amount <= 0) throw new Error("Cost amount must be greater than zero.");
  const userId = await getCurrentUserId();
  const { data, error } = await getSupabaseAdmin().rpc("stock_add_cost", {
    p_stock_bike_id: id,
    p_category: category,
    p_description: text(input.description, 300) || category,
    p_amount: amount,
    p_cost_date: dateOnly(input.cost_date) || new Date().toISOString().slice(0, 10),
    p_payment_status: text(input.payment_status, 40) || "unpaid",
    p_payment_method: text(input.payment_method, 80) || null,
    p_reference: text(input.reference, 120) || null,
    p_notes: text(input.notes, 1000) || null,
    p_idempotency_key: text(input.idempotency_key, 160) || `stock-cost:${id}:${category}:${amount}:${text(input.reference, 120)}`,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function voidStockCost(costId: string, reason: string) {
  if (!costId) throw new Error("Cost ID is required.");
  if (!reason.trim()) throw new Error("A reason is required.");
  const { data, error } = await getSupabaseAdmin().rpc("stock_void_cost", {
    p_cost_id: costId,
    p_reason: reason.trim(),
    p_user_id: await getCurrentUserId(),
  });
  if (error) throw new Error(error.message);
  return data as string;
}

function text(value: unknown, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : typeof value === "number" ? String(value) : "";
}

function money(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be zero or more.`);
  return Math.round(parsed * 100) / 100;
}

function dateOnly(value: unknown) {
  const raw = text(value, 30);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

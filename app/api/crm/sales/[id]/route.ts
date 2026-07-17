import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cleanText, optionalNumber, uuid } from "@/lib/crm-validation";
import { getCurrentUserId } from "@/lib/current-user";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) return NextResponse.json({ error: "Invalid sale." }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from("crm_sales")
    .select("*,customer:crm_customers(*),bike:stock_bikes!crm_sales_stock_bike_id_fkey(id,make,model,variant,registration,price,status,primary_image_url),delivery:crm_deliveries(*),payments:crm_payments(*)")
    .eq("id", id).maybeSingle();
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : data ? NextResponse.json({ sale: data }) : NextResponse.json({ error: "Sale not found." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params, body = await request.json() as Record<string, unknown>, saleId = uuid(id);
    if (!saleId) throw new Error("Invalid sale.");
    const db = getSupabaseAdmin();
    const action = cleanText(body.action, 40);
    if (action === "cancel") {
      const { error } = await db.rpc("crm_undo_sale", { p_sale_id: saleId, p_reason: cleanText(body.reason) || "Sale cancelled by staff", p_user_id: await getCurrentUserId() });
      if (error) throw error;
      await db.from("crm_sales").update({ cancellation_reason: cleanText(body.reason) || "Sale cancelled by staff", cancelled_at: new Date().toISOString() }).eq("id", saleId);
      return NextResponse.json({ ok: true });
    }
    if (action === "complete") {
      const userId = await getCurrentUserId();
      const completed = await db.rpc("crm_complete_sale", { p_sale_id: saleId, p_user_id: userId });
      if (completed.error) throw completed.error;
      const { data: sale } = await db.from("crm_sales").select("stock_bike_id,sale_price").eq("id", saleId).single();
      if (sale?.stock_bike_id) await db.from("stock_bikes").update({ status: "Sale Completed", sold_date: new Date().toISOString().slice(0, 10), actual_sale_price: optionalNumber(sale.sale_price) ?? 0 }).eq("id", sale.stock_bike_id);
      return NextResponse.json({ ok: true });
    }

    const saleFields: Record<string, unknown> = {};
    for (const key of ["sale_price", "deposit_amount", "part_exchange_amount", "agreed_price", "discount_amount"] as const) if (key in body) saleFields[key] = optionalNumber(body[key]) ?? 0;
    for (const key of ["payment_status", "delivery_date", "notes", "status", "finance_status", "finance_provider", "finance_reference", "delivery_address", "collection_date", "handover_status"] as const) if (key in body) saleFields[key] = cleanText(body[key]) || null;
    if (Object.keys(saleFields).length) { const result = await db.from("crm_sales").update(saleFields).eq("id", saleId); if (result.error) throw result.error; }
    const deliveryFields: Record<string, unknown> = {};
    for (const key of ["delivery_method", "scheduled_at", "fuel_level", "notes"] as const) if (`delivery_${key}` in body) deliveryFields[key] = cleanText(body[`delivery_${key}`]) || null;
    for (const key of ["identity_checked", "licence_verified", "v5_prepared", "handover_completed", "keys_given", "documents_signed", "photos_taken", "hpi_complete"] as const) if (key in body) deliveryFields[key] = asBoolean(body[key]);
    if (Object.keys(deliveryFields).length) { const result = await db.from("crm_deliveries").update(deliveryFields).eq("sale_id", saleId); if (result.error) throw result.error; }
    await db.rpc("crm_refresh_sale_balance", { p_sale_id: saleId });
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update sale." }, { status: 400 }); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params, saleId = uuid(id); if (!saleId) throw new Error("Invalid sale.");
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { error } = await getSupabaseAdmin().rpc("crm_undo_sale", { p_sale_id: saleId, p_reason: cleanText(body.reason) || "Sale reversed by staff", p_user_id: await getCurrentUserId() });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to undo sale." }, { status: 400 }); }
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "on" || value === "1";
  return Boolean(value);
}

import { NextResponse } from "next/server";
import { cleanText, optionalNumber, stockId, uuid } from "@/lib/crm-validation";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const bikeId = stockId((await params).id);
    if (!bikeId) return NextResponse.json({ error: "Valid stock bike ID is required." }, { status: 400 });

    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 60);
    const db = getSupabaseAdmin();
    const userId = await getCurrentUserId();

    if (action === "reserve") {
      const customerId = uuid(body.customer_id);
      if (!customerId) return NextResponse.json({ error: "Choose a customer before reserving this bike." }, { status: 400 });
      const { data, error } = await db.rpc("crm_reserve_stock_bike", {
        p_customer_id: customerId,
        p_bike_id: bikeId,
        p_deposit: optionalNumber(body.deposit_amount) ?? 0,
        p_expiry: cleanText(body.expires_at) || null,
        p_method: cleanText(body.method) || "Card",
        p_receipt: cleanText(body.receipt_number) || null,
        p_notes: cleanText(body.notes) || null,
        p_user_id: userId,
      });
      if (error) throw error;
      return NextResponse.json({ reservationId: data });
    }

    if (action === "cancelReservation") {
      const reservationId = uuid(body.reservation_id);
      if (!reservationId) return NextResponse.json({ error: "Reservation is required." }, { status: 400 });
      const { error } = await db.rpc("crm_cancel_reservation", {
        p_reservation_id: reservationId,
        p_reason: cleanText(body.reason) || "Reservation cancelled by staff",
        p_user_id: userId,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "convertReservation") {
      const reservationId = uuid(body.reservation_id);
      if (!reservationId) return NextResponse.json({ error: "Reservation is required." }, { status: 400 });
      const { data, error } = await db.rpc("crm_convert_reservation_to_sale", {
        p_reservation_id: reservationId,
        p_finance: Boolean(body.finance),
        p_user_id: userId,
      });
      if (error) throw error;
      const { data: invoice } = await db.from("crm_invoices").select("id").eq("sale_id", data).maybeSingle();
      return NextResponse.json({ saleId: data, invoiceId: invoice?.id ?? null });
    }

    if (action === "startSale") {
      const customerId = uuid(body.customer_id);
      if (!customerId) return NextResponse.json({ error: "Choose a customer before starting a sale." }, { status: 400 });
      const { data, error } = await db.rpc("crm_start_sale", {
        p_customer_id: customerId,
        p_bike_id: bikeId,
        p_sale_price: optionalNumber(body.sale_price),
        p_deposit: optionalNumber(body.deposit_amount) ?? 0,
        p_method: cleanText(body.method) || "Card",
        p_receipt: cleanText(body.receipt_number) || null,
        p_notes: cleanText(body.notes) || null,
        p_user_id: userId,
      });
      if (error) throw error;
      const { data: invoice } = await db.from("crm_invoices").select("id").eq("sale_id", data).maybeSingle();
      return NextResponse.json({ saleId: data, invoiceId: invoice?.id ?? null });
    }

    if (action === "cancelSale") {
      const saleId = uuid(body.sale_id);
      if (!saleId) return NextResponse.json({ error: "Sale is required." }, { status: 400 });
      const { error } = await db.rpc("crm_cancel_sale", {
        p_sale_id: saleId,
        p_reason: cleanText(body.reason) || "Sale cancelled by staff",
        p_user_id: userId,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "markSold") {
      const saleId = uuid(body.sale_id);
      if (!saleId) return NextResponse.json({ error: "Sale is required." }, { status: 400 });
      const { error } = await db.rpc("crm_mark_sale_sold", { p_sale_id: saleId, p_user_id: userId });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "completeSale") {
      const saleId = uuid(body.sale_id);
      if (!saleId) return NextResponse.json({ error: "Sale is required." }, { status: 400 });
      const { error } = await db.rpc("crm_complete_sale", { p_sale_id: saleId, p_user_id: userId });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "reopenSale") {
      const saleId = uuid(body.sale_id);
      if (!saleId) return NextResponse.json({ error: "Sale is required." }, { status: 400 });
      const { error } = await db.rpc("crm_reopen_sale", {
        p_sale_id: saleId,
        p_reason: cleanText(body.reason) || "Sale reopened by staff",
        p_user_id: userId,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown vehicle workflow action." }, { status: 400 });
  } catch (error) {
    console.error("Vehicle workflow failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update vehicle workflow." }, { status: 500 });
  }
}

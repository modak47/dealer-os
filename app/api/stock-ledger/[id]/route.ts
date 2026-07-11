import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getStockLedgerBike } from "@/lib/stock-ledger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sanitiseStockPayload } from "@/lib/stock-payload";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const { id } = await params;
  const bike = await getStockLedgerBike(id);
  if (!bike) return NextResponse.json({ error: "Stock record not found." }, { status: 404 });
  return NextResponse.json({ bike });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const updates = sanitiseStockPayload(body);
    const allowed = new Set(["purchase_price", "purchase_date", "seller_name", "purchase_source", "deposit_paid", "balance_outstanding", "target_retail_price", "price", "actual_sale_price", "discount_given", "estimated_preparation_cost", "actual_preparation_cost", "estimated_transport_cost", "actual_transport_cost", "workshop_cost", "parts_cost", "labour_cost", "valeting_cost", "photography_cost", "hpi_cost", "miscellaneous_cost", "other_estimated_costs", "other_actual_costs"]);
    for (const key of Object.keys(updates)) if (!allowed.has(key)) delete updates[key];
    if (!Object.keys(updates).length) return NextResponse.json({ error: "No finance fields supplied." }, { status: 400 });
    const { error } = await getSupabaseAdmin().from("stock_bikes").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: `Unable to update finance: ${error.message}` }, { status: 500 });
    const bike = await getStockLedgerBike(id);
    return NextResponse.json({ bike });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update finance." }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { validateMarketplaceFeeBands, type MarketplaceFeeBand } from "@/lib/marketplace-fees";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const db = getSupabaseAdminClient();
  const [bands, settings] = await Promise.all([
    db.from("marketplace_fee_bands").select("id,min_purchase_price,max_purchase_price,fee_amount,sort_order,updated_at").order("min_purchase_price"),
    db.from("marketplace_fee_settings").select("updated_at,updated_by").eq("id", true).maybeSingle(),
  ]);
  if (bands.error || settings.error) return NextResponse.json({ error: "Unable to load marketplace fee settings." }, { status: 500 });
  return NextResponse.json({ bands: bands.data ?? [], updated_at: settings.data?.updated_at ?? null, updated_by: settings.data?.updated_by ?? null });
}

export async function PUT(request: Request) {
  const staff = await requireStaffUser();
  if (!staff) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const body = await request.json() as { bands?: MarketplaceFeeBand[] };
  const bands = (body.bands ?? []).map((band, index) => ({
    min_purchase_price: Number(band.min_purchase_price),
    max_purchase_price: band.max_purchase_price === null || band.max_purchase_price === undefined ? null : Number(band.max_purchase_price),
    fee_amount: Number(band.fee_amount),
    sort_order: index,
  }));
  const validationError = validateMarketplaceFeeBands(bands);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const db = getSupabaseAdminClient();
  const result = await db.rpc("staff_replace_marketplace_fee_bands", { p_bands: bands, p_staff_user_id: staff.id });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json({ bands: result.data ?? [] });
}

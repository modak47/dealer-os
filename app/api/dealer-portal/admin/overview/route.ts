import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const db = getSupabaseAdminClient();
  const [claims, notes, purchases, fees] = await Promise.all([
    db.from("dealer_lead_claims")
      .select("*,dealer:dealer_portal_accounts(id,trading_name,successful_purchase_fee),lead:website_leads(id,reg,make,model,year,mileage,postcode,location_town,status)")
      .order("claimed_at", { ascending: false })
      .limit(50),
    db.from("dealer_lead_notes")
      .select("*,dealer:dealer_portal_accounts(id,trading_name),lead:website_leads(id,reg,make,model)")
      .order("created_at", { ascending: false })
      .limit(80),
    db.from("dealer_purchases")
      .select("*,dealer:dealer_portal_accounts(id,trading_name),lead:website_leads(id,reg,make,model,year)")
      .order("reported_at", { ascending: false })
      .limit(50),
    db.from("dealer_purchase_fees")
      .select("*,dealer:dealer_portal_accounts(id,trading_name),lead:website_leads(id,reg,make,model,year)")
      .order("created_at", { ascending: false })
      .limit(80),
  ]);
  if (claims.error) return NextResponse.json({ error: "Unable to load dealer claims." }, { status: 500 });
  if (notes.error) return NextResponse.json({ error: "Unable to load dealer notes." }, { status: 500 });
  if (purchases.error) return NextResponse.json({ error: "Unable to load dealer purchases." }, { status: 500 });
  if (fees.error) return NextResponse.json({ error: "Unable to load dealer purchase fees." }, { status: 500 });
  return NextResponse.json({
    claims: claims.data ?? [],
    notes: notes.data ?? [],
    purchases: purchases.data ?? [],
    fees: fees.data ?? [],
  });
}

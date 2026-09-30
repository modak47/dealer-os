import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const db = getSupabaseAdminClient();
  const [claims, notes, purchases, fees, ledger, marketplaceDeals, marketplaceOverrides] = await Promise.all([
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
      .select("*,dealer:dealer_portal_accounts(id,trading_name),lead:website_leads(id,reg,make,model,year),purchase:dealer_purchases(id,purchase_type,purchase_price,purchase_date,reported_at)")
      .order("created_at", { ascending: false })
      .limit(80),
    db.from("dealer_fee_ledger_entries")
      .select("*,dealer:dealer_portal_accounts(id,trading_name),lead:website_leads(id,reg,make,model,year)")
      .order("created_at", { ascending: false })
      .limit(120),
    db.from("website_leads")
      .select("id,reg,make,model,year,fname,lname,status,marketplace_status,marketplace_accepted_at,accepted_offer_amount,accepted_offer_dealer_account_id,marketplace_fee_default_amount,marketplace_fee_amount,marketplace_fee_override_amount,marketplace_fee_override_reason,marketplace_fee_overridden_at,purchased_at,created_at")
      .eq("opportunity_mode", "marketplace_offer")
      .not("marketplace_accepted_offer_id", "is", null)
      .order("marketplace_accepted_at", { ascending: false })
      .limit(80),
    db.from("marketplace_fee_override_audit")
      .select("id,website_lead_id,default_fee_amount,previous_final_fee_amount,final_fee_amount,reason,changed_by,created_at")
      .order("created_at", { ascending: false })
      .limit(120),
  ]);
  if (claims.error) return NextResponse.json({ error: "Unable to load dealer claims." }, { status: 500 });
  if (notes.error) return NextResponse.json({ error: "Unable to load dealer notes." }, { status: 500 });
  if (purchases.error) return NextResponse.json({ error: "Unable to load dealer purchases." }, { status: 500 });
  if (fees.error) return NextResponse.json({ error: "Unable to load dealer purchase fees." }, { status: 500 });
  if (ledger.error) return NextResponse.json({ error: "Unable to load dealer fee ledger." }, { status: 500 });
  if (marketplaceDeals.error) return NextResponse.json({ error: "Unable to load marketplace deals." }, { status: 500 });
  if (marketplaceOverrides.error) return NextResponse.json({ error: "Unable to load marketplace fee audit." }, { status: 500 });
  const dealerIds = Array.from(new Set((marketplaceDeals.data ?? []).map(deal => deal.accepted_offer_dealer_account_id).filter(Boolean)));
  const marketplaceDealers = dealerIds.length ? await db.from("dealer_portal_accounts").select("id,trading_name").in("id", dealerIds) : { data: [], error: null };
  if (marketplaceDealers.error) return NextResponse.json({ error: "Unable to load marketplace dealers." }, { status: 500 });
  const dealerNames = new Map((marketplaceDealers.data ?? []).map(dealer => [dealer.id, dealer.trading_name]));
  return NextResponse.json({
    claims: claims.data ?? [],
    notes: notes.data ?? [],
    purchases: purchases.data ?? [],
    fees: fees.data ?? [],
    ledger: ledger.data ?? [],
    marketplaceDeals: (marketplaceDeals.data ?? []).map(deal => ({ ...deal, dealer_name: dealerNames.get(deal.accepted_offer_dealer_account_id ?? "") ?? null })),
    marketplaceOverrides: marketplaceOverrides.data ?? [],
  });
}

import { NextResponse } from "next/server";
import { getCurrentDealerPortalAccount } from "@/lib/dealer-portal";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { isVisualTestRequest } from "@/lib/visual-test-mode";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (isVisualTestRequest(request.headers)) return NextResponse.json(visualPaymentsFixture());
  const session = await getCurrentDealerPortalAccount();
  if (!session) return NextResponse.json({ error: "Dealer portal access is not available for this user." }, { status: 401 });
  const db = getSupabaseAdminClient();
  const [fees, ledger] = await Promise.all([
    db.from("dealer_purchase_fees")
      .select("*,purchase:dealer_purchases(id,purchase_type,purchase_price,purchase_date,collection_date,mileage_at_purchase,reported_at),lead:website_leads(id,reg,make,model,year,mileage)")
      .eq("dealer_account_id", session.dealer.id)
      .order("created_at", { ascending: false }),
    db.from("dealer_fee_ledger_entries")
      .select("*")
      .eq("dealer_account_id", session.dealer.id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (fees.error) return NextResponse.json({ error: "Unable to load Successful Purchase Fee history." }, { status: 500 });
  if (ledger.error) return NextResponse.json({ error: "Unable to load account ledger history." }, { status: 500 });
  return NextResponse.json({ dealer: session.dealer, role: session.role, fees: fees.data ?? [], ledger: ledger.data ?? [] });
}

function visualPaymentsFixture() {
  return {
    dealer: {
      id: "visual-dealer",
      trading_name: "DWB Trading",
      successful_purchase_fee: 50,
    },
    role: "dealer_admin",
    fees: [
      {
        id: "visual-fee-paid",
        purchase_id: "visual-purchase-1",
        dealer_account_id: "visual-dealer",
        website_lead_id: 9001,
        fee_amount: 50,
        credit_amount: 0,
        adjustment_amount: 10,
        invoice_reference: "YM-1042",
        invoiced_amount: 60,
        paid_amount: 60,
        outstanding_amount: 0,
        status: "paid",
        invoiced_at: "2026-09-01T10:00:00.000Z",
        invoiced_by: null,
        paid_at: "2026-09-03T10:00:00.000Z",
        paid_by: null,
        credited_at: null,
        voided_at: null,
        voided_by: null,
        notes: "Manual payment received.",
        created_at: "2026-08-20T10:00:00.000Z",
        updated_at: "2026-09-03T10:00:00.000Z",
        purchase: { purchase_type: "dealer_reported", purchase_price: 4000, purchase_date: "2026-08-20", reported_at: "2026-08-20T10:00:00.000Z" },
        lead: { id: 9001, reg: "WU69UUG", make: "KTM", model: "790 Duke", year: "2019", mileage: "5000" },
      },
      {
        id: "visual-fee-open",
        purchase_id: "visual-purchase-2",
        dealer_account_id: "visual-dealer",
        website_lead_id: 9002,
        fee_amount: 50,
        credit_amount: 15,
        adjustment_amount: 0,
        invoice_reference: "YM-1043",
        invoiced_amount: 35,
        paid_amount: 20,
        outstanding_amount: 15,
        status: "invoiced",
        invoiced_at: "2026-09-02T10:00:00.000Z",
        invoiced_by: null,
        paid_at: null,
        paid_by: null,
        credited_at: "2026-09-02T11:00:00.000Z",
        voided_at: null,
        voided_by: null,
        notes: "Courtesy credit applied.",
        created_at: "2026-08-25T10:00:00.000Z",
        updated_at: "2026-09-03T10:00:00.000Z",
        purchase: { purchase_type: "dealer_reported_later", purchase_price: 3000, purchase_date: "2026-08-25", reported_at: "2026-08-25T10:00:00.000Z" },
        lead: { id: 9002, reg: "RJ17YSN", make: "Yamaha", model: "MT 125 ABS", year: "2017", mileage: "6000" },
      },
    ],
    ledger: [
      { id: 3, fee_id: "visual-fee-open", purchase_id: "visual-purchase-2", website_lead_id: 9002, dealer_account_id: "visual-dealer", entry_type: "payment_recorded", amount: 20, previous_status: "invoiced", new_status: "invoiced", previous_amounts: {}, new_amounts: {}, note: "Part payment", created_by: null, created_at: "2026-09-03T10:00:00.000Z" },
      { id: 2, fee_id: "visual-fee-open", purchase_id: "visual-purchase-2", website_lead_id: 9002, dealer_account_id: "visual-dealer", entry_type: "credit_applied", amount: 15, previous_status: "invoiced", new_status: "invoiced", previous_amounts: {}, new_amounts: {}, note: "Courtesy credit", created_by: null, created_at: "2026-09-02T11:00:00.000Z" },
      { id: 1, fee_id: "visual-fee-paid", purchase_id: "visual-purchase-1", website_lead_id: 9001, dealer_account_id: "visual-dealer", entry_type: "fee_created", amount: 50, previous_status: null, new_status: "pending_invoice", previous_amounts: {}, new_amounts: {}, note: "Successful Purchase Fee created.", created_by: null, created_at: "2026-08-20T10:00:00.000Z" },
    ],
  };
}

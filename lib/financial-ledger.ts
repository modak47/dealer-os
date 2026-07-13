import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type FinancialLedgerRow = {
  id: string;
  transaction_date: string;
  posted_at: string;
  transaction_type: string;
  direction: "income" | "expense";
  category: string;
  description: string;
  amount_pence: number;
  payment_method: string | null;
  reference: string | null;
  status: string;
  stock_bike_id: number | null;
  deal_id: string | null;
  invoice_id: string | null;
  payment_id: string | null;
  source_type: string;
  source_id: string;
  bike?: { stock_number: string | null; registration: string | null; make: string | null; model: string | null } | null;
  customer?: { first_name: string | null; last_name: string | null } | null;
  supplier?: { name: string | null; company_name: string | null } | null;
  invoice?: { invoice_number: string | null } | null;
};

export async function getFinancialLedger(searchParams: { from?: string; to?: string; direction?: string; category?: string; q?: string }) {
  const db = getSupabaseAdmin();
  let query = db.from("financial_ledger_transactions")
    .select("*,bike:stock_bikes(stock_number,registration,make,model),customer:crm_customers(first_name,last_name),supplier:stock_suppliers(name,company_name),invoice:crm_invoices(invoice_number)")
    .order("transaction_date", { ascending: false })
    .order("posted_at", { ascending: false })
    .limit(500);

  if (searchParams.from) query = query.gte("transaction_date", searchParams.from);
  if (searchParams.to) query = query.lte("transaction_date", searchParams.to);
  if (searchParams.direction === "income" || searchParams.direction === "expense") query = query.eq("direction", searchParams.direction);
  if (searchParams.category) query = query.eq("category", searchParams.category);

  const { data, error } = await query;
  if (error) {
    if (["42P01", "42703", "PGRST200"].includes(error.code ?? "")) return { migrationReady: false, rows: [] as FinancialLedgerRow[], kpis: buildKpis([]) };
    throw error;
  }

  const q = searchParams.q?.trim().toLowerCase();
  const rows = ((data ?? []) as unknown as FinancialLedgerRow[]).filter(row => {
    if (!q) return true;
    return `${row.description} ${row.category} ${row.transaction_type} ${row.reference ?? ""} ${row.bike?.registration ?? ""} ${row.bike?.stock_number ?? ""} ${row.customer?.first_name ?? ""} ${row.customer?.last_name ?? ""} ${row.supplier?.name ?? ""}`.toLowerCase().includes(q);
  });

  return { migrationReady: true, rows, kpis: buildKpis(rows) };
}

export function ledgerMoney(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((pence || 0) / 100);
}

function buildKpis(rows: FinancialLedgerRow[]) {
  const posted = rows.filter(row => row.status === "posted");
  const income = posted.filter(row => row.direction === "income").reduce((sum, row) => sum + Number(row.amount_pence || 0), 0);
  const expenses = posted.filter(row => row.direction === "expense").reduce((sum, row) => sum + Number(row.amount_pence || 0), 0);
  return {
    income,
    expenses,
    net: income - expenses,
    salesRevenue: posted.filter(row => row.category === "sales_revenue").reduce((sum, row) => sum + Number(row.amount_pence || 0), 0),
    stockPurchases: posted.filter(row => row.category === "stock_purchase").reduce((sum, row) => sum + Number(row.amount_pence || 0), 0),
    stockCosts: posted.filter(row => row.transaction_type === "stock_cost").reduce((sum, row) => sum + Number(row.amount_pence || 0), 0),
    refunds: posted.filter(row => row.category === "refunds").reduce((sum, row) => sum + Number(row.amount_pence || 0), 0),
  };
}

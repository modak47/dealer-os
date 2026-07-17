import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type SalesDeal = {
  id: string;
  invoice_number: string | null;
  status: string;
  sale_price: number | null;
  deposit_amount: number | null;
  balance_due: number | null;
  payment_status: string | null;
  part_exchange_amount: number | null;
  discount_amount?: number | null;
  finance_status?: string | null;
  finance_provider?: string | null;
  delivery_method: string | null;
  delivery_date: string | null;
  collection_date?: string | null;
  handover_status?: string | null;
  created_at: string;
  completed_at: string | null;
  customer?: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;
  bike?: { id: number; stock_number?: string | null; make: string | null; model: string | null; variant: string | null; year?: number | null; registration: string | null; price: number | null; status: string | null; primary_image_url: string | null; purchase_price?: number | null; total_stock_cost?: number | null } | null;
  invoice?: { id: string; invoice_number: string; status: string; total: number; paid: number; balance: number }[] | null;
  delivery?: { id: string; status: string; scheduled_at: string | null; completed_at: string | null; identity_checked: boolean; licence_verified: boolean; v5_prepared: boolean; handover_completed: boolean; keys_given: boolean; documents_signed: boolean; photos_taken: boolean; hpi_complete: boolean }[] | null;
  payments?: { id: string; amount: number; method: string; payment_type: string; paid_at: string; status: string }[] | null;
};

export type PipelineReservation = {
  id: string;
  status: string;
  deposit_amount: number;
  reserved_at: string;
  expires_at: string;
  customer?: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;
  bike?: { id: number; stock_number?: string | null; make: string | null; model: string | null; variant: string | null; year?: number | null; registration: string | null; price: number | null; status: string | null; primary_image_url: string | null } | null;
};

export type SalesPipelineResult = {
  migrationReady: boolean;
  deals: SalesDeal[];
  reservations: PipelineReservation[];
  kpis: {
    openDeals: number;
    reserved: number;
    awaitingPayment: number;
    finance: number;
    delivery: number;
    completedThisMonth: number;
    openValue: number;
    outstandingBalance: number;
  };
};

export async function getSalesPipeline(): Promise<SalesPipelineResult> {
  const db = getSupabaseAdmin();
  const [dealsResult, reservationsResult] = await Promise.all([
    db.from("crm_sales")
      .select("*,customer:crm_customers(id,first_name,last_name,email,phone),bike:stock_bikes!crm_sales_stock_bike_id_fkey(id,stock_number,make,model,variant,registration,price,status,primary_image_url,purchase_price,total_stock_cost),invoice:crm_invoices(id,invoice_number,status,total,paid,balance),delivery:crm_deliveries(*),payments:crm_payments(id,amount,method,payment_type,paid_at,status)")
      .order("created_at", { ascending: false }),
    db.from("crm_reservations")
      .select("id,status,deposit_amount,reserved_at,expires_at,customer:crm_customers(id,first_name,last_name,email,phone),bike:stock_bikes(id,stock_number,make,model,variant,registration,price,status,primary_image_url)")
      .in("status", ["Active", "Deposit Taken"])
      .order("reserved_at", { ascending: false }),
  ]);

  if (dealsResult.error) {
    if (["42P01", "42703"].includes(dealsResult.error.code ?? "")) {
      return emptyPipeline(false);
    }
    throw dealsResult.error;
  }

  if (reservationsResult.error) {
    if (["42P01", "42703"].includes(reservationsResult.error.code ?? "")) {
      return emptyPipeline(false);
    }
    throw reservationsResult.error;
  }

  const deals = (dealsResult.data ?? []) as unknown as SalesDeal[];
  const reservations = (reservationsResult.data ?? []) as unknown as PipelineReservation[];
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const openDeals = deals.filter(deal => !["Completed", "Sale Completed", "Cancelled"].includes(deal.status));
  const completedThisMonth = deals.filter(deal => ["Completed", "Sale Completed"].includes(deal.status) && deal.completed_at && sameMonth(deal.completed_at, month, year)).length;

  return {
    migrationReady: true,
    deals,
    reservations,
    kpis: {
      openDeals: openDeals.length,
      reserved: reservations.length + openDeals.filter(deal => deal.status === "Reserved").length,
      awaitingPayment: openDeals.filter(deal => ["Sale Pending", "Awaiting Payment", "Sale Agreed"].includes(deal.status)).length,
      finance: openDeals.filter(deal => deal.status === "Finance").length,
      delivery: openDeals.filter(deal => ["Sold", "Delivery"].includes(deal.status)).length,
      completedThisMonth,
      openValue: openDeals.reduce((sum, deal) => sum + Number(deal.sale_price ?? deal.bike?.price ?? 0), 0),
      outstandingBalance: openDeals.reduce((sum, deal) => sum + Number(deal.balance_due ?? invoiceBalance(deal) ?? 0), 0),
    },
  };
}

export function dealBikeName(deal: SalesDeal | PipelineReservation) {
  return [deal.bike?.year, deal.bike?.make, deal.bike?.model, deal.bike?.variant].filter(Boolean).join(" ") || "Motorcycle";
}

export function dealCustomerName(deal: SalesDeal | PipelineReservation) {
  return [deal.customer?.first_name, deal.customer?.last_name].filter(Boolean).join(" ") || "Customer";
}

export function invoiceBalance(deal: SalesDeal) {
  const invoice = Array.isArray(deal.invoice) ? deal.invoice[0] : null;
  return invoice ? Number(invoice.balance ?? 0) : null;
}

function emptyPipeline(migrationReady: boolean): SalesPipelineResult {
  return {
    migrationReady,
    deals: [],
    reservations: [],
    kpis: { openDeals: 0, reserved: 0, awaitingPayment: 0, finance: 0, delivery: 0, completedThisMonth: 0, openValue: 0, outstandingBalance: 0 },
  };
}

function sameMonth(value: string, month: number, year: number) {
  const date = new Date(value);
  return date.getMonth() === month && date.getFullYear() === year;
}

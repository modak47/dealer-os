import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type VehicleWorkspaceData = {
  activeReservation: Record<string, unknown> | null;
  activeSale: Record<string, unknown> | null;
  reservations: Record<string, unknown>[];
  sales: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  deliveries: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  activity: Record<string, unknown>[];
  customers: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }[];
  migrationReady: boolean;
};

type AddonSelectionRow = {
  id: string;
  reservation_id: string;
  category: string;
  name_snapshot: string;
  price_snapshot: number;
  quantity: number;
};

export async function getVehicleWorkspace(stockBikeId: number): Promise<VehicleWorkspaceData> {
  const db = getSupabaseAdmin();
  const [
    reservations,
    sales,
    invoices,
    payments,
    deliveries,
    tasks,
    activity,
    customers,
  ] = await Promise.all([
    db.from("crm_reservations").select("*,customer:crm_customers(id,first_name,last_name,email,phone)").eq("stock_bike_id", stockBikeId).order("reserved_at", { ascending: false }).limit(20),
    db.from("crm_sales").select("*,customer:crm_customers(id,first_name,last_name,email,phone)").eq("stock_bike_id", stockBikeId).order("created_at", { ascending: false }).limit(20),
    db.from("crm_invoices").select("id,invoice_number,status,total,paid,balance,due_at,issued_at,sale_id,reservation_id,created_at").eq("stock_bike_id", stockBikeId).is("deleted_at", null).order("created_at", { ascending: false }).limit(20),
    db.from("crm_payments").select("id,amount,method,payment_type,status,paid_at,sale_id,reservation_id,invoice_id,receipt_number").eq("stock_bike_id", stockBikeId).is("deleted_at", null).order("paid_at", { ascending: false }).limit(25),
    db.from("crm_deliveries").select("*").eq("stock_bike_id", stockBikeId).order("created_at", { ascending: false }).limit(10),
    db.from("stock_workflow_tasks").select("*").eq("stock_bike_id", stockBikeId).order("created_at", { ascending: false }).limit(20),
    db.from("stock_activity_events").select("*").eq("stock_bike_id", stockBikeId).order("created_at", { ascending: false }).limit(50),
    db.from("crm_customers").select("id,first_name,last_name,email,phone").order("updated_at", { ascending: false }).limit(100),
  ]);

  const migrationMissing = [activity].some(result => ["42P01", "42703"].includes(result.error?.code ?? ""));
  const hardError = [reservations, sales, invoices, payments, deliveries, tasks, activity, customers].find(result => result.error && !["42P01", "42703"].includes(result.error.code ?? ""));
  if (hardError?.error) throw hardError.error;

  const reservationRows = (reservations.data ?? []) as Record<string, unknown>[];
  const saleRows = (sales.data ?? []) as Record<string, unknown>[];
  if (reservationRows.length) {
    const reservationIds = reservationRows.map(row => String(row.id)).filter(Boolean);
    const selections = await db.from("reservation_addon_selections").select("id,reservation_id,category,name_snapshot,price_snapshot,quantity").in("reservation_id", reservationIds).order("created_at");
    if (selections.error && !["42P01", "42703"].includes(selections.error.code ?? "")) throw selections.error;
    const byReservation = new Map<string, AddonSelectionRow[]>();
    for (const selection of (selections.data ?? []) as AddonSelectionRow[]) byReservation.set(selection.reservation_id, [...(byReservation.get(selection.reservation_id) ?? []), selection]);
    for (const row of reservationRows) row.selected_extras = byReservation.get(String(row.id)) ?? [];
  }

  return {
    reservations: reservationRows,
    sales: saleRows,
    invoices: (invoices.data ?? []) as Record<string, unknown>[],
    payments: (payments.data ?? []) as Record<string, unknown>[],
    deliveries: (deliveries.data ?? []) as Record<string, unknown>[],
    tasks: (tasks.data ?? []) as Record<string, unknown>[],
    activity: migrationMissing ? [] : (activity.data ?? []) as Record<string, unknown>[],
    customers: (customers.data ?? []) as VehicleWorkspaceData["customers"],
    activeReservation: reservationRows.find(row => ["Active", "Deposit Taken"].includes(String(row.status))) ?? null,
    activeSale: saleRows.find(row => !["Completed", "Sale Completed", "Cancelled"].includes(String(row.status))) ?? null,
    migrationReady: !migrationMissing,
  };
}

export function recordCustomerName(record: Record<string, unknown> | null | undefined) {
  const customer = record?.customer as { first_name?: string | null; last_name?: string | null } | null | undefined;
  return [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Customer";
}

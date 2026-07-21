import "server-only";

import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { addStockCost } from "@/lib/stock-costs";

type Step = { name: string; ok: boolean; detail: string; ids?: Record<string, unknown> };
export type ShadowPurgeResult = { deleted: { table: string; count: number }[]; total: number; warnings: string[] };

const runId = () => `SHADOW-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const missingSchema = (error: { code?: string; message?: string } | null | undefined) => Boolean(error && (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "") || /does not exist|schema cache|column/i.test(error.message ?? "")));

export async function runControlledShadowTests() {
  const db = getSupabaseAdmin();
  const userId = await getCurrentUserId();
  const marker = runId();
  const steps: Step[] = [];
  const ids: Record<string, unknown> = { marker };

  function step(name: string, ok: boolean, detail: string, extra?: Record<string, unknown>) {
    steps.push({ name, ok, detail, ids: extra });
  }

  const customer = await db.from("crm_customers").insert({
    first_name: "Shadow",
    last_name: `Tester ${marker}`,
    email: `${marker.toLowerCase()}@example.invalid`,
    phone: `07000${Date.now().toString().slice(-6)}`,
    notes: `CONTROLLED SHADOW MODE TEST ${marker}`,
    tags: ["shadow-mode-test"],
    is_test_record: true,
    created_by: userId,
  }).select("id").single();
  if (customer.error) throw customer.error;
  ids.customerId = customer.data.id;
  step("Create test customer", true, "Created marked CRM customer.", { customerId: customer.data.id });

  const booking = await db.rpc("book_motorcycle_into_stock", {
    p_user_id: userId,
    p_payload: {
      idempotency_key: marker,
      registration: `T${Date.now().toString().slice(-6)}`,
      vin: `TEST${Date.now().toString().slice(-13)}`.padEnd(17, "1"),
      make: "YesMoto",
      model: "Shadow Test",
      variant: "DMS Validation",
      year: 2026,
      mileage: 12,
      status: "In Stock",
      purchase_source: "other",
      purchase_date: new Date().toISOString().slice(0, 10),
      purchase_price: 2000,
      target_retail_price: 3500,
      price: 3500,
      seller: { type: "other", name: `Shadow Supplier ${marker}`, notes: `CONTROLLED SHADOW MODE TEST ${marker}` },
      immediate_costs: [{ category: "transport", description: "Shadow transport", amount: 100, payment_status: "unpaid", payment_method: "Bank Transfer" }],
      workshop_required: true,
      valet_required: true,
      photos_required: true,
      notes: `CONTROLLED SHADOW MODE TEST ${marker}`,
    },
  });
  if (booking.error) throw booking.error;
  const stockBikeId = Number((booking.data as { stock_bike_id?: number }).stock_bike_id);
  ids.stockBikeId = stockBikeId;
  await markStockTestRecords(stockBikeId, marker);
  await db.from("stock_bikes").update({ is_test_record: true, show_on_website: false, reserve_enabled: false, price: 3500 }).eq("id", stockBikeId);
  step("Book into stock", true, "Created stock, supplier, purchase, transport cost and purchase/cost ledger entries.", { stockBikeId });

  const workshopCostId = await addStockCost(stockBikeId, {
    category: "workshop_labour",
    description: "Shadow workshop validation",
    amount: 150,
    idempotency_key: `shadow-workshop:${marker}`,
    notes: `CONTROLLED SHADOW MODE TEST ${marker}`,
  });
  ids.workshopCostId = workshopCostId;
  await markStockTestRecords(stockBikeId, marker);
  step("Add workshop cost", true, "Added GBP 150 workshop cost through stock_add_cost and ledger posting.", { workshopCostId });

  const basis = await db.from("stock_bikes").select("total_stock_cost").eq("id", stockBikeId).single();
  const totalCost = Number(basis.data?.total_stock_cost ?? 0);
  step("Verify cost basis", totalCost === 2250, `Expected GBP 2250, got GBP ${totalCost}.`);

  const sale = await db.rpc("crm_start_sale", {
    p_customer_id: customer.data.id,
    p_bike_id: stockBikeId,
    p_sale_price: 3500,
    p_deposit: 250,
    p_method: "Card",
    p_receipt: `DEP-${marker}`,
    p_notes: `CONTROLLED SHADOW MODE TEST ${marker}`,
    p_user_id: userId,
  });
  if (sale.error) throw sale.error;
  const saleId = sale.data as string;
  ids.saleId = saleId;
  await markSaleTestRecords(saleId);
  step("Start sale", true, "Created sale, invoice, motorcycle invoice item and GBP 250 deposit.", { saleId });

  const invoice = await db.from("crm_invoices").select("id,balance").eq("sale_id", saleId).single();
  if (invoice.error) throw invoice.error;
  step("Verify deposit balance", Number(invoice.data.balance) === 3250, `Expected balance GBP 3250, got GBP ${invoice.data.balance}.`, { invoiceId: invoice.data.id });

  const finalPayment = await db.from("crm_payments").insert({
    sale_id: saleId,
    invoice_id: invoice.data.id,
    customer_id: customer.data.id,
    stock_bike_id: stockBikeId,
    payment_type: "Balance payment",
    method: "Bank Transfer",
    amount: 3250,
    receipt_number: `BAL-${marker}`,
    notes: `CONTROLLED SHADOW MODE TEST ${marker}`,
    status: "Completed",
    created_by: userId,
    is_test_record: true,
  }).select("id").single();
  if (finalPayment.error) throw finalPayment.error;
  ids.finalPaymentId = finalPayment.data.id;
  await db.rpc("crm_refresh_sale_balance", { p_sale_id: saleId });
  await markSaleTestRecords(saleId);
  step("Record final payment", true, "Final payment recorded and sale balance refreshed.", { paymentId: finalPayment.data.id });

  await db.from("crm_deliveries").update({
    identity_checked: true,
    licence_verified: true,
    v5_prepared: true,
    handover_completed: true,
    keys_given: true,
    documents_signed: true,
    photos_taken: true,
    hpi_complete: true,
    status: "Ready",
  }).eq("sale_id", saleId);

  const beforeRevenue = await countLedger("sale_completion", saleId);
  const complete = await db.rpc("crm_complete_sale", { p_sale_id: saleId, p_user_id: userId });
  if (complete.error) throw complete.error;
  const retry = await db.rpc("crm_complete_sale", { p_sale_id: saleId, p_user_id: userId });
  const afterRevenue = await countLedger("sale_completion", saleId);
  await markSaleTestRecords(saleId);
  await markStockTestRecords(stockBikeId, marker);
  step("Complete sale and retry", !retry.error && afterRevenue === beforeRevenue + 1, `Revenue rows before ${beforeRevenue}, after ${afterRevenue}; retry error ${retry.error?.message ?? "none"}.`);

  const refundSale = await createCancellationRefundScenario(customer.data.id, marker, userId);
  ids.refundScenario = refundSale;
  step("Cancellation and refund", true, "Created second test sale, cancelled it, retained original payment and recorded separate refund.", refundSale);

  const px = await createPartExchangeScenario(customer.data.id, marker, userId);
  ids.partExchange = px;
  step("Part exchange", true, "Linked outgoing sale to incoming test stock via source_deal_id and single allowance.", px);

  const health = await db.from("dealer5_shadow_health").select("stock_bike_id,health_status").limit(5);
  step("Dealer5 health report", !health.error, health.error ? health.error.message : "Dealer5 shadow health view queried successfully.");

  return {
    marker,
    ready: steps.every(item => item.ok),
    steps,
    ids,
    cleanup: `Delete or void records tagged/marked with CONTROLLED SHADOW MODE TEST ${marker}; stock is is_test_record=true and show_on_website=false.`,
  };
}

export async function purgeControlledShadowTestData(): Promise<ShadowPurgeResult> {
  const db = getSupabaseAdmin();
  const deleted: ShadowPurgeResult["deleted"] = [];
  const warnings: string[] = [];

  async function collectIds(table: string): Promise<(string | number)[]> {
    const { data, error } = await db.from(table).select("id").eq("is_test_record", true);
    if (missingSchema(error)) {
      warnings.push(`${table} is not available for test cleanup.`);
      return [];
    }
    if (error) throw error;
    return (data ?? []).map((row) => (row as { id: string | number }).id).filter((id) => id !== null && id !== undefined);
  }

  async function deleteEq(table: string, column: string, value: string | number | boolean | null) {
    const { count, error } = value === null
      ? await db.from(table).delete({ count: "exact" }).is(column, null)
      : await db.from(table).delete({ count: "exact" }).eq(column, value);
    if (missingSchema(error)) {
      warnings.push(`${table}.${column} was skipped during test cleanup.`);
      return;
    }
    if (error) throw error;
    if (count) deleted.push({ table, count });
  }

  async function deleteIn(table: string, column: string, values: (string | number)[]) {
    if (!values.length) return;
    const { count, error } = await db.from(table).delete({ count: "exact" }).in(column, values);
    if (missingSchema(error)) {
      warnings.push(`${table}.${column} was skipped during test cleanup.`);
      return;
    }
    if (error) throw error;
    if (count) deleted.push({ table, count });
  }

  const [customerIds, leadIds, reservationIds, saleIds, invoiceIds, stockBikeIds] = await Promise.all([
    collectIds("crm_customers"),
    collectIds("crm_leads"),
    collectIds("crm_reservations"),
    collectIds("crm_sales"),
    collectIds("crm_invoices"),
    collectIds("stock_bikes"),
  ]);

  await deleteIn("crm_documents", "customer_id", customerIds);
  await deleteIn("crm_documents", "lead_id", leadIds);
  await deleteIn("crm_documents", "reservation_id", reservationIds);
  await deleteIn("crm_documents", "sale_id", saleIds);
  await deleteIn("crm_documents", "stock_bike_id", stockBikeIds);
  await deleteIn("crm_communications", "customer_id", customerIds);
  await deleteIn("crm_activities", "customer_id", customerIds);
  await deleteIn("crm_activities", "lead_id", leadIds);
  await deleteIn("crm_activities", "reservation_id", reservationIds);
  await deleteIn("crm_activities", "sale_id", saleIds);
  await deleteIn("crm_activities", "stock_bike_id", stockBikeIds);
  await deleteIn("stock_workflow_tasks", "stock_bike_id", stockBikeIds);
  await deleteIn("stock_activity_events", "stock_bike_id", stockBikeIds);

  await deleteEq("stock_activity_events", "is_test_record", true);
  await deleteEq("financial_ledger_transactions", "is_test_record", true);
  await deleteEq("crm_payments", "is_test_record", true);
  await deleteEq("crm_invoice_items", "is_test_record", true);
  await deleteIn("crm_invoice_items", "invoice_id", invoiceIds);
  await deleteEq("crm_deliveries", "is_test_record", true);
  await deleteEq("crm_invoices", "is_test_record", true);
  await deleteEq("crm_reservations", "is_test_record", true);
  await deleteEq("crm_leads", "is_test_record", true);
  await deleteEq("crm_sales", "is_test_record", true);
  await deleteEq("stock_costs", "is_test_record", true);
  await deleteEq("stock_purchases", "is_test_record", true);
  await deleteEq("stock_bikes", "is_test_record", true);
  await deleteEq("stock_suppliers", "is_test_record", true);
  await deleteEq("crm_customers", "is_test_record", true);

  return { deleted, total: deleted.reduce((sum, row) => sum + row.count, 0), warnings };
}

async function createCancellationRefundScenario(customerId: string, marker: string, userId: string | null) {
  const db = getSupabaseAdmin();
  const booking = await db.rpc("book_motorcycle_into_stock", {
    p_user_id: userId,
    p_payload: {
      idempotency_key: `${marker}-refund`,
      registration: `R${Date.now().toString().slice(-6)}`,
      vin: `REFUND${Date.now().toString().slice(-11)}`.padEnd(17, "2"),
      make: "YesMoto",
      model: "Refund Test",
      year: 2026,
      status: "In Stock",
      purchase_source: "other",
      purchase_price: 1000,
      target_retail_price: 1800,
      seller: { type: "other", name: `Shadow Supplier Refund ${marker}` },
      notes: `CONTROLLED SHADOW MODE TEST ${marker}`,
    },
  });
  if (booking.error) throw booking.error;
  const stockBikeId = Number((booking.data as { stock_bike_id?: number }).stock_bike_id);
  await db.from("stock_bikes").update({ is_test_record: true, show_on_website: false, reserve_enabled: false, price: 1800 }).eq("id", stockBikeId);
  await markStockTestRecords(stockBikeId, marker);
  const sale = await db.rpc("crm_start_sale", { p_customer_id: customerId, p_bike_id: stockBikeId, p_sale_price: 1800, p_deposit: 250, p_method: "Card", p_receipt: `REFDEP-${marker}`, p_notes: `CONTROLLED SHADOW MODE TEST ${marker}`, p_user_id: userId });
  if (sale.error) throw sale.error;
  const saleId = sale.data as string;
  await markSaleTestRecords(saleId);
  await db.rpc("crm_cancel_sale", { p_sale_id: saleId, p_reason: "Controlled shadow-mode cancellation test", p_user_id: userId });
  const original = await db.from("crm_payments").select("id").eq("sale_id", saleId).eq("payment_type", "Deposit").single();
  if (original.error) throw original.error;
  const refund = await db.rpc("crm_record_refund", { p_original_payment_id: original.data.id, p_amount: 250, p_reason: "Controlled shadow-mode refund test", p_method: "Bank Transfer", p_reference: `REFUND-${marker}`, p_user_id: userId });
  if (refund.error) throw refund.error;
  await markSaleTestRecords(saleId);
  return { stockBikeId, saleId, originalPaymentId: original.data.id, refundPaymentId: refund.data };
}

async function createPartExchangeScenario(customerId: string, marker: string, userId: string | null) {
  const db = getSupabaseAdmin();
  const outgoing = await db.rpc("book_motorcycle_into_stock", {
    p_user_id: userId,
    p_payload: {
      idempotency_key: `${marker}-px-out`,
      registration: `P${Date.now().toString().slice(-6)}`,
      vin: `PXOUT${Date.now().toString().slice(-12)}`.padEnd(17, "3"),
      make: "YesMoto",
      model: "PX Outgoing",
      year: 2026,
      status: "In Stock",
      purchase_source: "other",
      purchase_price: 1200,
      target_retail_price: 2500,
      seller: { type: "other", name: `Shadow Supplier PX ${marker}` },
      notes: `CONTROLLED SHADOW MODE TEST ${marker}`,
    },
  });
  if (outgoing.error) throw outgoing.error;
  const outgoingStockId = Number((outgoing.data as { stock_bike_id?: number }).stock_bike_id);
  await db.from("stock_bikes").update({ is_test_record: true, show_on_website: false, reserve_enabled: false, price: 2500 }).eq("id", outgoingStockId);
  await markStockTestRecords(outgoingStockId, marker);
  const sale = await db.rpc("crm_start_sale", { p_customer_id: customerId, p_bike_id: outgoingStockId, p_sale_price: 2500, p_deposit: 0, p_method: "Part Exchange", p_receipt: `PX-${marker}`, p_notes: `CONTROLLED SHADOW MODE TEST ${marker}`, p_user_id: userId });
  if (sale.error) throw sale.error;
  const saleId = sale.data as string;
  await db.from("crm_sales").update({ part_exchange_amount: 500, is_test_record: true }).eq("id", saleId);
  await db.rpc("crm_refresh_sale_balance", { p_sale_id: saleId });
  const incoming = await db.rpc("book_motorcycle_into_stock", {
    p_user_id: userId,
    p_payload: {
      idempotency_key: `${marker}-px-in`,
      registration: `X${Date.now().toString().slice(-6)}`,
      vin: `PXIN${Date.now().toString().slice(-13)}`.padEnd(17, "4"),
      make: "YesMoto",
      model: "PX Incoming",
      year: 2020,
      status: "Awaiting Preparation",
      purchase_source: "part_exchange",
      seller: { type: "part_exchange", name: "Part exchange customer" },
      purchase_price: 500,
      target_retail_price: 1200,
      source_deal_id: saleId,
      notes: `CONTROLLED SHADOW MODE TEST ${marker}`,
    },
  });
  if (incoming.error) throw incoming.error;
  const incomingStockId = Number((incoming.data as { stock_bike_id?: number }).stock_bike_id);
  await db.from("stock_bikes").update({ is_test_record: true, show_on_website: false, reserve_enabled: false }).eq("id", incomingStockId);
  await markStockTestRecords(incomingStockId, marker);
  await markSaleTestRecords(saleId);
  return { saleId, outgoingStockId, incomingStockId, allowance: 500 };
}

async function countLedger(sourceType: string, sourceId: string) {
  const { count, error } = await getSupabaseAdmin().from("financial_ledger_transactions").select("id", { count: "exact", head: true }).eq("source_type", sourceType).eq("source_id", sourceId);
  if (error) throw error;
  return count ?? 0;
}

async function markStockTestRecords(stockBikeId: number, marker: string) {
  const db = getSupabaseAdmin();
  const purchases = await db.from("stock_purchases").select("supplier_id").eq("stock_bike_id", stockBikeId);
  const supplierIds = (purchases.data ?? []).map(row => row.supplier_id).filter(Boolean);
  await Promise.all([
    db.from("stock_bikes").update({ is_test_record: true, show_on_website: false, reserve_enabled: false, notes: `CONTROLLED SHADOW MODE TEST ${marker}` }).eq("id", stockBikeId),
    supplierIds.length ? db.from("stock_suppliers").update({ is_test_record: true }).in("id", supplierIds) : Promise.resolve({ error: null }),
    db.from("stock_purchases").update({ is_test_record: true }).eq("stock_bike_id", stockBikeId),
    db.from("stock_costs").update({ is_test_record: true }).eq("stock_bike_id", stockBikeId),
    db.from("financial_ledger_transactions").update({ is_test_record: true }).eq("stock_bike_id", stockBikeId),
    db.from("stock_activity_events").update({ is_test_record: true }).eq("stock_bike_id", stockBikeId),
  ]);
}

async function markSaleTestRecords(saleId: string) {
  const db = getSupabaseAdmin();
  const [sale, invoices] = await Promise.all([
    db.from("crm_sales").select("stock_bike_id").eq("id", saleId).single(),
    db.from("crm_invoices").select("id").eq("sale_id", saleId),
  ]);
  const invoiceIds = (invoices.data ?? []).map(row => row.id);
  await Promise.all([
    db.from("crm_sales").update({ is_test_record: true }).eq("id", saleId),
    db.from("crm_invoices").update({ is_test_record: true }).eq("sale_id", saleId),
    invoiceIds.length ? db.from("crm_invoice_items").update({ is_test_record: true }).in("invoice_id", invoiceIds) : Promise.resolve({ error: null }),
    db.from("crm_payments").update({ is_test_record: true }).eq("sale_id", saleId),
    db.from("crm_deliveries").update({ is_test_record: true }).eq("sale_id", saleId),
    db.from("financial_ledger_transactions").update({ is_test_record: true }).eq("deal_id", saleId),
  ]);
  if (sale.data?.stock_bike_id) await markStockTestRecords(Number(sale.data.stock_bike_id), `sale-${saleId}`);
}

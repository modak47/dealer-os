import "server-only";

import { getDealerSettings } from "@/lib/dealer-settings";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PortalLookup = { email: string; code: string };
type PortalCustomer = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; postcode?: string | null; portal_access_code?: string | null };
type PortalAuth = { ok: true; db: SupabaseClient; customer: PortalCustomer; code: string } | { ok: false; error: string };

const clean = (value: unknown) => typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
const money = (value: unknown) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(value ?? 0) || 0);
const missing = (error: { code?: string } | null | undefined) => ["42P01", "42703", "PGRST200", "PGRST201", "PGRST205"].includes(error?.code ?? "");

function paymentReference(invoiceNumber?: string | null) {
  return invoiceNumber ? invoiceNumber.replace(/\s+/g, "") : "";
}

function isLiveInvoice(invoice: { status?: string | null }) {
  return !["cancelled", "canceled", "credited", "void"].includes(clean(invoice.status).toLowerCase());
}

export async function authenticatePortalCustomer(input: PortalLookup): Promise<PortalAuth> {
  const email = clean(input.email).toLowerCase();
  const code = clean(input.code).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!email || !code) return { ok: false, error: "Enter your email address and portal code." };

  const db = getSupabaseAdmin();
  const { data: customer, error: customerError } = await db
    .from("crm_customers")
    .select("id,first_name,last_name,email,phone,postcode,portal_access_code")
    .eq("portal_access_code", code)
    .ilike("email", email)
    .is("archived_at", null)
    .maybeSingle();

  if (customerError) {
    if (missing(customerError)) return { ok: false, error: "Customer portal setup is not complete yet." };
    throw customerError;
  }
  if (!customer) return { ok: false, error: "We could not find a portal record for those details." };
  return { ok: true, db, customer: customer as PortalCustomer, code };
}

export async function loadCustomerPortal(input: PortalLookup) {
  const auth = await authenticatePortalCustomer(input);
  if (!auth.ok) return auth;

  const { db, customer, code } = auth;
  const customerId = String(customer.id);
  const [reservations, sales, invoices, payments, deliveries, settings] = await Promise.all([
    db.from("crm_reservations").select("id,status,deposit_amount,reserved_at,expires_at,delivery_option,delivery_charge,stock_bike_id").eq("customer_id", customerId).order("reserved_at", { ascending: false }),
    db.from("crm_sales").select("id,status,sale_price,deposit_amount,balance_due,payment_status,delivery_method,delivery_date,collection_date,handover_status,created_at,completed_at,stock_bike_id").eq("customer_id", customerId).order("created_at", { ascending: false }),
    db.from("crm_invoices").select("id,invoice_number,status,total,paid,balance,issued_at,due_at,delivery_charge,stock_bike_id,sale_id,reservation_id").eq("customer_id", customerId).is("deleted_at", null).order("created_at", { ascending: false }),
    db.from("crm_payments").select("id,amount,method,payment_type,receipt_number,paid_at,status,stock_bike_id,invoice_id,sale_id,reservation_id").eq("customer_id", customerId).is("deleted_at", null).order("paid_at", { ascending: false }),
    db.from("crm_deliveries").select("id,status,delivery_method,scheduled_at,completed_at,identity_checked,licence_verified,v5_prepared,handover_completed,keys_given,documents_signed,photos_taken,hpi_complete,notes,stock_bike_id,sale_id,customer_confirmed_at,customer_signature_name").eq("customer_id", customerId).is("deleted_at", null).order("created_at", { ascending: false }),
    getDealerSettings(),
  ]);

  const hardError = [reservations, sales, invoices, payments, deliveries].find(result => result.error && !missing(result.error));
  if (hardError?.error) throw hardError.error;

  const reservationRows = reservations.error && missing(reservations.error) ? [] : reservations.data ?? [];
  const saleRows = sales.error && missing(sales.error) ? [] : sales.data ?? [];
  const invoiceRows = invoices.error && missing(invoices.error) ? [] : invoices.data ?? [];
  const paymentRows = payments.error && missing(payments.error) ? [] : payments.data ?? [];
  const deliveryRows = deliveries.error && missing(deliveries.error) ? [] : deliveries.data ?? [];
  const bikeIds = Array.from(new Set([...reservationRows, ...saleRows, ...invoiceRows].map(row => Number((row as { stock_bike_id?: number | string | null }).stock_bike_id)).filter(Number.isFinite)));
  const bikes = bikeIds.length ? await db.from("stock_bikes").select("id,make,model,variant,year,registration,price,primary_image_url,status").in("id", bikeIds) : { data: [], error: null };
  if (bikes.error && !missing(bikes.error)) throw bikes.error;
  const documents = await db.from("crm_documents").select("id,file_name,document_type,mime_type,size_bytes,created_at").eq("customer_id", customerId).order("created_at", { ascending: false });
  if (documents.error && !missing(documents.error)) throw documents.error;
  const bikeById = new Map((bikes.data ?? []).map(bike => [Number(bike.id), bike]));
  const withBike = <T extends { stock_bike_id?: number | string | null }>(rows: T[]) => rows.map(row => ({ ...row, bike: bikeById.get(Number(row.stock_bike_id)) ?? null }));
  const latestInvoice = invoiceRows[0] as Record<string, unknown> | undefined;
  const reference = paymentReference(clean(latestInvoice?.invoice_number) || `${settings.payment_reference_prefix}-${code}`);
  const outstanding = invoiceRows.filter(isLiveInvoice).reduce((sum, invoice) => sum + Number((invoice as { balance?: number }).balance ?? 0), 0);

  return {
    ok: true,
    customer: {
      name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
      email: customer.email,
      phone: customer.phone,
      postcode: customer.postcode,
    },
    reservations: withBike(reservationRows),
    sales: withBike(saleRows),
    invoices: withBike(invoiceRows),
    payments: paymentRows,
    deliveries: deliveryRows,
    documents: documents.error && missing(documents.error) ? [] : documents.data ?? [],
    payment: {
      configured: Boolean(settings.bank_account_name && settings.bank_sort_code && settings.bank_account_number),
      accountName: settings.bank_account_name,
      sortCode: settings.bank_sort_code,
      accountNumber: settings.bank_account_number,
      reference,
      instructions: settings.payment_instructions,
      wording: settings.vat_wording,
      outstanding: money(outstanding),
    },
    dealer: {
      name: settings.business_name,
      phone: settings.phone,
      email: settings.email,
      openingHours: settings.opening_hours,
    },
  };
}

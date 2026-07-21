import "server-only";

import { getDealerSettings } from "@/lib/dealer-settings";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PortalLookup = { email: string; code: string };

const clean = (value: unknown) => typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
const money = (value: unknown) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(value ?? 0) || 0);
const missing = (error: { code?: string } | null | undefined) => ["42P01", "42703", "PGRST205"].includes(error?.code ?? "");

function paymentReference(invoiceNumber?: string | null) {
  return invoiceNumber ? invoiceNumber.replace(/\s+/g, "") : "";
}

export async function loadCustomerPortal(input: PortalLookup) {
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

  const customerId = String(customer.id);
  const [reservations, sales, invoices, payments, deliveries, settings] = await Promise.all([
    db.from("crm_reservations").select("id,status,deposit_amount,reserved_at,expires_at,delivery_option,delivery_charge,stock_bike_id,bike:stock_bikes(id,make,model,variant,year,registration,price,primary_image_url,status)").eq("customer_id", customerId).order("reserved_at", { ascending: false }),
    db.from("crm_sales").select("id,status,sale_price,deposit_amount,balance_due,payment_status,delivery_method,delivery_date,collection_date,handover_status,created_at,completed_at,stock_bike_id,bike:stock_bikes(id,make,model,variant,year,registration,price,primary_image_url,status)").eq("customer_id", customerId).order("created_at", { ascending: false }),
    db.from("crm_invoices").select("id,invoice_number,status,total,paid,balance,issued_at,due_at,delivery_charge,stock_bike_id,sale_id,reservation_id,bike:stock_bikes(id,make,model,variant,year,registration,primary_image_url)").eq("customer_id", customerId).is("deleted_at", null).order("created_at", { ascending: false }),
    db.from("crm_payments").select("id,amount,method,payment_type,receipt_number,paid_at,status,stock_bike_id,invoice_id,sale_id,reservation_id").eq("customer_id", customerId).is("deleted_at", null).order("paid_at", { ascending: false }),
    db.from("crm_deliveries").select("id,status,delivery_method,scheduled_at,completed_at,identity_checked,licence_verified,v5_prepared,handover_completed,keys_given,documents_signed,photos_taken,hpi_complete,notes,stock_bike_id,sale_id").eq("customer_id", customerId).is("deleted_at", null).order("created_at", { ascending: false }),
    getDealerSettings(),
  ]);

  const hardError = [reservations, sales, invoices, payments, deliveries].find(result => result.error && !missing(result.error));
  if (hardError?.error) throw hardError.error;

  const invoiceRows = invoices.data ?? [];
  const latestInvoice = invoiceRows[0] as Record<string, unknown> | undefined;
  const reference = paymentReference(clean(latestInvoice?.invoice_number) || `${settings.payment_reference_prefix}-${code}`);

  return {
    ok: true,
    customer: {
      name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
      email: customer.email,
      phone: customer.phone,
      postcode: customer.postcode,
    },
    reservations: reservations.data ?? [],
    sales: sales.data ?? [],
    invoices: invoiceRows,
    payments: payments.data ?? [],
    deliveries: deliveries.data ?? [],
    payment: {
      configured: Boolean(settings.bank_account_name && settings.bank_sort_code && settings.bank_account_number),
      accountName: settings.bank_account_name,
      sortCode: settings.bank_sort_code,
      accountNumber: settings.bank_account_number,
      reference,
      instructions: settings.payment_instructions,
      wording: settings.vat_wording,
      outstanding: money(invoiceRows.reduce((sum, invoice) => sum + Number((invoice as { balance?: number }).balance ?? 0), 0)),
    },
    dealer: {
      name: settings.business_name,
      phone: settings.phone,
      email: settings.email,
      openingHours: settings.opening_hours,
    },
  };
}

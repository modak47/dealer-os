"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Customer = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; postcode?: string | null };
type Bike = { id: number; stock_number?: string | null; year?: number | null; make?: string | null; model?: string | null; variant?: string | null; registration?: string | null; status?: string | null; price?: number | null; purchase_price?: number | null; total_stock_cost?: number | null; primary_image_url?: string | null };
type Invoice = { id: string; invoice_number: string; status: string; total: number; paid: number; balance: number };
type Payment = { id: string; amount: number; method: string; payment_type: string; receipt_number?: string | null; paid_at: string; status: string };
type Delivery = Record<string, unknown> & { id?: string; status?: string; scheduled_at?: string | null; delivery_method?: string | null; fuel_level?: string | null; notes?: string | null };

const handoverChecks = [
  ["identity_checked", "Identity checked"],
  ["licence_verified", "Licence verified"],
  ["v5_prepared", "V5 prepared"],
  ["handover_completed", "Handover completed"],
  ["keys_given", "Keys given"],
  ["documents_signed", "Documents signed"],
  ["photos_taken", "Photos taken"],
  ["hpi_complete", "HPI complete"],
];

const statuses = ["Negotiation", "Reserved", "Finance", "Awaiting Payment", "Sale Agreed", "Delivery", "Completed", "Cancelled"];

export function SaleEditor({ sale }: { sale: Record<string, unknown> }) {
  const router = useRouter();
  const customer = single<Customer>(sale.customer);
  const bike = single<Bike>(sale.bike);
  const delivery = single<Delivery>(sale.delivery);
  const invoice = single<Invoice>(sale.invoice);
  const payments = list<Payment>(sale.payments);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  const totals = useMemo(() => {
    const salePrice = number(sale.sale_price ?? bike?.price);
    const investment = number(bike?.total_stock_cost ?? bike?.purchase_price);
    const paid = payments.filter(payment => payment.status === "Completed").reduce((sum, payment) => sum + number(payment.amount), 0);
    return { salePrice, investment, expectedProfit: salePrice - investment, paid, balance: number(sale.balance_due ?? invoice?.balance) };
  }, [bike?.price, bike?.purchase_price, bike?.total_stock_cost, invoice?.balance, payments, sale.balance_due, sale.sale_price]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form);
    event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(input => {
      payload[input.name] = input.checked ? "true" : "false";
    });
    await patch(payload, "Deal details saved.");
  }

  async function patch(payload: Record<string, unknown>, ok: string) {
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/crm/sales/${String(sale.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json() as { error?: string };
    setSaving(false);
    setMessage(response.ok ? ok : result.error || "Unable to update deal.");
    if (response.ok) router.refresh();
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer?.id || !bike?.id) return setMessage("Customer and bike are required before recording payment.");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/crm/sales-workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "payment", sale_id: sale.id, customer_id: customer.id, stock_bike_id: bike.id, ...form }),
    });
    const result = await response.json() as { error?: string };
    setSaving(false);
    setMessage(response.ok ? "Payment recorded." : result.error || "Unable to record payment.");
    if (response.ok) router.refresh();
  }

  const bikeName = [bike?.year, bike?.make, bike?.model, bike?.variant].filter(Boolean).join(" ") || "Motorcycle";
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Customer";

  return <div className="sales-deal-detail">
    <section className="sales-deal-summary">
      <article><span>Sale price</span><strong>{money(totals.salePrice)}</strong><small>{invoice ? invoice.invoice_number : "Invoice pending"}</small></article>
      <article><span>Paid</span><strong>{money(totals.paid)}</strong><small>{String(sale.payment_status ?? "Payment unknown")}</small></article>
      <article className={totals.balance > 0 ? "alert" : ""}><span>Balance</span><strong>{money(totals.balance)}</strong><small>{invoice?.status || "No invoice status"}</small></article>
      <article><span>Expected profit</span><strong>{money(totals.expectedProfit)}</strong><small>Stock cost {money(totals.investment)}</small></article>
      <article><span>Finance</span><strong>{String(sale.finance_status ?? "Not required")}</strong><small>{String(sale.finance_provider ?? "No provider")}</small></article>
      <article><span>Handover</span><strong>{checkedCount(delivery)}/8</strong><small>{String(sale.handover_status ?? delivery?.status ?? "Not started")}</small></article>
    </section>

    {message && <p className={message.startsWith("Unable") || message.includes("required") ? "invoice-error" : "invoice-success"}>{message}</p>}

    <div className="sales-deal-layout">
      <form className="stock-editor-panel crm-form sale-editor" onSubmit={save}>
        <header><div><h2>Deal Control</h2><p>{customerName} · {bikeName} · {bike?.registration || "Registration pending"}</p></div></header>
        <div className="stock-form-grid">
          <label><span>Status</span><select name="status" defaultValue={String(sale.status ?? "Negotiation")}>{statuses.map(value => <option key={value}>{value}</option>)}</select></label>
          <label><span>Sale price</span><input name="sale_price" type="number" step="0.01" defaultValue={String(sale.sale_price ?? bike?.price ?? 0)} /></label>
          <label><span>Agreed price</span><input name="agreed_price" type="number" step="0.01" defaultValue={String(sale.agreed_price ?? sale.sale_price ?? bike?.price ?? 0)} /></label>
          <label><span>Discount</span><input name="discount_amount" type="number" min="0" step="0.01" defaultValue={String(sale.discount_amount ?? 0)} /></label>
          <label><span>Deposit</span><input name="deposit_amount" type="number" step="0.01" defaultValue={String(sale.deposit_amount ?? 0)} /></label>
          <label><span>Part exchange allowance</span><input name="part_exchange_amount" type="number" step="0.01" defaultValue={String(sale.part_exchange_amount ?? 0)} /></label>
          <label><span>Finance status</span><select name="finance_status" defaultValue={String(sale.finance_status ?? "Not required")}><option>Not required</option><option>Draft</option><option>Submitted</option><option>Referred</option><option>Approved</option><option>Declined</option><option>Paid out</option></select></label>
          <label><span>Finance provider</span><input name="finance_provider" defaultValue={String(sale.finance_provider ?? "")} /></label>
          <label><span>Finance reference</span><input name="finance_reference" defaultValue={String(sale.finance_reference ?? "")} /></label>
          <label><span>Delivery method</span><select name="delivery_delivery_method" defaultValue={String(delivery?.delivery_method ?? sale.delivery_method ?? "Collection")}><option>Collection</option><option>Nationwide Delivery</option></select></label>
          <label><span>Scheduled handover</span><input name="delivery_scheduled_at" type="datetime-local" defaultValue={String(delivery?.scheduled_at ?? "").slice(0, 16)} /></label>
          <label><span>Collection date</span><input name="collection_date" type="date" defaultValue={String(sale.collection_date ?? "")} /></label>
          <label className="full"><span>Delivery address</span><textarea name="delivery_address" rows={3} defaultValue={String(sale.delivery_address ?? "")} /></label>
          <label className="full"><span>Sale notes</span><textarea name="notes" rows={4} defaultValue={String(sale.notes ?? "")} /></label>
          <label className="full"><span>Delivery notes</span><textarea name="delivery_notes" rows={4} defaultValue={String(delivery?.notes ?? "")} /></label>
          <div className="full delivery-checks">{handoverChecks.map(([key, label]) => <label key={key}><input type="checkbox" name={key} defaultChecked={Boolean(delivery?.[key])} />{label}</label>)}</div>
        </div>
        <div className="sale-editor-actions">
          <button type="button" onClick={() => setCancelOpen(current => !current)} disabled={saving || sale.status === "Cancelled"}>Cancel deal</button>
          <button type="button" onClick={() => void patch({ action: "complete" }, "Sale completed.")} disabled={saving || sale.status === "Completed"}>Complete sale</button>
          <button className="admin-primary" disabled={saving}>{saving ? "Saving..." : "Save deal"}</button>
        </div>
      </form>

      <aside className="sales-deal-side">
        <section>
          <h2>Customer & Bike</h2>
          <p><b>{customerName}</b><span>{customer?.email || customer?.phone || "No contact details"}</span></p>
          <p><b>{bikeName}</b><span>{bike?.registration || "No registration"} · {bike?.status || "No status"}</span></p>
          <nav>{customer?.id && <Link href={`/admin/customers/${customer.id}`}>Customer profile</Link>}{bike?.id && <Link href={`/admin/stock/${bike.id}`}>Stock record</Link>}</nav>
        </section>
        <section>
          <h2>Invoice</h2>
          {invoice ? <><p><b>{invoice.invoice_number}</b><span>{invoice.status} · Balance {money(invoice.balance)}</span></p><nav><Link href={`/admin/accounts/invoices/${invoice.id}`}>Manage invoice</Link><Link href={`/admin/accounts/invoices/${invoice.id}/document`} target="_blank">View document</Link><a href={`/api/crm/invoices/${invoice.id}/pdf`}>PDF</a></nav></> : <p><span>No invoice linked to this sale.</span></p>}
        </section>
        <section>
          <h2>Record Payment</h2>
          <form className="sales-payment-form" onSubmit={recordPayment}>
            <input name="amount" type="number" min="0.01" step="0.01" placeholder="Amount" defaultValue={totals.balance > 0 ? String(totals.balance) : ""} />
            <select name="method"><option>Card</option><option>Cash</option><option>Bank</option><option>Finance</option><option>Part Exchange</option><option>Mixed</option></select>
            <input name="receipt_number" placeholder="Reference" />
            <button disabled={saving}>Record payment</button>
          </form>
        </section>
        {cancelOpen && <section className="sales-cancel-box">
          <h2>Cancel Deal</h2>
          <form onSubmit={event => { event.preventDefault(); void patch({ action: "cancel", reason: String(new FormData(event.currentTarget).get("reason") || "") }, "Deal cancelled."); }}>
            <textarea name="reason" rows={3} required placeholder="Cancellation reason" />
            <button disabled={saving}>Confirm cancellation</button>
          </form>
        </section>}
      </aside>
    </div>
  </div>;
}

function single<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return (value as T) ?? null;
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function checkedCount(delivery: Delivery | null) {
  return handoverChecks.filter(([key]) => Boolean(delivery?.[key])).length;
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(number(value));
}

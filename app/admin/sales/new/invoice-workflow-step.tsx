"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { InvoiceItem, InvoicePayment, InvoiceRow } from "@/lib/accounts";

type Data = { invoice: InvoiceRow; items: InvoiceItem[]; payments: InvoicePayment[] };

const money = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

export function InvoiceWorkflowStep({
  saleId,
  invoiceId,
  busy,
  back,
  completePayment,
}: {
  saleId: string;
  invoiceId: string;
  busy: boolean;
  back: () => void;
  completePayment: (form: Record<string, unknown>) => Promise<void>;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchInvoice = useCallback(async () => {
    const response = await fetch(
      invoiceId ? `/api/crm/invoices/${invoiceId}` : `/api/crm/invoices?sale_id=${saleId}`,
      { cache: "no-store" },
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    return body as Data;
  }, [invoiceId, saleId]);

  async function load() {
    const next = await fetchInvoice();
    setData(next);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    async function loadInvoice() {
      setLoading(true);
      try {
        const next = await fetchInvoice();
        if (active) {
          setData(next);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load invoice.");
          setLoading(false);
        }
      }
    }

    void loadInvoice();
    return () => {
      active = false;
    };
  }, [fetchInvoice]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const description = String(formData.get("description") || "");
    const quantity = Number(formData.get("quantity") || 1);
    const unit = Number(formData.get("unit_price") || 0);
    const line = quantity * unit;
    const temp: InvoiceItem = {
      id: `temp-${Date.now()}`,
      description,
      quantity,
      unit_price: unit,
      line_total: line,
      item_type: "other",
      sort_order: 100,
    };

    setData({
      ...data,
      items: [...data.items, temp],
      invoice: {
        ...data.invoice,
        subtotal: data.invoice.subtotal + line,
        total: data.invoice.total + line,
        balance: data.invoice.balance + line,
      },
    });
    setSaving(true);
    setError("");

    const response = await fetch(`/api/crm/invoices/${data.invoice.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, quantity, unit_price: unit }),
    });

    if (!response.ok) {
      setError((await response.json()).error || "Unable to add item.");
    } else {
      form.reset();
      await load();
    }
    setSaving(false);
  }

  async function payment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await completePayment(Object.fromEntries(new FormData(event.currentTarget)));
  }

  return (
    <div className="workflow-invoice">
      <h2>Invoice and payment</h2>
      <p>Add delivery or other products, review the live invoice, then record the balance payment.</p>
      {loading && <div className="invoice-loading">Loading invoice...</div>}
      {error && <p className="invoice-error">{error}</p>}
      {data && (
        <>
          <div className="workflow-invoice-actions">
            <Link target="_blank" href={`/admin/accounts/invoices/${data.invoice.id}/document`}>
              View invoice
            </Link>
            <Link target="_blank" href={`/admin/accounts/invoices/${data.invoice.id}/document`}>
              Print invoice
            </Link>
            <a href={`/api/crm/invoices/${data.invoice.id}/pdf`}>Download PDF</a>
          </div>

          <section className="workflow-invoice-preview">
            <header>
              <b>{data.invoice.invoice_number}</b>
              <span className={`invoice-status ${data.invoice.status}`}>{data.invoice.status}</span>
            </header>
            {data.items.map((item) => (
              <div key={item.id}>
                <span>
                  {item.description}
                  <small>
                    {item.quantity} x {money(item.unit_price)}
                  </small>
                </span>
                <b>{money(item.line_total)}</b>
              </div>
            ))}
            <footer>
              <span>
                Paid <b>{money(data.invoice.paid)}</b>
              </span>
              <strong>Balance due {money(data.invoice.balance)}</strong>
            </footer>
          </section>

          <form className="workflow-add-item" onSubmit={add}>
            <input name="description" placeholder="Product/item, e.g. Nationwide delivery" required />
            <input name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" required />
            <input name="unit_price" type="number" step="0.01" placeholder="Price" required />
            <button disabled={saving}>{saving ? "Adding..." : "Add product/item"}</button>
          </form>

          <form className="wizard-form-grid workflow-payment" onSubmit={payment}>
            <label>
              <span>Payment amount</span>
              <input name="amount" type="number" min="0.01" step="0.01" defaultValue={String(data.invoice.balance)} />
            </label>
            <label>
              <span>Payment method</span>
              <select name="method">
                <option>Card</option>
                <option>Cash</option>
                <option>Bank</option>
                <option>Finance</option>
                <option>Part Exchange</option>
                <option>Mixed</option>
              </select>
            </label>
            <label>
              <span>Receipt number</span>
              <input name="receipt_number" />
            </label>
            <label className="full">
              <span>Payment notes</span>
              <textarea name="notes" rows={3} />
            </label>
            <div className="wizard-actions">
              <button type="button" onClick={back}>
                Back
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Saving..." : "Save payment and continue"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

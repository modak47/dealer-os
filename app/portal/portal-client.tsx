"use client";

import { useMemo, useState } from "react";

type PortalValue = string | number | boolean | null | undefined | PortalRecord | PortalRecord[];
interface PortalRecord {
  [key: string]: PortalValue;
}
type PortalData = {
  ok: true;
  customer: { name: string; email: string; phone: string | null; postcode: string | null };
  reservations: PortalRecord[];
  sales: PortalRecord[];
  invoices: PortalRecord[];
  payments: PortalRecord[];
  deliveries: PortalRecord[];
  payment: { configured: boolean; accountName: string; sortCode: string; accountNumber: string; reference: string; instructions: string; wording: string; outstanding: string };
  dealer: { name: string; phone: string; email: string; openingHours: string };
};

const money = (value: unknown) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(value ?? 0) || 0);
const date = (value: unknown) => {
  if (!value) return "-";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const asRecord = (value: PortalValue): PortalRecord | null => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const text = (value: PortalValue) => typeof value === "string" || typeof value === "number" ? String(value) : "";
const bikeName = (record?: PortalRecord) => {
  const bike = asRecord(record?.bike) ?? record;
  return [bike?.year, bike?.make, bike?.model, bike?.variant].filter(Boolean).join(" ") || "Your motorcycle";
};

export function CustomerPortalClient() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<PortalData | null>(null);
  const current = useMemo(() => data?.sales[0] ?? data?.reservations[0] ?? data?.invoices[0], [data]);
  const delivery = data?.deliveries[0];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/customer-portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
      const result = await response.json() as PortalData | { ok: false; error?: string };
      if (!response.ok || !result.ok) throw new Error("error" in result ? result.error || "Unable to access portal." : "Unable to access portal.");
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to access portal.");
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  return <main className="customer-portal">
    <section className="portal-hero"><div><p>YESMOTO CUSTOMER PORTAL</p><h1>Your motorcycle purchase, all in one place.</h1><span>View reservation status, invoices, payment details and delivery updates.</span></div></section>
    {!data ? <form className="portal-login" onSubmit={submit}>
      <h2>Open your portal</h2>
      <p>Enter the email address used for your enquiry or purchase and the portal code supplied by YesMoto.</p>
      <label><span>Email address</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
      <label><span>Portal code</span><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} required /></label>
      {error && <b>{error}</b>}
      <button disabled={busy}>{busy ? "Checking..." : "View my portal"}</button>
    </form> : <section className="portal-dashboard">
      <header><div><span>Welcome</span><h2>{data.customer.name || "Customer"}</h2><p>{data.customer.email}</p></div><button type="button" onClick={() => setData(null)}>Sign out</button></header>
      <div className="portal-kpis">
        <article><span>Status</span><strong>{String(current?.status ?? "In progress")}</strong></article>
        <article><span>Outstanding</span><strong>{data.payment.outstanding}</strong></article>
        <article><span>Invoice</span><strong>{text(data.invoices[0]?.invoice_number) || "Pending"}</strong></article>
        <article><span>Delivery / collection</span><strong>{delivery ? date(delivery.scheduled_at) : "To arrange"}</strong></article>
      </div>
      <div className="portal-grid">
        <section className="portal-bike">
          <div style={{ backgroundImage: `url("${text(asRecord(current?.bike)?.primary_image_url) || text(asRecord(data.invoices[0]?.bike)?.primary_image_url) || "/bike-placeholder.svg"}")` }} />
          <h2>{bikeName(current)}</h2>
          <p>{text(asRecord(current?.bike)?.registration) || text(asRecord(data.invoices[0]?.bike)?.registration) || "Registration pending"}</p>
          <small>{text(asRecord(current?.bike)?.status) || text(current?.status) || "In progress"}</small>
        </section>
        <section>
          <h2>Payment details</h2>
          {data.payment.configured ? <dl><div><dt>Account name</dt><dd>{data.payment.accountName}</dd></div><div><dt>Sort code</dt><dd>{data.payment.sortCode}</dd></div><div><dt>Account number</dt><dd>{data.payment.accountNumber}</dd></div><div><dt>Reference</dt><dd>{data.payment.reference}</dd></div></dl> : <p>Bank details are not configured in the portal yet. Please contact {data.dealer.name}.</p>}
          {data.payment.instructions && <p>{data.payment.instructions}</p>}
        </section>
        <section>
          <h2>Invoices</h2>
          {data.invoices.length ? data.invoices.map(invoice => <PortalRow key={text(invoice.id)} title={text(invoice.invoice_number) || "Invoice"} meta={`${text(invoice.status).replaceAll("_", " ") || "Pending"} - Due ${date(invoice.due_at)}`} value={`${money(invoice.balance)} due`} />) : <p>No invoice has been issued yet.</p>}
        </section>
        <section>
          <h2>Payments received</h2>
          {data.payments.length ? data.payments.map(payment => <PortalRow key={text(payment.id)} title={text(payment.payment_type) || "Payment"} meta={`${text(payment.method) || "Payment"} - ${date(payment.paid_at)}`} value={money(payment.amount)} />) : <p>No payments are recorded yet.</p>}
        </section>
        <section>
          <h2>Delivery and handover</h2>
          {delivery ? <><PortalRow title={text(delivery.delivery_method) || "Collection"} meta={text(delivery.status) || "Pending"} value={date(delivery.scheduled_at)} /><div className="portal-checks">{["identity_checked", "licence_verified", "v5_prepared", "handover_completed", "keys_given", "documents_signed", "hpi_complete"].map(key => <span className={delivery[key] ? "done" : ""} key={key}>{label(key)}</span>)}</div></> : <p>Delivery or collection details will appear here once booked.</p>}
        </section>
        <section>
          <h2>Need help?</h2>
          <p>Contact {data.dealer.name} if anything looks wrong or you need to arrange payment, collection or delivery.</p>
          <dl><div><dt>Phone</dt><dd><a href={`tel:${data.dealer.phone.replace(/\s/g, "")}`}>{data.dealer.phone}</a></dd></div><div><dt>Email</dt><dd><a href={`mailto:${data.dealer.email}`}>{data.dealer.email}</a></dd></div><div><dt>Hours</dt><dd>{data.dealer.openingHours}</dd></div></dl>
        </section>
      </div>
    </section>}
  </main>;
}

function PortalRow({ title, meta, value }: { title: string; meta: string; value: string }) {
  return <article className="portal-row"><div><b>{title}</b><span>{meta}</span></div><strong>{value}</strong></article>;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
}

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
const isUuidLike = (value: string) => /^[a-f0-9-]{24,}$/i.test(value);
const cleanStatus = (value: PortalValue) => (text(value) || "Pending").replaceAll("_", " ");
const isLiveInvoice = (invoice: PortalRecord) => !["cancelled", "canceled", "credited", "void"].includes(text(invoice.status).toLowerCase());
const activeStepFor = (status: string, delivery?: PortalRecord) => {
  const lower = status.toLowerCase();
  if (text(delivery?.status).toLowerCase() === "completed" || lower.includes("completed") || lower === "sold") return 4;
  if (text(delivery?.scheduled_at) || lower.includes("delivery")) return 3;
  if (lower.includes("payment") || lower.includes("sale")) return 2;
  if (lower.includes("reserved") || lower.includes("deposit")) return 1;
  return 0;
};
const bikeName = (record?: PortalRecord) => {
  const bike = asRecord(record?.bike) ?? record;
  const bits = [bike?.year, bike?.make, bike?.model, bike?.variant].map(text).filter(value => value && !isUuidLike(value));
  return bits.join(" ") || "Your motorcycle";
};

export function CustomerPortalClient() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [data, setData] = useState<PortalData | null>(null);
  const liveInvoices = useMemo(() => data?.invoices.filter(isLiveInvoice) ?? [], [data]);
  const current = useMemo(() => data?.sales[0] ?? data?.reservations[0] ?? liveInvoices[0] ?? data?.invoices[0], [data, liveInvoices]);
  const delivery = data?.deliveries[0];
  const status = cleanStatus(current?.status);
  const step = activeStepFor(status, delivery);
  const bike = asRecord(current?.bike) ?? asRecord(liveInvoices[0]?.bike) ?? asRecord(data?.invoices[0]?.bike);
  const hasDeal = Boolean(data && (data.sales.length || data.reservations.length || data.invoices.length));

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

  async function copy(value: string, key: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1400);
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
      {!hasDeal && <section className="portal-empty"><h2>No active motorcycle order yet</h2><p>Your portal is ready. Once a reservation, sale, invoice or delivery is linked to your customer record, the details will appear here.</p></section>}
      <div className="portal-progress">{["Enquiry", "Reserved", "Payment", "Handover booked", "Completed"].map((item, index) => <article className={index <= step ? "done" : ""} key={item}><i>{index + 1}</i><span>{item}</span></article>)}</div>
      <div className="portal-kpis">
        <article><span>Status</span><strong>{status}</strong></article>
        <article><span>Outstanding</span><strong>{data.payment.outstanding}</strong></article>
        <article><span>Active invoice</span><strong>{text(liveInvoices[0]?.invoice_number) || "Pending"}</strong></article>
        <article><span>Delivery / collection</span><strong>{delivery ? date(delivery.scheduled_at) : "To arrange"}</strong></article>
      </div>
      <div className="portal-grid">
        <section className="portal-bike">
          <div style={{ backgroundImage: `url("${text(bike?.primary_image_url) || "/bike-placeholder.svg"}")` }} />
          <h2>{bikeName(current)}</h2>
          <p>{text(bike?.registration) || "Registration pending"}</p>
          <small>{text(bike?.status) || status}</small>
        </section>
        <section>
          <h2>Payment details</h2>
          {data.payment.configured ? <dl><PortalBankRow label="Account name" value={data.payment.accountName} copy={copy} copied={copied} copyKey="account" /><PortalBankRow label="Sort code" value={data.payment.sortCode} copy={copy} copied={copied} copyKey="sort" /><PortalBankRow label="Account number" value={data.payment.accountNumber} copy={copy} copied={copied} copyKey="number" /><PortalBankRow label="Reference" value={data.payment.reference} copy={copy} copied={copied} copyKey="reference" /></dl> : <p>Bank details are not configured in the portal yet. Please contact {data.dealer.name}.</p>}
          {data.payment.configured && <button className="portal-copy-all" type="button" onClick={() => copy(`Account name: ${data.payment.accountName}\nSort code: ${data.payment.sortCode}\nAccount number: ${data.payment.accountNumber}\nReference: ${data.payment.reference}`, "all-bank")}>{copied === "all-bank" ? "Copied bank details" : "Copy all bank details"}</button>}
          {data.payment.instructions && <p>{data.payment.instructions}</p>}
        </section>
        <section>
          <h2>Invoices</h2>
          {data.invoices.length ? data.invoices.map(invoice => <PortalRow key={text(invoice.id)} title={text(invoice.invoice_number) || "Invoice"} meta={`${cleanStatus(invoice.status)} - Due ${date(invoice.due_at)}`} value={`${money(invoice.balance)} due`} muted={!isLiveInvoice(invoice)} />) : <p>No invoice has been issued yet.</p>}
        </section>
        <section>
          <h2>Payments received</h2>
          {data.payments.length ? data.payments.map(payment => <PortalRow key={text(payment.id)} title={text(payment.payment_type) || "Payment"} meta={`${text(payment.method) || "Payment"} - ${date(payment.paid_at)}`} value={money(payment.amount)} />) : <p>No payments are recorded yet.</p>}
        </section>
        <section>
          <h2>Delivery and handover</h2>
          {delivery ? <><PortalRow title={text(delivery.delivery_method) || "Collection"} meta={cleanStatus(delivery.status)} value={date(delivery.scheduled_at)} /><div className="portal-checks">{["identity_checked", "licence_verified", "v5_prepared", "handover_completed", "keys_given", "documents_signed", "hpi_complete"].map(key => <span className={delivery[key] ? "done" : ""} key={key}>{label(key)}</span>)}</div></> : <p>Delivery or collection details will appear here once booked.</p>}
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

function PortalBankRow({ label, value, copy, copied, copyKey }: { label: string; value: string; copy: (value: string, key: string) => void; copied: string; copyKey: string }) {
  return <div><dt>{label}</dt><dd>{value}<button type="button" onClick={() => copy(value, copyKey)}>{copied === copyKey ? "Copied" : "Copy"}</button></dd></div>;
}

function PortalRow({ title, meta, value, muted = false }: { title: string; meta: string; value: string; muted?: boolean }) {
  return <article className={`portal-row ${muted ? "muted" : ""}`}><div><b>{title}</b><span>{meta}</span></div><strong>{value}</strong></article>;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
}

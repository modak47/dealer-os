"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  documents: PortalRecord[];
  payment: { configured: boolean; accountName: string; sortCode: string; accountNumber: string; reference: string; instructions: string; wording: string; outstanding: string };
  dealer: { name: string; phone: string; email: string; openingHours: string };
};
type PortalTab = "invoices" | "payments" | "handover" | "documents";

const money = (value: unknown) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(value ?? 0) || 0);
const date = (value: unknown) => {
  if (!value) return "-";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const asRecord = (value: PortalValue): PortalRecord | null => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const text = (value: PortalValue) => typeof value === "string" || typeof value === "number" ? String(value) : "";
const isUuidLike = (value: string) => /^[a-f0-9-]{24,}$/i.test(value);
const portalSessionKey = "yesmoto-customer-portal-session";
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
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [downloadBusy, setDownloadBusy] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [documentType, setDocumentType] = useState("licence");
  const [file, setFile] = useState<File | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [signature, setSignature] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [data, setData] = useState<PortalData | null>(null);
  const [activeTab, setActiveTab] = useState<PortalTab>("handover");
  const liveInvoices = useMemo(() => data?.invoices.filter(isLiveInvoice) ?? [], [data]);
  const current = useMemo(() => data?.sales[0] ?? data?.reservations[0] ?? liveInvoices[0] ?? data?.invoices[0], [data, liveInvoices]);
  const delivery = data?.deliveries[0];
  const status = cleanStatus(current?.status);
  const step = activeStepFor(status, delivery);
  const bike = asRecord(current?.bike) ?? asRecord(liveInvoices[0]?.bike) ?? asRecord(data?.invoices[0]?.bike);
  const hasDeal = Boolean(data && (data.sales.length || data.reservations.length || data.invoices.length));

  useEffect(() => {
    const saved = window.sessionStorage.getItem(portalSessionKey);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { email?: string; code?: string };
      if (parsed.email && parsed.code) void openPortal(parsed.email, parsed.code, true);
    } catch {
      window.sessionStorage.removeItem(portalSessionKey);
    }
  }, []);

  async function openPortal(nextEmail: string, nextCode: string, restoring = false) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/customer-portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: nextEmail, code: nextCode }) });
      const result = await response.json() as PortalData | { ok: false; error?: string };
      if (!response.ok || !result.ok) throw new Error("error" in result ? result.error || "Unable to access portal." : "Unable to access portal.");
      setData(result);
      setEmail(nextEmail);
      setCode(nextCode);
      window.sessionStorage.setItem(portalSessionKey, JSON.stringify({ email: nextEmail, code: nextCode }));
    } catch (caught) {
      setError(restoring ? "" : caught instanceof Error ? caught.message : "Unable to access portal.");
      setData(null);
      window.sessionStorage.removeItem(portalSessionKey);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await openPortal(email, code);
  }

  function signOut() {
    window.sessionStorage.removeItem(portalSessionKey);
    setData(null);
    setCode("");
  }

  async function copy(value: string, key: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1400);
  }

  async function refreshPortal() {
    if (email && code) await openPortal(email, code, true);
  }

  async function downloadInvoice(invoice: PortalRecord) {
    const id = text(invoice.id);
    if (!id || downloadBusy) return;
    setDownloadBusy(id);
    setActionError("");
    try {
      const response = await fetch(`/api/customer-portal/invoices/${id}/pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
      if (!response.ok) throw new Error("Unable to download this invoice.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${text(invoice.invoice_number) || "invoice"}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to download this invoice.");
    } finally {
      setDownloadBusy("");
    }
  }

  async function uploadDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!file || uploadBusy) return;
    setUploadBusy(true);
    setNotice("");
    setActionError("");
    try {
      const form = new FormData();
      form.set("email", email);
      form.set("code", code);
      form.set("document_type", documentType);
      form.set("file", file);
      const response = await fetch("/api/customer-portal/documents", { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to upload document.");
      setFile(null);
      setNotice("Document uploaded.");
      await refreshPortal();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to upload document.");
    } finally {
      setUploadBusy(false);
    }
  }

  async function confirmDelivery() {
    const deliveryId = text(delivery?.id);
    if (!deliveryId || confirmBusy) return;
    setConfirmBusy(true);
    setNotice("");
    setActionError("");
    try {
      const response = await fetch("/api/customer-portal/delivery-confirmation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code, delivery_id: deliveryId, name: signatureName, signature }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to confirm delivery.");
      setNotice("Delivery confirmation saved.");
      await refreshPortal();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to confirm delivery.");
    } finally {
      setConfirmBusy(false);
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
      <div className="portal-account-head"><div><span>Welcome</span><h2>{data.customer.name || "Customer"}</h2><p>{data.customer.email}</p></div><button type="button" onClick={signOut}>Sign out</button></div>
      {!hasDeal && <section className="portal-empty"><h2>No active motorcycle order yet</h2><p>Your portal is ready. Once a reservation, sale, invoice or delivery is linked to your customer record, the details will appear here.</p></section>}
      <div className="portal-progress">{["Enquiry", "Reserved", "Payment", "Handover booked", "Completed"].map((item, index) => <article className={index <= step ? "done" : ""} key={item}><i>{index + 1}</i><span>{item}</span></article>)}</div>
      <div className="portal-kpis">
        <article><span>Status</span><strong>{status}</strong></article>
        <article><span>Outstanding</span><strong>{data.payment.outstanding}</strong></article>
        <article><span>Active invoice</span><strong>{text(liveInvoices[0]?.invoice_number) || "Pending"}</strong></article>
        <article><span>Delivery / collection</span><strong>{delivery ? date(delivery.scheduled_at) : "To arrange"}</strong></article>
      </div>
      {(notice || actionError) && <div className={`portal-message ${actionError ? "error" : ""}`}>{actionError || notice}</div>}
      <div className="portal-overview">
        <section className="portal-bike">
          <div style={{ backgroundImage: `url("${text(bike?.primary_image_url) || "/bike-placeholder.svg"}")` }} />
          <h2>{bikeName(current)}</h2>
          <p>{text(bike?.registration) || "Registration pending"}</p>
          <small>{text(bike?.status) || status}</small>
        </section>
        <section className="portal-payment-card">
          <h2>Payment details</h2>
          {data.payment.configured ? <dl><PortalBankRow label="Account name" value={data.payment.accountName} copy={copy} copied={copied} copyKey="account" /><PortalBankRow label="Sort code" value={data.payment.sortCode} copy={copy} copied={copied} copyKey="sort" /><PortalBankRow label="Account number" value={data.payment.accountNumber} copy={copy} copied={copied} copyKey="number" /><PortalBankRow label="Reference" value={data.payment.reference} copy={copy} copied={copied} copyKey="reference" /></dl> : <p>Bank details are not configured in the portal yet. Please contact {data.dealer.name}.</p>}
          {data.payment.configured && <button className="portal-copy-all" type="button" onClick={() => copy(`Account name: ${data.payment.accountName}\nSort code: ${data.payment.sortCode}\nAccount number: ${data.payment.accountNumber}\nReference: ${data.payment.reference}`, "all-bank")}>{copied === "all-bank" ? "Copied bank details" : "Copy all bank details"}</button>}
          {data.payment.instructions && <p>{data.payment.instructions}</p>}
        </section>
      </div>
      <div className="portal-workspace">
        <nav className="portal-tabs" aria-label="Portal sections">
          {([
            ["handover", "Handover"],
            ["documents", "Documents"],
            ["invoices", "Invoices"],
            ["payments", "Payments"],
          ] as [PortalTab, string][]).map(([key, label]) => <button type="button" className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)} key={key}>{label}</button>)}
        </nav>
        <section className="portal-tab-panel">
        {activeTab === "invoices" && <>
          <h2>Invoices</h2>
          {data.invoices.length ? data.invoices.map(invoice => <PortalRow key={text(invoice.id)} title={text(invoice.invoice_number) || "Invoice"} meta={`${cleanStatus(invoice.status)} - Due ${date(invoice.due_at)}`} value={`${money(invoice.balance)} due`} muted={!isLiveInvoice(invoice)} action={<button type="button" onClick={() => void downloadInvoice(invoice)} disabled={downloadBusy === text(invoice.id)}>{downloadBusy === text(invoice.id) ? "Preparing..." : "PDF"}</button>} />) : <p>No invoice has been issued yet.</p>}
        </>}
        {activeTab === "payments" && <>
          <h2>Payments received</h2>
          {data.payments.length ? data.payments.map(payment => <PortalRow key={text(payment.id)} title={text(payment.payment_type) || "Payment"} meta={`${text(payment.method) || "Payment"} - ${date(payment.paid_at)}`} value={money(payment.amount)} />) : <p>No payments are recorded yet.</p>}
        </>}
        {activeTab === "handover" && <>
          <h2>Delivery and handover</h2>
          {delivery ? <><PortalRow title={text(delivery.delivery_method) || "Collection"} meta={cleanStatus(delivery.status)} value={date(delivery.scheduled_at)} /><div className="portal-checks">{["identity_checked", "licence_verified", "v5_prepared", "handover_completed", "keys_given", "documents_signed", "hpi_complete"].map(key => <span className={delivery[key] ? "done" : ""} key={key}>{label(key)}</span>)}</div>{delivery.customer_confirmed_at ? <p className="portal-confirmed">Confirmed by {text(delivery.customer_signature_name) || "customer"} on {date(delivery.customer_confirmed_at)}</p> : <div className="portal-signature"><label><span>Your name</span><input value={signatureName} onChange={event => setSignatureName(event.target.value)} /></label><SignaturePad onChange={setSignature} /><button type="button" onClick={() => void confirmDelivery()} disabled={confirmBusy || !signatureName || !signature}>{confirmBusy ? "Saving..." : "Confirm handover"}</button></div>}</> : <p>Delivery or collection details will appear here once booked.</p>}
        </>}
        {activeTab === "documents" && <>
          <h2>Documents</h2>
          <form className="portal-upload" onSubmit={uploadDocument}>
            <select value={documentType} onChange={event => setDocumentType(event.target.value)}><option value="licence">Driving licence</option><option value="proof_of_address">Proof of address</option><option value="finance_document">Finance document</option><option value="other">Other document</option></select>
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={event => setFile(event.target.files?.[0] || null)} />
            <button disabled={!file || uploadBusy}>{uploadBusy ? "Uploading..." : "Upload document"}</button>
          </form>
          {data.documents.length ? <div className="portal-documents">{data.documents.map(document => <article key={text(document.id)}><b>{label(text(document.document_type) || "document")}</b><span>{text(document.file_name)}</span><small>{date(document.created_at)}</small></article>)}</div> : <p>No documents uploaded yet.</p>}
        </>}
        <section>
          <h2>Quick actions</h2>
          <div className="portal-quick-actions"><button type="button" onClick={() => setActiveTab("documents")}>Upload documents</button><button type="button" onClick={() => setActiveTab("handover")}>Confirm handover</button>{liveInvoices[0] && <button type="button" onClick={() => void downloadInvoice(liveInvoices[0])}>Download invoice PDF</button>}</div>
        </section>
        </section>
      </div>
      <PortalHelp dealer={data.dealer} />
    </section>}
  </main>;
}

function PortalHelp({ dealer }: { dealer: PortalData["dealer"] }) {
  return <section className="portal-help-card">
    <h2>Need help?</h2>
    <p>Contact {dealer.name} if anything looks wrong or you need to arrange payment, collection or delivery.</p>
    <dl><div><dt>Phone</dt><dd><a href={`tel:${dealer.phone.replace(/\s/g, "")}`}>{dealer.phone}</a></dd></div><div><dt>Email</dt><dd><a href={`mailto:${dealer.email}`}>{dealer.email}</a></dd></div><div><dt>Hours</dt><dd>{dealer.openingHours}</dd></div></dl>
  </section>;
}

function PortalBankRow({ label, value, copy, copied, copyKey }: { label: string; value: string; copy: (value: string, key: string) => void; copied: string; copyKey: string }) {
  return <div><dt>{label}</dt><dd>{value}<button type="button" onClick={() => copy(value, copyKey)}>{copied === copyKey ? "Copied" : "Copy"}</button></dd></div>;
}

function PortalRow({ title, meta, value, muted = false, action }: { title: string; meta: string; value: string; muted?: boolean; action?: React.ReactNode }) {
  return <article className={`portal-row ${muted ? "muted" : ""}`}><div><b>{title}</b><span>{meta}</span></div><strong>{value}</strong>{action}</article>;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
}

function SignaturePad({ onChange }: { onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(rect.height * window.devicePixelRatio));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#f5f8f6";
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    onChange(canvasRef.current?.toDataURL("image/png") || "");
  }

  function end() {
    drawing.current = false;
    onChange(canvasRef.current?.toDataURL("image/png") || "");
  }

  function clear() {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    canvas?.getContext("2d")?.clearRect(0, 0, rect?.width ?? 0, rect?.height ?? 0);
    onChange("");
  }

  return <div><span>Signature</span><canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} /><button type="button" onClick={clear}>Clear signature</button></div>;
}

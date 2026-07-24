"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";
import type { VehicleWorkspaceData } from "@/lib/vehicle-workspace";
import { STOCK_STATUS, lifecycleRank } from "@/lib/statuses";

type Props = {
  bike: SupabaseStockBike;
  workspace: VehicleWorkspaceData;
};

type Tab = "overview" | "advert" | "sale" | "invoice" | "workflow" | "history";
type PendingAction = "cancelReservation" | "cancelSale" | "reopenSale" | null;

export function VehicleWorkspace({ bike, workspace }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [deposit, setDeposit] = useState("");
  const [salePrice, setSalePrice] = useState(String(bike.price ?? ""));
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");

  const activeReservation = workspace.activeReservation;
  const activeSale = workspace.activeSale;
  const latestInvoice = workspace.invoices[0];
  const latestDelivery = workspace.deliveries[0];
  const selectedCustomer = workspace.customers.find(customer => customer.id === customerId);
  const progress = lifecycleRank(activeSale?.status ?? bike.status);
  const isComplete = [STOCK_STATUS.SALE_COMPLETED, "Completed"].includes(String(activeSale?.status ?? bike.status));
  const advertRows = advertStatusRows(bike);

  const kpis = useMemo(() => [
    ["Status", String(activeSale?.status ?? bike.status ?? "Unknown")],
    ["Customer", customerName(activeSale ?? activeReservation) || customerNameFromSelect(selectedCustomer) || "-"],
    ["Invoice", latestInvoice ? `${latestInvoice.invoice_number ?? "Invoice"} - ${money(latestInvoice.balance)} due` : "Not created"],
    ["Payments", money(workspace.payments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0))],
  ], [activeReservation, activeSale, bike.status, latestInvoice, selectedCustomer, workspace.payments]);

  async function run(action: string, payload: Record<string, unknown> = {}) {
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch(`/api/stock/${bike.id}/workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json() as { error?: string; saleId?: string; invoiceId?: string };
      if (!response.ok) throw new Error(result.error || "Unable to update vehicle workflow.");
      setMessage("Workflow updated.");
      setPending(null);
      setReason("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update vehicle workflow.");
    } finally {
      setBusy("");
    }
  }

  const canReserve = !activeReservation && !activeSale && ["In Stock", "On Forecourt", "Available", "Prep"].includes(String(bike.status ?? ""));
  const canStartSale = !activeReservation && !activeSale && !isComplete && ["In Stock", "On Forecourt", "Available", "Prep"].includes(String(bike.status ?? ""));

  return <div className="admin-page dms-vehicle-workspace">
    <header className="dms-vehicle-hero">
      <div className="dms-vehicle-hero-media" style={{ backgroundImage: `url("${bike.primary_image_url || "/bike-placeholder.svg"}")` }} />
      <div>
        <Link href="/admin/stock" className="dms-vehicle-back">Back to Stock</Link>
        <h1>{[bike.year, bike.make, bike.model, bike.variant].filter(Boolean).join(" ") || "Motorcycle"}</h1>
        <p>{bike.registration || "Registration pending"} - {bike.stock_number || `Stock #${bike.id}`}</p>
        <div className="dms-vehicle-stage">
          {["In Stock", "Reserved", "Sale Pending", "Sold", "Sale Completed"].map((stage, index) => <span className={index <= progress ? "done" : ""} key={stage}>{stage}</span>)}
        </div>
      </div>
      <nav>
        {bike.show_on_website && <Link href={`/used-bikes/${bike.id}`} target="_blank">View Advert</Link>}
        <Link href={`/admin/stock/${bike.id}?edit=1`}>Edit Advert</Link>
        <Link href={`/admin/stock/${bike.id}?edit=1`}>Edit Stock</Link>
        <Link href={`/admin/stock/${bike.id}/pdi`}>PDI</Link>
        <Link href={`/admin/stock-ledger/${bike.id}`}>Stock Ledger</Link>
        {activeSale && <Link href={`/admin/sales/${activeSale.id}`}>Open Sale</Link>}
        {latestInvoice && <Link href={`/admin/accounts/invoices/${latestInvoice.id}/document`} target="_blank">Open Invoice</Link>}
      </nav>
    </header>

    {!workspace.migrationReady && <p className="dms-vehicle-warning">Run migration 20260713000200_joined_vehicle_dms_workflow.sql to enable vehicle history and workflow actions.</p>}
    {message && <p className={message === "Workflow updated." ? "stock-save-message success" : "stock-save-message"}>{message}</p>}

    <section className="dms-vehicle-kpis">
      {kpis.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
    </section>

    <nav className="dms-vehicle-tabs">
      {(["overview", "advert", "sale", "invoice", "workflow", "history"] as Tab[]).map(value => <button type="button" className={tab === value ? "active" : ""} onClick={() => setTab(value)} key={value}>{label(value)}</button>)}
    </nav>

    {tab === "overview" && <section className="dms-vehicle-grid">
      <ActionPanel title="Reserve Bike" disabled={!canReserve} disabledText="Bike is not available to reserve">
        <CustomerPicker customers={workspace.customers} value={customerId} onChange={setCustomerId} />
        <Field label="Deposit" value={deposit} onChange={setDeposit} type="number" />
        <button disabled={!customerId || busy === "reserve" || !canReserve} onClick={() => void run("reserve", { customer_id: customerId, deposit_amount: Number(deposit) || 0 })}>{busy === "reserve" ? "Reserving..." : "Reserve Bike"}</button>
      </ActionPanel>
      <ActionPanel title="Start Sale" disabled={!canStartSale} disabledText="Bike already has an active sale">
        <CustomerPicker customers={workspace.customers} value={customerId} onChange={setCustomerId} />
        <Field label="Sale price" value={salePrice} onChange={setSalePrice} type="number" />
        <Field label="Deposit" value={deposit} onChange={setDeposit} type="number" />
        <button disabled={!customerId || busy === "startSale" || !canStartSale} onClick={() => void run("startSale", { customer_id: customerId, sale_price: Number(salePrice) || null, deposit_amount: Number(deposit) || 0 })}>{busy === "startSale" ? "Starting..." : "Start Sale"}</button>
      </ActionPanel>
      <StatusPanel title="Current Reservation" rows={activeReservation ? reservationRows(activeReservation) : [["Reservation", "None active"]]} />
      <StatusPanel title="Current Sale" rows={activeSale ? saleRows(activeSale) : [["Sale", "None active"]]} />
    </section>}

    {tab === "advert" && <section className="dms-vehicle-grid">
      <section className="dms-vehicle-card dms-advert-card">
        <h2>Advert Control</h2>
        <p>{bike.show_on_website ? "This bike is published on the customer-facing website." : "This bike is currently hidden from the customer-facing website."}</p>
        <div className="dms-vehicle-actions">
          {bike.show_on_website && <Link href={`/used-bikes/${bike.id}`} target="_blank">View Live Advert</Link>}
          <Link href={`/admin/stock/${bike.id}?edit=1`}>Edit Advert Content</Link>
          <Link href={`/admin/settings?section=advert-templates`}>Advert Templates</Link>
        </div>
      </section>
      <StatusPanel title="Advert Readiness" rows={advertRows} />
      <StatusPanel title="Bike Details" rows={bikeDetailRows(bike)} />
      <StatusPanel title="Preparation" rows={prepRows(bike)} />
    </section>}

    {tab === "sale" && <section className="dms-vehicle-grid">
      <ActionPanel title="Sale Actions" disabled={!activeSale} disabledText="No active sale for this bike">
        {activeReservation && !activeSale && <button disabled={busy === "convertReservation"} onClick={() => void run("convertReservation", { reservation_id: activeReservation.id })}>{busy === "convertReservation" ? "Creating..." : "Convert Reservation to Sale"}</button>}
        {activeSale && <button disabled={busy === "markSold" || String(activeSale.status) === "Sold"} onClick={() => void run("markSold", { sale_id: activeSale.id })}>{busy === "markSold" ? "Saving..." : "Mark Sold"}</button>}
        {activeSale && <button disabled={busy === "completeSale"} onClick={() => void run("completeSale", { sale_id: activeSale.id })}>{busy === "completeSale" ? "Completing..." : "Complete Sale"}</button>}
        {activeSale && <button className="danger" onClick={() => setPending("cancelSale")}>Cancel Sale</button>}
        {(isComplete || String(activeSale?.status) === "Sold") && activeSale && <button onClick={() => setPending("reopenSale")}>Reopen Sale</button>}
      </ActionPanel>
      <StatusPanel title="Delivery Checklist" rows={deliveryRows(latestDelivery)} />
      <RecordList title="Sales" records={workspace.sales} type="sale" />
    </section>}

    {tab === "invoice" && <section className="dms-vehicle-grid">
      <RecordList title="Invoices" records={workspace.invoices} type="invoice" />
      <RecordList title="Payments" records={workspace.payments} type="payment" />
    </section>}

    {tab === "workflow" && <section className="dms-vehicle-grid">
      <ActionPanel title="Reservation Actions" disabled={!activeReservation} disabledText="No active reservation">
        {activeReservation && <button className="danger" onClick={() => setPending("cancelReservation")}>Cancel Reservation</button>}
        {activeReservation && !activeSale && <button disabled={busy === "convertReservation"} onClick={() => void run("convertReservation", { reservation_id: activeReservation.id })}>Convert to Sale Pending</button>}
      </ActionPanel>
      <RecordList title="Prep Tasks" records={workspace.tasks} type="task" />
    </section>}

    {tab === "history" && <Timeline records={workspace.activity} />}

    {pending && <div className="dms-vehicle-modal">
      <form onSubmit={event => { event.preventDefault(); const payload = pending === "cancelReservation" ? { reservation_id: activeReservation?.id, reason } : { sale_id: activeSale?.id, reason }; void run(pending, payload); }}>
        <h2>{pendingLabel(pending)}</h2>
        <p>This will update stock, sale, invoice and history records together.</p>
        <label><span>Reason</span><textarea value={reason} onChange={event => setReason(event.target.value)} required /></label>
        <footer><button type="button" onClick={() => setPending(null)}>Close</button><button className="danger" disabled={busy === pending}>{busy === pending ? "Saving..." : "Confirm"}</button></footer>
      </form>
    </div>}
  </div>;
}

function ActionPanel({ title, disabled, disabledText, children }: { title: string; disabled?: boolean; disabledText?: string; children: React.ReactNode }) {
  return <section className={`dms-vehicle-card ${disabled ? "muted" : ""}`}><h2>{title}</h2>{disabled && <p>{disabledText}</p>}{children}</section>;
}

function StatusPanel({ title, rows }: { title: string; rows: string[][] }) {
  return <section className="dms-vehicle-card"><h2>{title}</h2><dl>{rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></section>;
}

function RecordList({ title, records, type }: { title: string; records: Record<string, unknown>[]; type: "sale" | "invoice" | "payment" | "task" }) {
  return <section className="dms-vehicle-card"><h2>{title}</h2>{records.length ? <div className="dms-vehicle-records">{records.map(record => <article key={String(record.id)}><b>{recordTitle(record, type)}</b><span>{recordSub(record, type)}</span>{recordLink(record, type)}</article>)}</div> : <p>No records yet.</p>}</section>;
}

function Timeline({ records }: { records: Record<string, unknown>[] }) {
  return <section className="dms-vehicle-card dms-vehicle-history"><h2>Vehicle History</h2>{records.length ? records.map(record => <article key={String(record.id)}><i /><div><span>{date(record.created_at)}</span><b>{String(record.description ?? record.event_type ?? "Event")}</b><p>{String(record.event_type ?? "")}</p></div></article>) : <p>No history events yet.</p>}</section>;
}

function CustomerPicker({ customers, value, onChange }: { customers: VehicleWorkspaceData["customers"]; value: string; onChange: (value: string) => void }) {
  return <label><span>Customer</span><select value={value} onChange={event => onChange(event.target.value)}><option value="">Select customer</option>{customers.map(customer => <option value={customer.id} key={customer.id}>{customerNameFromSelect(customer)} · {customer.email || customer.phone || customer.id}</option>)}</select></label>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label><span>{label}</span><input type={type} value={value} onChange={event => onChange(event.target.value)} /></label>;
}

function label(tab: Tab) {
  return ({ overview: "Overview", advert: "Advert", sale: "Sale", invoice: "Invoices", workflow: "Workflow", history: "History" } as Record<Tab, string>)[tab];
}

function pendingLabel(action: Exclude<PendingAction, null>) {
  return action === "cancelReservation" ? "Cancel Reservation" : action === "cancelSale" ? "Cancel Sale" : "Reopen Sale";
}

function customerName(record: Record<string, unknown> | null | undefined) {
  const customer = record?.customer as { first_name?: string | null; last_name?: string | null } | null | undefined;
  return [customer?.first_name, customer?.last_name].filter(Boolean).join(" ");
}

function customerNameFromSelect(customer?: VehicleWorkspaceData["customers"][number]) {
  return [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Customer";
}

function reservationRows(record: Record<string, unknown>) {
  return [["Status", String(record.status ?? "-")], ["Customer", customerName(record)], ["Deposit", money(record.deposit_amount)], ["Expires", date(record.expires_at)]];
}

function saleRows(record: Record<string, unknown>) {
  return [["Status", String(record.status ?? "-")], ["Customer", customerName(record)], ["Sale price", money(record.sale_price)], ["Balance", money(record.balance_due)]];
}

function deliveryRows(record?: Record<string, unknown>) {
  if (!record) return [["Delivery", "Not created"]];
  const checks = ["identity_checked", "licence_verified", "v5_prepared", "handover_completed", "keys_given", "documents_signed", "hpi_complete"].filter(key => Boolean(record[key])).length;
  return [["Status", String(record.status ?? "-")], ["Scheduled", date(record.scheduled_at)], ["Checklist", `${checks}/7 complete`]];
}

function yesNo(value: unknown) {
  return value ? "Yes" : "No";
}

function advertStatusRows(bike: SupabaseStockBike) {
  const sections = Object.entries(bike.advert_sections ?? {}).filter(([key, value]) => key !== "__meta" && String(value ?? "").trim());
  return [
    ["Website live", yesNo(bike.show_on_website)],
    ["Reserve online", yesNo(bike.reserve_enabled)],
    ["Retail price", money(bike.price)],
    ["Photos", `${bike.image_urls?.length || (bike.primary_image_url ? 1 : 0)} image${(bike.image_urls?.length || (bike.primary_image_url ? 1 : 0)) === 1 ? "" : "s"}`],
    ["Advert title", bike.advert_title || [bike.year, bike.make, bike.model].filter(Boolean).join(" ") || "-"],
    ["Advert sections", `${sections.length} populated`],
  ];
}

function bikeDetailRows(bike: SupabaseStockBike) {
  return [
    ["Registration", bike.registration || "-"],
    ["Mileage", bike.mileage ? `${Number(bike.mileage).toLocaleString("en-GB")} miles` : "-"],
    ["Colour", bike.colour || "-"],
    ["Engine", bike.engine_cc ? `${bike.engine_cc} cc` : "-"],
    ["MOT", bike.mot_expiry ? date(bike.mot_expiry) : bike.mot_status || "-"],
    ["HPI category", bike.hpi_category || "-"],
  ];
}

function prepRows(bike: SupabaseStockBike) {
  return [
    ["Workshop", bike.workshop_status || "-"],
    ["Valeting", bike.valeting_status || "-"],
    ["Photography", bike.photo_status || "-"],
    ["V5 received", yesNo(bike.v5_received)],
    ["Service history", yesNo(bike.service_history_received)],
    ["HPI complete", yesNo(bike.hpi_completed)],
  ];
}

function recordTitle(record: Record<string, unknown>, type: string) {
  if (type === "invoice") return String(record.invoice_number ?? "Invoice");
  if (type === "payment") return `${String(record.payment_type ?? "Payment")} · ${money(record.amount)}`;
  if (type === "task") return String(record.title ?? record.task_type ?? "Workflow task");
  return `${String(record.status ?? "Sale")} · ${money(record.sale_price)}`;
}

function recordSub(record: Record<string, unknown>, type: string) {
  if (type === "invoice") return `${String(record.status ?? "-")} · ${money(record.balance)} due`;
  if (type === "payment") return `${String(record.method ?? "-")} · ${date(record.paid_at)}`;
  if (type === "task") return `${String(record.status ?? "-")} · ${date(record.due_at)}`;
  return `${String(record.payment_status ?? "-")} · ${date(record.created_at)}`;
}

function recordLink(record: Record<string, unknown>, type: string) {
  if (type === "invoice") return <Link href={`/admin/accounts/invoices/${record.id}/document`} target="_blank">View</Link>;
  if (type === "sale") return <Link href={`/admin/sales/${record.id}`}>View</Link>;
  return null;
}

function date(value: unknown) {
  if (!value) return "-";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString("en-GB");
}

function money(value: unknown) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number.isFinite(number) ? number : 0);
}


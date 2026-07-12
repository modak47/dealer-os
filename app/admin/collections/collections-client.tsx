"use client";

import { FormEvent, useMemo, useState } from "react";

type Staff = { id: string; full_name: string | null; role?: string | null; phone?: string | null };
type Stock = { id: number; stock_number?: string | null; registration?: string | null; make?: string | null; model?: string | null; variant?: string | null; year?: number | null; customer_name?: string | null; customer_phone?: string | null; customer_email?: string | null; customer_address?: string | null; customer_postcode?: string | null; collection_address?: string | null; collection_postcode?: string | null; purchase_price?: number | null; deposit_paid?: number | null; balance_outstanding?: number | null; expected_arrival_date?: string | null; mileage?: number | null; status?: string | null };
type Collection = Record<string, unknown> & { id: string; stock_bike_id: number; collection_type: string; collection_status: string; scheduled_date?: string | null; scheduled_start_time?: string | null; scheduled_end_time?: string | null; time_window_text?: string | null; assigned_user_id?: string | null; assigned_driver_name?: string | null; assigned_driver_phone?: string | null; collection_address?: string | null; collection_postcode?: string | null; approximate_distance_miles?: number | null; estimated_drive_minutes?: number | null; estimated_collection_cost?: number | null; actual_collection_cost?: number | null; payment_method?: string | null; payment_status?: string | null; deposit_paid?: number | null; balance_due?: number | null; balance_paid?: number | null; final_purchase_price?: number | null; customer_confirmed?: boolean; confirmation_message?: string | null; stock?: Stock | null; assigned_user?: Staff | null };
type Data = { migrationReady: boolean; collections: Collection[]; unscheduled: Stock[]; staff: Staff[]; kpis: Record<string, number> };

const views = [["today", "Today"], ["tomorrow", "Tomorrow"], ["week", "This Week"], ["unscheduled", "Unscheduled"], ["upcoming", "Upcoming"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["all", "All Collections"]];
const typeLabels: Record<string, string> = { customer_collection: "Customer Collection", customer_dropoff: "Customer Drop-off", transporter_collection: "Transporter Collection", dealer_collection: "Dealer Collection", other: "Other" };
const statusLabels: Record<string, string> = { not_scheduled: "Not Scheduled", scheduled: "Scheduled", confirmed: "Confirmed", en_route: "Driver En Route", arrived: "Arrived", collected: "Bike Collected", received: "Bike Received", cancelled: "Cancelled", failed: "Failed Collection", reschedule_required: "Reschedule Required" };
const nextActions: Record<string, [string, string][]> = {
  not_scheduled: [["scheduled", "Schedule"]],
  scheduled: [["confirmed", "Confirm"], ["reschedule_required", "Reschedule"], ["cancelled", "Cancel"]],
  confirmed: [["en_route", "Mark En Route"], ["reschedule_required", "Reschedule"], ["cancelled", "Cancel"]],
  en_route: [["arrived", "Mark Arrived"], ["failed", "Fail Collection"]],
  arrived: [["collected", "Mark Bike Collected"], ["failed", "Fail Collection"]],
  collected: [["received", "Mark Bike Received"]],
  cancelled: [["reschedule_required", "Reopen"]],
  failed: [["reschedule_required", "Reschedule"]],
  reschedule_required: [["scheduled", "Schedule"], ["cancelled", "Cancel"]],
};

export function CollectionsClient({ initial, initialView, initialStockId = "", initialAssigned = "all", driverMode }: { initial: Data; initialView: string; initialStockId?: string; initialAssigned?: string; driverMode: boolean }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState(initialView);
  const [assigned, setAssigned] = useState(initialAssigned);
  const [modal, setModal] = useState<{ stock?: Stock; collection?: Collection } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  async function load(nextView = view, nextAssigned = assigned) {
    const params = new URLSearchParams({ view: nextView, assigned: nextAssigned });
    if (initialStockId) params.set("stockId", initialStockId);
    const response = await fetch(`/api/collections?${params}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load collections.");
    setData(payload);
  }

  async function changeView(next: string) {
    setView(next);
    setError("");
    await load(next, assigned).catch(caught => setError(caught instanceof Error ? caught.message : "Unable to load view."));
  }

  async function transition(collection: Collection, status: string) {
    setBusy(`${collection.id}-${status}`);
    setError("");
    const extra: Record<string, unknown> = {};
    if (status === "cancelled") extra.cancellation_reason = "Cancelled from planner";
    if (status === "failed") extra.failure_reason = "Failed from planner";
    if (status === "collected") extra.financial_override = collection.payment_status !== "paid" && collection.payment_status !== "not_required";
    const response = await fetch(`/api/collections/${collection.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "transition", status, ...extra }) });
    const payload = await response.json();
    setBusy("");
    if (!response.ok) return setError(payload.error || "Unable to update collection.");
    setWarnings(payload.warnings || []);
    await load();
  }

  const filteredCollections = useMemo(() => data.collections, [data.collections]);

  return <div className={driverMode ? "collection-planner driver" : "collection-planner"}>
    {!driverMode && <div className="collection-kpis">{Object.entries(kpiLabels).map(([key, label]) => <article key={key}><span>{label}</span><strong>{moneyOrNumber(key, data.kpis[key])}</strong></article>)}</div>}
    <div className="collection-toolbar">
      {!driverMode && <div>{views.map(([key, label]) => <button className={view === key ? "active" : ""} type="button" onClick={() => void changeView(key)} key={key}>{label}</button>)}</div>}
      {!driverMode && <select value={assigned} onChange={event => { setAssigned(event.target.value); void load(view, event.target.value); }}><option value="all">All staff</option><option value="unassigned">Unassigned</option>{data.staff.map(user => <option value={user.id} key={user.id}>{user.full_name || "Staff member"}</option>)}</select>}
    </div>
    {error && <p className="invoice-error">{error}</p>}
    {warnings.map(warning => <p className="collection-warning" key={warning}>{warning}</p>)}
    {!driverMode && data.unscheduled.length > 0 && <section className="collection-unscheduled"><header><h2>Unscheduled Purchases</h2><span>{data.unscheduled.length}</span></header><div>{data.unscheduled.map(stock => <StockCard stock={stock} schedule={() => setModal({ stock })} key={stock.id} />)}</div></section>}
    <section className="collection-list">
      {filteredCollections.map(collection => <CollectionCard collection={collection} staff={data.staff} driverMode={driverMode} busy={busy} transition={transition} edit={() => setModal({ collection })} key={collection.id} />)}
      {!filteredCollections.length && <div className="crm-empty"><b>No collections here.</b><span>Scheduled Purchase Pending collections will appear in this view.</span></div>}
    </section>
    {modal && <CollectionModal item={modal} staff={data.staff} close={() => setModal(null)} saved={async nextWarnings => { setModal(null); setWarnings(nextWarnings); await load(); }} />}
  </div>;
}

function StockCard({ stock, schedule }: { stock: Stock; schedule: () => void }) {
  return <article className="collection-stock-card"><div><span>{stock.stock_number || "Stock pending"}</span><h3>{bikeName(stock)}</h3><p>{stock.registration || "Registration pending"} · {stock.customer_name || "Customer"}</p><small>{stock.collection_postcode || stock.customer_postcode || "Address missing"} · Expected {stock.expected_arrival_date || "not set"}</small></div><button type="button" onClick={schedule}>Schedule Collection</button></article>;
}

function CollectionCard({ collection, driverMode, busy, transition, edit }: { collection: Collection; staff: Staff[]; driverMode: boolean; busy: string; transition: (collection: Collection, status: string) => Promise<void>; edit: () => void }) {
  const stock = collection.stock;
  const phone = stock?.customer_phone || collection.assigned_driver_phone || "";
  const address = [collection.collection_address, collection.collection_postcode].filter(Boolean).join(", ");
  return <article className={`collection-card ${collection.collection_status}`}>
    <header><div><span>{statusLabels[collection.collection_status] || collection.collection_status}</span><h2>{bikeName(stock)}</h2><p>{stock?.stock_number || stock?.registration || "Incoming stock"} · {typeLabels[collection.collection_type] || collection.collection_type}</p></div><time>{collection.scheduled_date || "No date"} {timeWindow(collection)}</time></header>
    <div className="collection-card-grid">
      <Info label="Customer" value={stock?.customer_name || "Customer"} />
      <Info label="Location" value={collection.collection_postcode || "Missing"} sub={address} />
      <Info label="Distance" value={formatMiles(collection.approximate_distance_miles)} sub={formatMinutes(collection.estimated_drive_minutes)} />
      <Info label="Assigned" value={collection.assigned_user?.full_name || collection.assigned_driver_name || "Unassigned"} />
      <Info label="Payment due" value={money(collection.balance_due)} sub={collection.payment_status || "pending"} />
      <Info label="Cost" value={`${money(collection.estimated_collection_cost)} est.`} sub={`${money(collection.actual_collection_cost)} actual`} />
    </div>
    <nav className={driverMode ? "driver-actions" : ""}>
      {phone && <a href={`tel:${phone}`}>Call</a>}
      {phone && <a href={`https://wa.me/${phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>}
      <a href={directionsUrl(collection)} target="_blank" rel="noreferrer">Directions</a>
      <button type="button" onClick={() => void navigator.clipboard?.writeText(address)}>Copy Address</button>
      <a href={`/api/collections/${collection.id}/ics`}>Add to Calendar</a>
      {!driverMode && <button type="button" onClick={edit}>Edit</button>}
      {(nextActions[collection.collection_status] || []).map(([status, label]) => <button type="button" onClick={() => void transition(collection, status)} disabled={busy === `${collection.id}-${status}`} key={status}>{busy === `${collection.id}-${status}` ? "Saving..." : label}</button>)}
    </nav>
  </article>;
}

function CollectionModal({ item, staff, close, saved }: { item: { stock?: Stock; collection?: Collection }; staff: Staff[]; close: () => void; saved: (warnings: string[]) => Promise<void> }) {
  const existing = item.collection;
  const stock = item.stock || existing?.stock;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(existing?.confirmation_message || confirmationMessage(stock, existing));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    payload.confirmation_message = confirmation;
    const url = existing ? `/api/collections/${existing.id}` : "/api/collections";
    const response = await fetch(url, { method: existing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, stock_bike_id: stock?.id }) });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) return setError(body.error || "Unable to save collection.");
    await saved(body.warnings || []);
  }

  return <div className="collection-modal" role="dialog" aria-modal="true">
    <form onSubmit={submit}>
      <header><div><h2>{existing ? "Edit Collection" : "Schedule Collection"}</h2><p>{bikeName(stock)} · {stock?.customer_name || "Customer"}</p></div><button type="button" onClick={close}>Close</button></header>
      {error && <p className="invoice-error">{error}</p>}
      <div className="collection-form-grid">
        <label><span>Collection type</span><select name="collection_type" defaultValue={existing?.collection_type || "customer_collection"}>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>Scheduled date</span><input name="scheduled_date" type="date" defaultValue={existing?.scheduled_date || ""} /></label>
        <label><span>Start time</span><input name="scheduled_start_time" type="time" defaultValue={String(existing?.scheduled_start_time || "").slice(0, 5)} /></label>
        <label><span>End time</span><input name="scheduled_end_time" type="time" defaultValue={String(existing?.scheduled_end_time || "").slice(0, 5)} /></label>
        <label><span>Flexible window</span><input name="time_window_text" defaultValue={existing?.time_window_text || ""} placeholder="10:00-12:00" /></label>
        <label><span>Assigned staff</span><select name="assigned_user_id" defaultValue={existing?.assigned_user_id || ""}><option value="">Unassigned / external</option>{staff.map(user => <option value={user.id} key={user.id}>{user.full_name || "Staff member"}</option>)}</select></label>
        <label><span>Transporter company</span><input name="external_transporter_name" defaultValue={String(existing?.external_transporter_name || "")} /></label>
        <label><span>Driver name</span><input name="assigned_driver_name" defaultValue={existing?.assigned_driver_name || ""} /></label>
        <label><span>Driver phone</span><input name="assigned_driver_phone" defaultValue={existing?.assigned_driver_phone || ""} /></label>
        <label className="full"><span>Collection address</span><textarea name="collection_address" rows={3} defaultValue={existing?.collection_address || stock?.collection_address || stock?.customer_address || ""} /></label>
        <label><span>Postcode</span><input name="collection_postcode" defaultValue={existing?.collection_postcode || stock?.collection_postcode || stock?.customer_postcode || ""} /></label>
        <label><span>Estimated cost</span><input name="estimated_collection_cost" type="number" min="0" step="0.01" defaultValue={String(existing?.estimated_collection_cost ?? "")} /></label>
        <label><span>Actual cost</span><input name="actual_collection_cost" type="number" min="0" step="0.01" defaultValue={String(existing?.actual_collection_cost ?? "")} /></label>
        <label><span>Payment method</span><select name="payment_method" defaultValue={String(existing?.payment_method || "no_payment_due")}><option value="no_payment_due">No payment due</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="finance_settlement">Finance settlement</option><option value="part_payment">Part payment</option><option value="other">Other</option></select></label>
        <label><span>Payment status</span><select name="payment_status" defaultValue={String(existing?.payment_status || "pending")}><option value="not_required">Not Required</option><option value="pending">Pending</option><option value="part_paid">Part Paid</option><option value="paid">Paid</option><option value="failed">Failed</option><option value="on_hold">On Hold</option><option value="finance_settlement_required">Finance Settlement Required</option></select></label>
        <label><span>Deposit paid</span><input name="deposit_paid" type="number" min="0" step="0.01" defaultValue={String(existing?.deposit_paid ?? stock?.deposit_paid ?? "")} /></label>
        <label><span>Balance due</span><input name="balance_due" type="number" min="0" step="0.01" defaultValue={String(existing?.balance_due ?? stock?.balance_outstanding ?? "")} /></label>
        <label><span>Balance paid</span><input name="balance_paid" type="number" min="0" step="0.01" defaultValue={String(existing?.balance_paid ?? "")} /></label>
        <label><span>Final purchase price</span><input name="final_purchase_price" type="number" min="0" step="0.01" defaultValue={String(existing?.final_purchase_price ?? stock?.purchase_price ?? "")} /></label>
        <label className="full"><span>Final price note</span><textarea name="final_purchase_price_note" rows={2} defaultValue={String(existing?.final_purchase_price_note || "")} /></label>
        <label><span>Expected keys</span><input name="keys_expected" type="number" min="0" defaultValue={String(existing?.keys_expected ?? "")} /></label>
        <label><span>Actual mileage</span><input name="actual_mileage" type="number" min="0" defaultValue={String(existing?.actual_mileage ?? stock?.mileage ?? "")} /></label>
        <label><span>Keys received</span><input name="keys_received" type="number" min="0" defaultValue={String(existing?.keys_received ?? "")} /></label>
        <label className="full"><span>Customer instructions</span><textarea name="customer_instructions" rows={3} defaultValue={String(existing?.customer_instructions || "")} /></label>
        <label className="full"><span>Access / parking notes</span><textarea name="parking_access_notes" rows={3} defaultValue={String(existing?.parking_access_notes || "")} /></label>
        <label className="full"><span>Internal notes</span><textarea name="collection_notes" rows={3} defaultValue={String(existing?.collection_notes || "")} /></label>
        <label className="full"><span>Condition notes</span><textarea name="condition_notes" rows={3} defaultValue={String(existing?.condition_notes || "")} /></label>
        <label className="full"><span>Confirmation message</span><textarea value={confirmation} onChange={event => setConfirmation(event.target.value)} rows={8} /></label>
      </div>
      <footer><button type="button" onClick={close}>Cancel</button><button className="admin-primary" disabled={saving}>{saving ? "Saving..." : existing ? "Save Collection" : "Schedule Collection"}</button></footer>
    </form>
  </div>;
}

function Info({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>;
}

function bikeName(stock?: Stock | null) {
  return [stock?.year, stock?.make, stock?.model, stock?.variant].filter(Boolean).join(" ") || "Motorcycle";
}

function timeWindow(collection: Collection) {
  if (collection.time_window_text) return collection.time_window_text;
  return [collection.scheduled_start_time, collection.scheduled_end_time].filter(Boolean).map(value => String(value).slice(0, 5)).join("-");
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

function moneyOrNumber(key: string, value: unknown) {
  return key.toLowerCase().includes("cost") ? money(value) : Number(value ?? 0).toLocaleString("en-GB");
}

function formatMiles(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? `${parsed.toFixed(1)} miles` : "Not available";
}

function formatMinutes(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "Drive time unknown";
  return parsed < 60 ? `${Math.round(parsed)} minutes` : `${Math.floor(parsed / 60)} hr ${Math.round(parsed % 60)} min`;
}

function directionsUrl(collection: Collection) {
  const destination = collection.latitude != null && collection.longitude != null ? `${collection.latitude},${collection.longitude}` : [collection.collection_address, collection.collection_postcode].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&origin=YesMoto&destination=${encodeURIComponent(destination || "YesMoto")}&travelmode=driving`;
}

function confirmationMessage(stock?: Stock | null, collection?: Collection) {
  return `Hi ${stock?.customer_name || ""},\n\nThis is YesMoto confirming the collection of your ${bikeName(stock)}.\n\nDate: ${collection?.scheduled_date || ""}\nTime: ${collection ? timeWindow(collection) : ""}\nCollection address: ${[collection?.collection_address || stock?.collection_address || stock?.customer_address, collection?.collection_postcode || stock?.collection_postcode || stock?.customer_postcode].filter(Boolean).join(", ")}\n\nPlease have the keys, V5C and any service history ready.\n\nPlease reply to confirm that this appointment is suitable.\n\nThanks,\nYesMoto`;
}

const kpiLabels: Record<string, string> = {
  collectionsToday: "Collections Today",
  collectionsThisWeek: "Collections This Week",
  unscheduledPurchases: "Unscheduled Purchases",
  awaitingConfirmation: "Awaiting Confirmation",
  driversEnRoute: "Drivers En Route",
  bikesCollectedToday: "Bikes Collected Today",
  failedCollections: "Failed Collections",
  estimatedCollectionCostThisMonth: "Estimated Cost This Month",
  actualCollectionCostThisMonth: "Actual Cost This Month",
};

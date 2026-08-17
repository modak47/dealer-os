"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { directionsUrl, googleMapsUrl, leadLocationStatus, staticMapUrl } from "@/lib/location-ui";
import { createClient } from "@/lib/supabase/client";
import { combineLeadImages, customerName, formatGbp, formatLeadDate, formatMileage, safeNumber, statusLabel } from "@/lib/website-leads";
import type { DealerLeadClaimStatus, DealerMileageHistoryItem, DealerMotHistoryItem, DealerPortalAccount, DealerVisibleLead } from "@/types/dealer-portal";

type PortalData = {
  dealer: DealerPortalAccount;
  available: DealerVisibleLead[];
  claimed: DealerVisibleLead[];
};

type PortalTab = "available" | "active" | "purchased" | "lost";
type LeadCardTab = "overview" | "location" | "check" | "mot" | "customer";

const terminalStatuses = new Set(["purchased", "purchased_later", "lost", "returned_to_pool"]);
const lostReasons = ["Couldn't agree price", "Customer stopped responding", "Customer sold elsewhere", "Condition not as described", "Mileage", "Vehicle history", "Outstanding finance", "Too far away", "Specification unsuitable", "Customer decided not to sell", "Other"];
const statusActions: [DealerLeadClaimStatus, string][] = [
  ["attempting_contact", "Attempting Contact"],
  ["contacted", "Contacted"],
  ["offer_made", "Offer Made"],
  ["negotiating", "Negotiating"],
  ["agreed_to_purchase", "Agreed"],
  ["collection_booked", "Collection Booked"],
];

export function DealerPortalClient() {
  const [data, setData] = useState<PortalData | null>(null);
  const [activeTab, setActiveTab] = useState<PortalTab>("available");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/dealer-portal/leads", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setData(payload);
    else setError(payload.error || "Unable to load dealer portal.");
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeLeads = useMemo(() => data?.claimed.filter(lead => !terminalStatuses.has(String(lead.portal_claim_status))) ?? [], [data]);
  const purchasedLeads = useMemo(() => data?.claimed.filter(lead => ["purchased", "purchased_later"].includes(String(lead.portal_claim_status))) ?? [], [data]);
  const lostLeads = useMemo(() => data?.claimed.filter(lead => ["lost", "returned_to_pool"].includes(String(lead.portal_claim_status))) ?? [], [data]);
  const leads = activeTab === "available" ? data?.available ?? [] : activeTab === "active" ? activeLeads : activeTab === "purchased" ? purchasedLeads : lostLeads;
  const kpis = useMemo(() => [
    ["Available", data?.available.length ?? 0],
    ["Active", activeLeads.length],
    ["Purchased", purchasedLeads.length],
    ["Purchase Fee", formatGbp(data?.dealer.successful_purchase_fee ?? 50)],
  ], [activeLeads.length, data, purchasedLeads.length]);

  async function claim(lead: DealerVisibleLead) {
    setBusyId(lead.id);
    setError("");
    setNotice("");
    const response = await fetch(`/api/dealer-portal/leads/${lead.id}/claim`, { method: "POST" });
    const payload = await response.json();
    if (response.ok) {
      setNotice("Lead claimed. Customer details are now unlocked.");
      setActiveTab("active");
      await load();
    } else setError(payload.error || "Unable to claim lead.");
    setBusyId(null);
  }

  async function signOut() {
    await createClient().auth.signOut();
    setData(null);
    setNotice("Signed out.");
  }

  return <main className="dealer-portal">
    <section className="dealer-portal-head"><div><p>DEALER BUYING PORTAL</p><h1>{data?.dealer.trading_name || "Motorcycle opportunities"}</h1><span>Claiming and contacting are free. A successful purchase fee is only due when you buy the motorcycle.</span>{data && <button className="dealer-sign-out" onClick={() => void signOut()}>Sign out</button>}</div></section>
    {error && <div className="portal-message error">{error}</div>}{notice && <div className="portal-message">{notice}</div>}
    {loading ? <div className="portal-empty"><h2>Loading portal...</h2></div> : !data ? <div className="portal-empty"><h2>Dealer access unavailable</h2><p>Sign in with a linked dealer login, or ask YesMoto to set up your dealer account.</p><Link className="dealer-claim-button" href="/dealer-login">Go to Dealer Login</Link></div> : <section className="dealer-portal-dashboard">
      <div className="portal-kpis">{kpis.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <nav className="portal-tabs dealer-tabs" aria-label="Dealer lead sections">
        <button className={activeTab === "available" ? "active" : ""} onClick={() => setActiveTab("available")}>Available Leads</button>
        <button className={activeTab === "active" ? "active" : ""} onClick={() => setActiveTab("active")}>Active Leads</button>
        <button className={activeTab === "purchased" ? "active" : ""} onClick={() => setActiveTab("purchased")}>Purchased</button>
        <button className={activeTab === "lost" ? "active" : ""} onClick={() => setActiveTab("lost")}>Lost / Returned</button>
      </nav>
      {!leads.length ? <div className="portal-empty"><h2>{emptyTitle(activeTab)}</h2><p>{emptyCopy(activeTab)}</p></div> : <section className="dealer-lead-grid">{leads.map(lead => <DealerLeadCard dealer={data.dealer} lead={lead} busy={busyId === lead.id} onClaim={() => void claim(lead)} onChanged={load} key={`${activeTab}-${lead.id}`} />)}</section>}
    </section>}
  </main>;
}

function emptyTitle(tab: PortalTab) {
  if (tab === "available") return "No available motorcycles right now";
  if (tab === "purchased") return "No purchases reported yet";
  if (tab === "lost") return "No lost or returned leads yet";
  return "No active motorcycles yet";
}

function emptyCopy(tab: PortalTab) {
  if (tab === "available") return "New suitable opportunities will appear here when YesMoto releases them.";
  if (tab === "purchased") return "Purchased motorcycles will appear here after you report them.";
  if (tab === "lost") return "Leads you mark as lost or returned will stay here for your records.";
  return "Claim a lead to unlock customer details and work the opportunity.";
}

function DealerLeadCard({ dealer, lead, busy, onClaim, onChanged }: { dealer: DealerPortalAccount; lead: DealerVisibleLead; busy: boolean; onClaim: () => void; onChanged: () => Promise<void> }) {
  const [cardTab, setCardTab] = useState<LeadCardTab>("overview");
  const [imageIndex, setImageIndex] = useState(0);
  const images = lead.resolved_images ?? combineLeadImages(lead);
  const image = images[imageIndex] ?? images[0];
  const unlocked = Boolean(lead.customer_unlocked);
  const claimId = lead.portal_claim_id ?? "";
  const active = unlocked && claimId && !terminalStatuses.has(String(lead.portal_claim_status));
  const canReportPurchasedLater = unlocked && claimId && lead.portal_claim_status === "lost";
  const notes = lead.portal_notes ?? [];
  const title = [lead.year, lead.make, lead.model].filter(Boolean).join(" ") || "Motorcycle details pending";
  const askingPrice = safeNumber(lead.price);
  const displayStatus = statusLabel(lead.portal_claim_status || lead.status || "available").replace(/^Dealer Pool Available$/i, "Available");
  const tabs: [LeadCardTab, string][] = [["overview", "Overview"], ["location", "Location"], ["check", "Vehicle check"], ["mot", "MOT data"], ...(unlocked ? [["customer", "Customer"] as [LeadCardTab, string]] : [])];
  useEffect(() => setImageIndex(0), [lead.id, images.length]);
  function moveImage(direction: -1 | 1) {
    setImageIndex(current => (current + direction + images.length) % images.length);
  }
  return <article className="dealer-lead-card">
    <div className="dealer-lead-image">{image ? <img src={image} alt={`${lead.make ?? "Motorcycle"} ${lead.model ?? ""}`} /> : <span>No photos</span>}{images.length > 1 && <><button className="dealer-image-nav previous" type="button" onClick={() => moveImage(-1)} aria-label="Previous motorcycle photo">&lt;</button><button className="dealer-image-nav next" type="button" onClick={() => moveImage(1)} aria-label="Next motorcycle photo">&gt;</button><div className="dealer-image-dots" aria-label={`${imageIndex + 1} of ${images.length} photos`}>{images.map((_, index) => <button className={index === imageIndex ? "active" : ""} type="button" onClick={() => setImageIndex(index)} aria-label={`Show photo ${index + 1}`} key={index} />)}</div><b>{imageIndex + 1} / {images.length} photos</b></>}</div>
    <div className="dealer-lead-body">
      <nav className="dealer-card-tabs" aria-label={`${title} lead details`}>{tabs.map(([tab, label]) => <button className={cardTab === tab ? "active" : ""} onClick={() => setCardTab(tab)} type="button" key={tab}>{label}</button>)}</nav>
      <header className="dealer-lead-title"><div><span>{displayStatus}</span><div className="dealer-title-line"><h2>{title}</h2></div></div><strong><span>Customer asking price</span>{askingPrice === null ? lead.price || "Not supplied" : formatGbp(askingPrice)}</strong></header>
      <div className="dealer-opportunity-strip">
        <div><span>Approx location</span><b>{lead.portal_location_label || "Location pending"}</b></div>
        <div><span>Distance</span><b>{lead.portal_distance_label || "Distance not calculated"}</b></div>
        <div><span>Received</span><b>{formatLeadDate(lead.date || lead.created_at)}</b></div>
      </div>
      <div className="dealer-card-tab-panel">
        {cardTab === "overview" && <><VehicleCheckSummaryPanel lead={lead} /><MotorcyclePreviewPanel lead={lead} /></>}
        {cardTab === "location" && <LocationPanel dealer={dealer} lead={lead} unlocked={unlocked} />}
        {cardTab === "check" && <VehicleCheckPanel lead={lead} />}
        {cardTab === "mot" && <VehicleMotPanel lead={lead} />}
        {cardTab === "customer" && <><CustomerPanel lead={lead} unlocked />{active && <DealerWorkPanel claimId={claimId} lead={lead} onChanged={onChanged} />}{canReportPurchasedLater && <PurchasedLaterPanel claimId={claimId} lead={lead} onChanged={onChanged} />}{unlocked && <section className="dealer-timeline"><h3>Activity Timeline</h3>{notes.length ? notes.map(note => <article key={note.id}><span>{note.note_type} - {formatLeadDate(note.created_at)}</span><p>{note.body}</p></article>) : <p>No activity recorded yet.</p>}</section>}</>}
      </div>
      {!unlocked && <div className="dealer-claim-row"><CustomerPanel lead={lead} unlocked={false} /><button className="dealer-claim-button" disabled={busy} onClick={onClaim}>{busy ? "Claiming..." : "Claim Lead"}</button></div>}
    </div>
  </article>;
}

function MotorcyclePreviewPanel({ lead }: { lead: DealerVisibleLead }) {
  const rows = [
    ["Registration", lead.reg],
    ["Mileage", formatMileage(lead.mileage)],
    ["Make", lead.make],
    ["Model", lead.model],
    ["Year", lead.year],
    ["Engine", lead.engine],
    ["Colour", lead.colour],
    ["Owners", lead.owners],
    ["Service history", lead.service || lead.history],
    ["MOT", lead.mot],
    ["Condition", lead.bike_condition || lead.damage],
  ] as const;
  return <section className="dealer-preview-panel">
    <h3>Motorcycle Preview</h3>
    <dl>{rows.map(([label, value]) => <Detail label={label} value={value} key={label} />)}</dl>
    {(lead.customer_message || lead.extras) && <p><strong>Notes</strong>{lead.customer_message || lead.extras}</p>}
  </section>;
}

function CustomerPanel({ lead, unlocked }: { lead: DealerVisibleLead; unlocked: boolean }) {
  return <section className={`dealer-customer-panel ${unlocked ? "unlocked" : ""}`}>
    <h3>{unlocked ? "Customer Details" : "Customer Details Locked"}</h3>
    {unlocked ? <dl><div><dt>Name</dt><dd>{customerName(lead)}</dd></div><div><dt>Phone</dt><dd>{lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : "Not supplied"}</dd></div><div><dt>Email</dt><dd>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : "Not supplied"}</dd></div><div><dt>Postcode</dt><dd>{lead.postcode || "Not supplied"}</dd></div></dl> : <p>Claim this lead to unlock customer contact details. Only one dealer can claim each lead.</p>}
  </section>;
}

function LocationPanel({ dealer, lead, unlocked }: { dealer: DealerPortalAccount; lead: DealerVisibleLead; unlocked: boolean }) {
  const publicLocation = {
    location_town: lead.location_town || lead.portal_location_label,
    location_display_name: unlocked ? lead.location_display_name : null,
    postcode: unlocked ? lead.postcode : null,
    normalised_postcode: unlocked ? lead.normalised_postcode : null,
    latitude: unlocked ? lead.latitude : null,
    longitude: unlocked ? lead.longitude : null,
  };
  const mapUrl = staticMapUrl(publicLocation);
  const hasLocation = Boolean(publicLocation.location_town || publicLocation.location_display_name || publicLocation.postcode || publicLocation.latitude != null);
  const dealerOrigin = dealer.postcode || dealer.trading_name || "YesMoto";
  const lookupLabel = lead.latitude != null && lead.longitude != null ? leadLocationStatus(lead) : lead.portal_location_label ? "Approximate location only" : leadLocationStatus(lead);

  return <section className="dealer-location-panel">
    <div className="dealer-map-preview">{mapUrl ? <iframe title="Approximate motorcycle location map" src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : <span>{lookupLabel}</span>}</div>
    <div>
      <h3>Location</h3>
      <dl>
        <Detail label="Motorcycle" value={lead.portal_location_label || "Approximate location pending"} />
        <Detail label="Your dealership" value={dealer.postcode || "Dealer postcode not set"} />
        <Detail label="Distance" value={lead.portal_distance_label || "Distance not calculated"} />
        <Detail label="Lookup" value={lookupLabel} />
      </dl>
      {hasLocation && <nav><a href={googleMapsUrl(publicLocation)} target="_blank" rel="noreferrer">View Map</a><a href={directionsUrl(dealerOrigin, publicLocation)} target="_blank" rel="noreferrer">Directions</a></nav>}
    </div>
  </section>;
}

function VehicleCheckSummaryPanel({ lead }: { lead: DealerVisibleLead }) {
  const check = lead.portal_vehicle_check;
  const reportHref = check?.report_url ? `/api/autotrader/vehicle-check-report?url=${encodeURIComponent(check.report_url)}` : "";
  return <section className={`dealer-check-summary ${check?.clear === false ? "warning" : check?.clear === true ? "clear" : ""}`}>
    <div><span>Vehicle check</span><strong>{check?.status || "Vehicle check not yet available"}</strong></div>
    <nav>{check?.mot_expiry && <b>MOT {check.mot_expiry}</b>}{reportHref && <a href={reportHref} target="_blank" rel="noreferrer">View report</a>}</nav>
  </section>;
}

function VehicleCheckPanel({ lead, compact = false }: { lead: DealerVisibleLead; compact?: boolean }) {
  const check = lead.portal_vehicle_check;
  const compactFlagKeys = new Set(["identity", "stolen", "finance", "write_off", "mileage"]);
  const compactWarningKeys = new Set(["scrapped", "imported", "exported", "high_risk"]);
  const priorityFlags = check?.flags.filter(item => compactFlagKeys.has(item.key) || (compactWarningKeys.has(item.key) && item.state === "warning")) ?? [];
  const flags = (compact ? priorityFlags : check?.flags ?? []).filter(item => !(item.key === "mot" && check?.mot_expiry));
  const reportHref = check?.report_url ? `/api/autotrader/vehicle-check-report?url=${encodeURIComponent(check.report_url)}` : "";
  return <section className={`dealer-vehicle-check ${compact ? "compact" : ""} ${check?.clear === false ? "warning" : check?.clear === true ? "clear" : ""}`}>
    <header><div><span>Vehicle Check</span><h3>{check?.status || "Vehicle check not yet available"}</h3></div><nav>{check?.mot_expiry && <b>MOT {check.mot_expiry}</b>}{reportHref && <a href={reportHref} target="_blank" rel="noreferrer">View report</a>}</nav></header>
    {!check ? <p>Vehicle check not yet available. YesMoto will show the HPI-style summary here once the Auto Trader vehicle check has been stored.</p> : <><div className="dealer-check-grid">{flags.map(item => <article className={item.state} key={item.key}><b>{item.state === "warning" ? "!" : item.state === "clear" ? "OK" : "N/A"}</b><div><strong>{item.label}</strong><span>{item.detail}</span></div></article>)}</div>{check.details.length > 0 && !compact && <details className="dealer-check-details"><summary>Technical identity details</summary><dl>{check.details.map(item => <Detail label={item.label} value={item.value} key={item.label} />)}</dl></details>}</>}
  </section>;
}

function VehicleMotPanel({ lead }: { lead: DealerVisibleLead }) {
  const check = lead.portal_vehicle_check;
  return <section className="dealer-vehicle-check dealer-mot-panel">
    <header><div><span>MOT data</span><h3>{check ? "MOT and mileage history" : "MOT data not yet available"}</h3></div></header>
    {!check ? <p>MOT and mileage history will show here once the Auto Trader vehicle check has been stored.</p> : <VehicleHistoryPanel check={check} />}
  </section>;
}

function VehicleHistoryPanel({ check }: { check: NonNullable<DealerVisibleLead["portal_vehicle_check"]> }) {
  const motHistory = check.mot_history ?? [];
  const mileageHistory = check.mileage_history ?? [];
  const hasMileageHistory = mileageHistory.length > 0;
  const visibleMotHistory = motHistory.slice(0, 2);
  return <div className="dealer-history-grid">
    <section>
      <h4>MOT History</h4>
      {!motHistory.length ? <p>Historic MOT records are not available from the stored vehicle check yet.</p> : <><div className="dealer-mot-list">{visibleMotHistory.map((item, index) => <MotHistoryRow item={item} key={`${item.date}-${index}`} />)}</div>{motHistory.length > visibleMotHistory.length && <p className="dealer-history-note">{motHistory.length - visibleMotHistory.length} more MOT record(s) in the report.</p>}</>}
    </section>
    <section className={hasMileageHistory ? "" : "dealer-mileage-empty"}>
      <h4>Mileage History</h4>
      {check.mileage_warning && <b className="dealer-mileage-warning">{check.mileage_warning}</b>}
      {hasMileageHistory ? <MileageGraph history={mileageHistory} /> : <p>MOT mileage readings were not returned by the stored vehicle check yet.</p>}
      {hasMileageHistory && check.seller_mileage != null && <p className="dealer-seller-mileage"><strong>Seller declared</strong><span>{check.seller_mileage.toLocaleString("en-GB")} miles</span></p>}
    </section>
  </div>;
}

function MotHistoryRow({ item }: { item: DealerMotHistoryItem }) {
  const label = item.status === "pass" ? "Pass" : item.status === "fail" ? "Fail" : "Unknown";
  return <article className={item.status}>
    <header><strong>{item.date || "Date not returned"}</strong><b>{label}</b></header>
    <dl><Detail label="Mileage" value={item.mileage == null ? null : `${item.mileage.toLocaleString("en-GB")} miles`} /><Detail label="Expiry" value={item.expiry} /></dl>
    {item.details.length > 0 && <ul>{item.details.map(detail => <li key={detail}>{detail}</li>)}</ul>}
  </article>;
}

function MileageGraph({ history }: { history: DealerMileageHistoryItem[] }) {
  const mileages = history.map(item => item.mileage);
  const min = Math.min(...mileages);
  const max = Math.max(...mileages);
  const range = Math.max(1, max - min);
  return <div className="dealer-mileage-graph">
    <div>{history.map((item, index) => {
      const height = 24 + ((item.mileage - min) / range) * 66;
      return <span style={{ height: `${height}px` }} title={`${item.source}: ${item.mileage.toLocaleString("en-GB")} miles`} key={`${item.date}-${index}`}><i>{item.mileage.toLocaleString("en-GB")}</i></span>;
    })}</div>
    <ol>{history.map((item, index) => <li key={`${item.source}-${item.date}-${index}`}><b>{item.date}</b><small>{item.source}</small></li>)}</ol>
  </div>;
}

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div><dt>{label}</dt><dd>{value == null || value === "" ? "Not supplied" : value}</dd></div>;
}

function DealerWorkPanel({ claimId, lead, onChanged }: { claimId: string; lead: DealerVisibleLead; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [noteBody, setNoteBody] = useState("");
  const [lostReason, setLostReason] = useState(lostReasons[0]);
  const [purchase, setPurchase] = useState(() => ({
    purchase_price: String(safeNumber(lead.price) ?? ""),
    purchase_date: new Date().toISOString().slice(0, 10),
    collection_date: "",
    mileage_at_purchase: String(safeNumber(lead.mileage) ?? ""),
    notes: "",
  }));

  async function updateStatus(status: DealerLeadClaimStatus, extra: Record<string, unknown> = {}) {
    setBusy(status);
    setMessage("");
    const response = await fetch(`/api/dealer-portal/claims/${claimId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...extra }),
    });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error || "Unable to update status.");
    else {
      setMessage("Status updated.");
      await onChanged();
    }
    setBusy("");
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("note");
    setMessage("");
    const response = await fetch(`/api/dealer-portal/claims/${claimId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note_type: noteType, body: noteBody }),
    });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error || "Unable to add note.");
    else {
      setNoteBody("");
      setMessage("Note added.");
      await onChanged();
    }
    setBusy("");
  }

  async function reportPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("purchase");
    setMessage("");
    const response = await fetch(`/api/dealer-portal/claims/${claimId}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(purchase),
    });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error || "Unable to report purchase.");
    else {
      setMessage("Purchase reported and Successful Purchase Fee created.");
      await onChanged();
    }
    setBusy("");
  }

  return <section className="dealer-work-panel">
    <h3>Work Lead</h3>
    {message && <p className={message.includes("Unable") ? "dealer-work-error" : "dealer-work-success"}>{message}</p>}
    <div className="dealer-status-actions">{statusActions.map(([status, label]) => <button type="button" disabled={Boolean(busy)} onClick={() => void updateStatus(status)} key={status}>{label}</button>)}</div>
    <form className="dealer-note-form" onSubmit={addNote}>
      <select value={noteType} onChange={event => setNoteType(event.target.value)}><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="offer">Offer</option></select>
      <textarea value={noteBody} onChange={event => setNoteBody(event.target.value)} placeholder="Add activity note, offer, call outcome or next step" required />
      <button disabled={Boolean(busy)}>{busy === "note" ? "Adding..." : "Add Note"}</button>
    </form>
    <details className="dealer-outcome-panel"><summary>Lost / Return</summary><div><select value={lostReason} onChange={event => setLostReason(event.target.value)}>{lostReasons.map(reason => <option key={reason}>{reason}</option>)}</select><button type="button" disabled={Boolean(busy)} onClick={() => void updateStatus("lost", { lost_reason: lostReason })}>Mark Lost</button><button type="button" disabled={Boolean(busy)} onClick={() => void updateStatus("returned_to_pool")}>Return to Pool</button></div></details>
    <details className="dealer-outcome-panel"><summary>Report Purchase</summary><form onSubmit={reportPurchase}><Input label="Purchase price" value={purchase.purchase_price} set={value => setPurchase(current => ({ ...current, purchase_price: value }))} type="number" required /><Input label="Purchase date" value={purchase.purchase_date} set={value => setPurchase(current => ({ ...current, purchase_date: value }))} type="date" required /><Input label="Collection date" value={purchase.collection_date} set={value => setPurchase(current => ({ ...current, collection_date: value }))} type="date" /><Input label="Mileage" value={purchase.mileage_at_purchase} set={value => setPurchase(current => ({ ...current, mileage_at_purchase: value }))} type="number" /><label className="full"><span>Notes</span><textarea value={purchase.notes} onChange={event => setPurchase(current => ({ ...current, notes: event.target.value }))} /></label><button disabled={Boolean(busy)}>{busy === "purchase" ? "Reporting..." : "Mark as Purchased"}</button></form></details>
  </section>;
}

function PurchasedLaterPanel({ claimId, lead, onChanged }: { claimId: string; lead: DealerVisibleLead; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [purchase, setPurchase] = useState(() => ({
    purchase_price: String(safeNumber(lead.price) ?? ""),
    purchase_date: new Date().toISOString().slice(0, 10),
    collection_date: "",
    mileage_at_purchase: String(safeNumber(lead.mileage) ?? ""),
    notes: "",
  }));

  async function reportPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/dealer-portal/claims/${claimId}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(purchase),
    });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error || "Unable to report later purchase.");
    else {
      setMessage("Purchased Later reported and Successful Purchase Fee created.");
      await onChanged();
    }
    setBusy(false);
  }

  return <section className="dealer-work-panel purchased-later-panel">
    <h3>Customer Came Back - Purchased</h3>
    <p>This records the purchase as a later outcome from the original YesMoto introduction.</p>
    {message && <p className={message.includes("Unable") ? "dealer-work-error" : "dealer-work-success"}>{message}</p>}
    <form className="dealer-later-purchase-form" onSubmit={reportPurchase}>
      <Input label="Purchase price" value={purchase.purchase_price} set={value => setPurchase(current => ({ ...current, purchase_price: value }))} type="number" required />
      <Input label="Purchase date" value={purchase.purchase_date} set={value => setPurchase(current => ({ ...current, purchase_date: value }))} type="date" required />
      <Input label="Collection date" value={purchase.collection_date} set={value => setPurchase(current => ({ ...current, collection_date: value }))} type="date" />
      <Input label="Mileage" value={purchase.mileage_at_purchase} set={value => setPurchase(current => ({ ...current, mileage_at_purchase: value }))} type="number" />
      <label className="full"><span>Notes</span><textarea value={purchase.notes} onChange={event => setPurchase(current => ({ ...current, notes: event.target.value }))} placeholder="Briefly explain what happened after the lead was marked lost." /></label>
      <button disabled={busy}>{busy ? "Reporting..." : "Report Purchased Later"}</button>
    </form>
  </section>;
}

function Input({ label, value, set, type = "text", required = false }: { label: string; value: string; set: (value: string) => void; type?: string; required?: boolean }) {
  return <label><span>{label}</span><input type={type} value={value} required={required} min={type === "number" ? "0" : undefined} onChange={event => set(event.target.value)} /></label>;
}

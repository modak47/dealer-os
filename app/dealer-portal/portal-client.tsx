"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { directionsUrl, googleMapsUrl, leadLocationStatus, staticMapUrl } from "@/lib/location-ui";
import { createClient } from "@/lib/supabase/client";
import { combineLeadImages, customerName, formatGbp, formatLeadDate, formatMileage, safeNumber, statusLabel } from "@/lib/website-leads";
import type { DealerBuyingPreferences, DealerGeographyPreferences, DealerLeadClaimStatus, DealerMileageHistoryItem, DealerMotHistoryItem, DealerPortalAccount, DealerPortalAccountWithPreferences, DealerVisibleLead } from "@/types/dealer-portal";

type PortalData = {
  dealer: DealerPortalAccountWithPreferences;
  available: DealerVisibleLead[];
  claimed: DealerVisibleLead[];
};

type PortalTab = "available" | "active" | "purchased" | "lost" | "account";
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
  const leads = activeTab === "available" ? data?.available ?? [] : activeTab === "active" ? activeLeads : activeTab === "purchased" ? purchasedLeads : activeTab === "lost" ? lostLeads : [];

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

  if (loading) return <section className="dealer-portal dealer-portal-redesign"><div className="portal-empty"><h2>Loading portal...</h2></div></section>;
  if (!data) return <section className="dealer-portal dealer-portal-redesign"><div className="portal-empty"><h2>Dealer access unavailable</h2><p>Sign in with a linked dealer login, or ask YesMoto to set up your dealer account.</p><Link className="dealer-claim-button" href="/dealer-login">Go to Dealer Login</Link></div></section>;

  return <section className="dealer-portal dealer-portal-redesign">
    <div className="dealer-shell">
      <DealerSidebar
        dealer={data.dealer}
        activeTab={activeTab}
        counts={{ available: data.available.length, active: activeLeads.length, purchased: purchasedLeads.length, lost: lostLeads.length }}
        onTab={setActiveTab}
      />
      <section className="dealer-main">
        <header className="dealer-mainbar">
          <div className="dealer-mainbar-account"><b>{dealerInitials(data.dealer.trading_name)}</b><strong>{data.dealer.trading_name}</strong></div>
        </header>
        <section className="dealer-welcome">
          <div>
            <h1>Welcome back, <strong>{data.dealer.trading_name}</strong></h1>
            <p>Claiming and contacting are free. A successful purchase fee is only due when you buy the motorcycle.</p>
          </div>
          <button className="dealer-sign-out" onClick={() => void signOut()}>Sign out</button>
        </section>
        {error && <div className="portal-message error">{error}</div>}{notice && <div className="portal-message">{notice}</div>}
        {activeTab === "account" ? <DealerAccountPanel dealer={data.dealer} onSaved={dealer => setData(current => current ? { ...current, dealer } : current)} /> : <>
          {!leads.length ? <div className="portal-empty"><h2>{emptyTitle(activeTab)}</h2><p>{emptyCopy(activeTab)}</p></div> : <section className="dealer-lead-grid">{leads.map(lead => <DealerLeadCard dealer={data.dealer} lead={lead} busy={busyId === lead.id} onClaim={() => void claim(lead)} onChanged={load} key={`${activeTab}-${lead.id}`} />)}</section>}
        </>}
      </section>
    </div>
  </section>;
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

function arrayText(value: string[] | null | undefined) {
  return (value ?? []).join(", ");
}

function splitArrayText(value: string) {
  return Array.from(new Set(value.split(",").map(item => item.trim()).filter(Boolean)));
}

function preferenceSummary(values: string[] | null | undefined, empty = "Any") {
  return values?.length ? values.join(", ") : empty;
}

function dealerInitials(name: string | null | undefined) {
  const parts = (name || "Dealer").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || "D").toUpperCase();
}

function displayEngine(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  const text = String(value).trim();
  return /\bcc\b/i.test(text) ? text : `${text}cc`;
}

function LeadFactIcon({ type }: { type: "location" | "distance" | "received" }) {
  if (type === "location") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
  if (type === "distance") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16" /><path d="M7 19 10 5l4 14 3-10 2 10" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>;
}

function DealerSidebar({ dealer, activeTab, counts, onTab }: { dealer: DealerPortalAccountWithPreferences; activeTab: PortalTab; counts: { available: number; active: number; purchased: number; lost: number }; onTab: (tab: PortalTab) => void }) {
  const items: { tab: PortalTab; label: string; count?: number; icon: string }[] = [
    { tab: "available", label: "Available Leads", count: counts.available, icon: "A" },
    { tab: "active", label: "Active Leads", count: counts.active, icon: "T" },
    { tab: "purchased", label: "Purchased", count: counts.purchased, icon: "P" },
    { tab: "lost", label: "Lost / Returned", count: counts.lost, icon: "R" },
  ];
  return <aside className="dealer-sidebar">
    <div className="dealer-sidebar-brand"><span>{dealerInitials(dealer.trading_name)}</span><div><strong>{dealer.trading_name}</strong><b>Dealer Portal</b></div></div>
    <nav aria-label="Dealer portal navigation">
      <button type="button" onClick={() => onTab("available")}><i>D</i><span>Dashboard</span></button>
      {items.map(item => <button className={activeTab === item.tab ? "active" : ""} type="button" onClick={() => onTab(item.tab)} key={item.tab}><i>{item.icon}</i><span>{item.label}</span><b>{item.count}</b></button>)}
      <hr />
      <button type="button" aria-disabled="true"><i>F</i><span>Payments</span></button>
      <button className={activeTab === "account" ? "active" : ""} type="button" onClick={() => onTab("account")}><i>S</i><span>Profile & Settings</span></button>
      <button type="button" aria-disabled="true"><i>?</i><span>Support</span></button>
    </nav>
    <section className="dealer-sidebar-fee"><span>Purchase Fee</span><strong>{formatGbp(dealer.successful_purchase_fee ?? 50)}</strong><p>Only charged when a lead is purchased.</p></section>
  </aside>;
}

function accountBuyingDefaults(dealer: DealerPortalAccountWithPreferences): DealerBuyingPreferences {
  return dealer.buying_preferences ?? {
    dealer_account_id: dealer.id,
    motorcycle_types: [],
    makes_wanted: [],
    makes_excluded: [],
    models_wanted: [],
    minimum_year: null,
    maximum_age_years: null,
    minimum_value: null,
    maximum_value: null,
    maximum_mileage: null,
    minimum_engine_cc: null,
    maximum_engine_cc: null,
    accepts_non_running: false,
    accepts_insurance_category: false,
    accepts_outstanding_finance: false,
    accepts_imported: false,
    accepts_modified: false,
  };
}

function accountGeographyDefaults(dealer: DealerPortalAccountWithPreferences): DealerGeographyPreferences {
  return dealer.geography_preferences ?? {
    dealer_account_id: dealer.id,
    england: true,
    wales: true,
    scotland: false,
    northern_ireland: false,
    republic_of_ireland: false,
    maximum_radius_miles: null,
  };
}

function DealerAccountPanel({ dealer, onSaved }: { dealer: DealerPortalAccountWithPreferences; onSaved: (dealer: DealerPortalAccountWithPreferences) => void }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(() => ({
    trading_address: dealer.trading_address ?? "",
    main_contact: dealer.main_contact ?? "",
    telephone: dealer.telephone ?? "",
    mobile_whatsapp: dealer.mobile_whatsapp ?? "",
    main_email: dealer.main_email ?? "",
    accounts_email: dealer.accounts_email ?? "",
    website: dealer.website ?? "",
    postcode: dealer.postcode ?? "",
  }));
  const [buying, setBuying] = useState(() => accountBuyingDefaults(dealer));
  const [geography, setGeography] = useState(() => accountGeographyDefaults(dealer));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/dealer-portal/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, buying_preferences: buying, geography_preferences: geography }),
    });
    const payload = await response.json();
    if (response.ok) {
      onSaved(payload.dealer as DealerPortalAccountWithPreferences);
      setMessage("Account preferences saved.");
    } else setMessage(payload.error || "Unable to save account preferences.");
    setSaving(false);
  }

  function setFormField(key: keyof typeof form, value: string) {
    setForm(current => ({ ...current, [key]: value }));
  }
  function setBuyingField<K extends keyof DealerBuyingPreferences>(key: K, value: DealerBuyingPreferences[K]) {
    setBuying(current => ({ ...current, [key]: value }));
  }
  function setGeographyField<K extends keyof DealerGeographyPreferences>(key: K, value: DealerGeographyPreferences[K]) {
    setGeography(current => ({ ...current, [key]: value }));
  }

  return <form className="dealer-account-panel" onSubmit={save}>
    <header><div><span>Dealer Account</span><h2>{dealer.trading_name}</h2><p>Keep your buying profile current so YesMoto can release the right opportunities.</p></div><button disabled={saving}>{saving ? "Saving..." : "Save Account"}</button></header>
    {message && <p className={message.includes("Unable") ? "dealer-work-error" : "dealer-work-success"}>{message}</p>}
    <section className="dealer-account-summary">
      <Detail label="Company" value={dealer.limited_company_name || dealer.trading_name} />
      <Detail label="Purchase fee" value={formatGbp(dealer.successful_purchase_fee)} />
      <Detail label="Attribution period" value={`${dealer.attribution_period_days} days`} />
      <Detail label="Status" value={statusLabel(dealer.account_status)} />
      <Detail label="Makes wanted" value={preferenceSummary(buying.makes_wanted)} />
      <Detail label="Buying radius" value={geography.maximum_radius_miles == null ? "No limit set" : `${geography.maximum_radius_miles} miles`} />
    </section>
    <section className="dealer-account-grid">
      <div className="dealer-account-card">
        <h3>Company Details</h3>
        <div className="dealer-form-grid">
          <Input label="Main contact" value={form.main_contact} set={value => setFormField("main_contact", value)} />
          <Input label="Main email" value={form.main_email} set={value => setFormField("main_email", value)} type="email" />
          <Input label="Telephone" value={form.telephone} set={value => setFormField("telephone", value)} />
          <Input label="WhatsApp/mobile" value={form.mobile_whatsapp} set={value => setFormField("mobile_whatsapp", value)} />
          <Input label="Accounts email" value={form.accounts_email} set={value => setFormField("accounts_email", value)} type="email" />
          <Input label="Website" value={form.website} set={value => setFormField("website", value)} />
          <Input label="Postcode" value={form.postcode} set={value => setFormField("postcode", value)} />
          <label className="full"><span>Trading address</span><textarea value={form.trading_address} onChange={event => setFormField("trading_address", event.target.value)} /></label>
        </div>
      </div>
      <div className="dealer-account-card">
        <h3>Buying Preferences</h3>
        <div className="dealer-form-grid">
          <TextListInput label="Types" value={buying.motorcycle_types} set={value => setBuyingField("motorcycle_types", value)} placeholder="Roadster, adventure, scooter" />
          <TextListInput label="Makes wanted" value={buying.makes_wanted} set={value => setBuyingField("makes_wanted", value)} placeholder="Honda, Yamaha, KTM" />
          <TextListInput label="Makes excluded" value={buying.makes_excluded} set={value => setBuyingField("makes_excluded", value)} />
          <TextListInput label="Models wanted" value={buying.models_wanted} set={value => setBuyingField("models_wanted", value)} />
          <NumberPreference label="Minimum year" value={buying.minimum_year} set={value => setBuyingField("minimum_year", value)} />
          <NumberPreference label="Maximum age years" value={buying.maximum_age_years} set={value => setBuyingField("maximum_age_years", value)} />
          <NumberPreference label="Minimum value" value={buying.minimum_value} set={value => setBuyingField("minimum_value", value)} />
          <NumberPreference label="Maximum value" value={buying.maximum_value} set={value => setBuyingField("maximum_value", value)} />
          <NumberPreference label="Maximum mileage" value={buying.maximum_mileage} set={value => setBuyingField("maximum_mileage", value)} />
          <NumberPreference label="Minimum engine cc" value={buying.minimum_engine_cc} set={value => setBuyingField("minimum_engine_cc", value)} />
          <NumberPreference label="Maximum engine cc" value={buying.maximum_engine_cc} set={value => setBuyingField("maximum_engine_cc", value)} />
        </div>
      </div>
      <div className="dealer-account-card">
        <h3>History Rules</h3>
        <div className="dealer-checklist">
          <Checkbox label="Accept non-running bikes" checked={buying.accepts_non_running} set={value => setBuyingField("accepts_non_running", value)} />
          <Checkbox label="Accept insurance category bikes" checked={buying.accepts_insurance_category} set={value => setBuyingField("accepts_insurance_category", value)} />
          <Checkbox label="Accept outstanding finance marker" checked={buying.accepts_outstanding_finance} set={value => setBuyingField("accepts_outstanding_finance", value)} />
          <Checkbox label="Accept imported bikes" checked={buying.accepts_imported} set={value => setBuyingField("accepts_imported", value)} />
          <Checkbox label="Accept modified bikes" checked={buying.accepts_modified} set={value => setBuyingField("accepts_modified", value)} />
        </div>
      </div>
      <div className="dealer-account-card">
        <h3>Geography</h3>
        <div className="dealer-checklist geography">
          <Checkbox label="England" checked={geography.england} set={value => setGeographyField("england", value)} />
          <Checkbox label="Wales" checked={geography.wales} set={value => setGeographyField("wales", value)} />
          <Checkbox label="Scotland" checked={geography.scotland} set={value => setGeographyField("scotland", value)} />
          <Checkbox label="Northern Ireland" checked={geography.northern_ireland} set={value => setGeographyField("northern_ireland", value)} />
          <Checkbox label="Republic of Ireland" checked={geography.republic_of_ireland} set={value => setGeographyField("republic_of_ireland", value)} />
        </div>
        <NumberPreference label="Buying radius miles" value={geography.maximum_radius_miles} set={value => setGeographyField("maximum_radius_miles", value)} />
      </div>
    </section>
  </form>;
}

function DealerLeadCard({ dealer, lead, busy, onClaim, onChanged }: { dealer: DealerPortalAccount; lead: DealerVisibleLead; busy: boolean; onClaim: () => void; onChanged: () => Promise<void> }) {
  const [detailTab, setDetailTab] = useState<LeadCardTab | null>(null);
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
  const meta = [lead.reg, formatMileage(lead.mileage), displayEngine(lead.engine)].filter(Boolean).join(" - ");
  const tabs: [LeadCardTab, string][] = [["overview", "Overview"], ["location", "Location"], ["check", "Vehicle check"], ["mot", "MOT data"], ...(unlocked ? [["customer", "Customer"] as [LeadCardTab, string]] : [])];
  useEffect(() => setImageIndex(0), [lead.id, images.length]);
  function moveImage(direction: -1 | 1) {
    setImageIndex(current => (current + direction + images.length) % images.length);
  }
  return <article className="dealer-lead-card">
    <div className="dealer-card-summary">
      <div className="dealer-lead-image">{image ? <img src={image} alt={`${lead.make ?? "Motorcycle"} ${lead.model ?? ""}`} /> : <span>No photos</span>}{images.length > 1 && <><button className="dealer-image-nav previous" type="button" onClick={() => moveImage(-1)} aria-label="Previous motorcycle photo">&lt;</button><button className="dealer-image-nav next" type="button" onClick={() => moveImage(1)} aria-label="Next motorcycle photo">&gt;</button><div className="dealer-image-dots" aria-label={`${imageIndex + 1} of ${images.length} photos`}>{images.map((_, index) => <button className={index === imageIndex ? "active" : ""} type="button" onClick={() => setImageIndex(index)} aria-label={`Show photo ${index + 1}`} key={index} />)}</div><b>{imageIndex + 1} / {images.length} photos</b></>}</div>
      <div className="dealer-lead-body">
        <header className="dealer-lead-title"><div><span>{displayStatus}</span><div className="dealer-title-line"><h2>{title}</h2>{meta && <p>{meta}</p>}</div></div><aside className="dealer-title-side"><strong><span>Customer asking price</span>{askingPrice === null ? lead.price || "Not supplied" : formatGbp(askingPrice)}</strong></aside></header>
        <div className="dealer-lead-facts">
          <div><i><LeadFactIcon type="location" /></i><span>Location</span><b>{lead.portal_location_label || "Location pending"}</b></div>
          <div><i><LeadFactIcon type="distance" /></i><span>Distance</span><b>{lead.portal_distance_label?.replace(" from your dealership", " away") || "Distance not calculated"}</b></div>
          <div><i><LeadFactIcon type="received" /></i><span>Received</span><b>{formatLeadDate(lead.date || lead.created_at)}</b></div>
        </div>
        <VehicleCheckSummaryPanel lead={lead} />
        <div className="dealer-lead-controls dealer-lead-controls-compact">
          <nav className="dealer-card-tabs" aria-label={`${title} lead details`}>{tabs.map(([tab, label]) => <button className={detailTab === tab ? "active" : ""} onClick={() => setDetailTab(tab)} type="button" key={tab}>{label}</button>)}</nav>
          <div className="dealer-lead-actions"><button className="dealer-secondary-button" type="button" onClick={() => setDetailTab("overview")}>View Details</button>{!unlocked && <button className="dealer-claim-button" disabled={busy} onClick={onClaim}>{busy ? "Claiming..." : "Claim Lead"}</button>}</div>
        </div>
      </div>
    </div>
    {detailTab && <LeadDetailModal title={title} tab={detailTab} tabs={tabs} setTab={setDetailTab} onClose={() => setDetailTab(null)}>
      {detailTab === "overview" && <div className="dealer-overview-grid"><MotorcyclePreviewPanel lead={lead} /><DealerNotesPanel notes={notes} unlocked={unlocked} onAddNote={() => setDetailTab("customer")} /></div>}
      {detailTab === "location" && <LocationPanel dealer={dealer} lead={lead} unlocked={unlocked} />}
      {detailTab === "check" && <VehicleCheckPanel lead={lead} />}
      {detailTab === "mot" && <VehicleMotPanel lead={lead} />}
      {detailTab === "customer" && <><CustomerPanel lead={lead} unlocked />{active && <DealerWorkPanel claimId={claimId} lead={lead} onChanged={onChanged} />}{canReportPurchasedLater && <PurchasedLaterPanel claimId={claimId} lead={lead} onChanged={onChanged} />}{unlocked && <section className="dealer-timeline"><h3>Activity Timeline</h3>{notes.length ? notes.map(note => <article key={note.id}><span>{note.note_type} - {formatLeadDate(note.created_at)}</span><p>{note.body}</p></article>) : <p>No activity recorded yet.</p>}</section>}</>}
    </LeadDetailModal>}
    {!unlocked && <div className="dealer-claim-row"><CustomerPanel lead={lead} unlocked={false} /></div>}
  </article>;
}

function LeadDetailModal({ title, tab, tabs, setTab, onClose, children }: { title: string; tab: LeadCardTab; tabs: [LeadCardTab, string][]; setTab: (tab: LeadCardTab) => void; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <div className="dealer-detail-modal" role="dialog" aria-modal="true" aria-label={`${title} details`}>
    <button className="dealer-modal-backdrop" type="button" aria-label="Close lead details" onClick={onClose} />
    <section className="dealer-detail-sheet">
      <header>
        <div><span>{title}</span><h3>{tabs.find(([current]) => current === tab)?.[1] ?? "Details"}</h3></div>
        <button type="button" onClick={onClose}>Close</button>
      </header>
      <nav className="dealer-modal-tabs" aria-label={`${title} detail sections`}>{tabs.map(([current, label]) => <button className={tab === current ? "active" : ""} onClick={() => setTab(current)} type="button" key={current}>{label}</button>)}</nav>
      <div className="dealer-modal-content">{children}</div>
    </section>
  </div>;
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
    <h3>Bike Details</h3>
    <dl>{rows.map(([label, value]) => <Detail label={label} value={value} key={label} />)}</dl>
    {(lead.customer_message || lead.extras) && <p><strong>Notes</strong>{lead.customer_message || lead.extras}</p>}
  </section>;
}

function DealerNotesPanel({ notes, unlocked, onAddNote }: { notes: NonNullable<DealerVisibleLead["portal_notes"]>; unlocked: boolean; onAddNote: () => void }) {
  const recent = notes.slice(0, 2);
  return <section className="dealer-notes-panel">
    <h3>Notes</h3>
    {recent.length ? <div>{recent.map(note => <article key={note.id}><span>{note.note_type} - {formatLeadDate(note.created_at)}</span><p>{note.body}</p></article>)}</div> : <p>No notes added yet.</p>}
    <small>{unlocked ? "Add notes after contacting the customer." : "Add notes after claiming this lead."}</small>
    {unlocked && <button type="button" onClick={onAddNote}>Add Note <span>+</span></button>}
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
  const summaryFlags = check?.flags
    .filter(item => ["finance", "stolen", "write_off", "insurance", "mileage"].includes(item.key))
    .slice(0, 5) ?? [];
  return <section className={`dealer-check-summary ${check?.clear === false ? "warning" : check?.clear === true ? "clear" : ""}`}>
    <header><span>Vehicle check</span><strong>{check?.status || "Vehicle check not yet available"}</strong></header>
    {summaryFlags.length > 0 && <div className="dealer-summary-flags">{summaryFlags.map(item => <article className={item.state} key={item.key}>
      <b>{item.state === "warning" ? "!" : item.state === "clear" ? "OK" : "?"}</b>
      <div><strong>{summaryFlagLabel(item)}</strong><span>{summaryFlagDetail(item)}</span></div>
    </article>)}</div>}
    <nav>{reportHref && <a href={reportHref} target="_blank" rel="noreferrer">View report</a>}</nav>
  </section>;
}

function summaryFlagLabel(item: { key: string; label: string }) {
  if (item.key === "finance") return "Clear HPI";
  if (item.key === "stolen") return "Not stolen";
  if (item.key === "write_off") return "No write-off";
  if (item.key === "mileage") return "Mileage OK";
  return item.label;
}

function summaryFlagDetail(item: { key: string; detail: string }) {
  if (item.key === "finance") return item.detail.replace(" recorded", "");
  if (item.key === "write_off") return item.detail.replace("No insurance total loss recorded", "No record");
  if (item.key === "mileage") return item.detail.replace("Mileage ", "");
  return item.detail;
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
    <header><div><span>MOT data</span><h3>{check ? `MOT History${lead.reg ? ` - ${lead.reg}` : ""}` : "MOT data not yet available"}</h3></div></header>
    {!check ? <p>MOT and mileage history will show here once the Auto Trader vehicle check has been stored.</p> : <MotReportPanel check={check} />}
  </section>;
}

function MotReportPanel({ check }: { check: NonNullable<DealerVisibleLead["portal_vehicle_check"]> }) {
  const motHistory = check.mot_history ?? [];
  const mileageHistory = check.mileage_history ?? [];
  const motNotes = motHistory.flatMap(item => item.details.map(detail => ({ date: item.date, status: item.status, detail })));
  return <div className="dealer-mot-report">
    {mileageHistory.length > 0 && <MileageGraph history={mileageHistory} />}
    {motNotes.length > 0 && <section className="dealer-mot-notes">
      <h4>MOT notes</h4>
      <div>{motNotes.slice(0, 6).map((note, index) => <p className={note.status} key={`${note.date}-${note.detail}-${index}`}><span>{formatMotDate(note.date)}</span><strong>{note.detail}</strong></p>)}</div>
    </section>}
    <section className="dealer-mot-tests">
      <h4>MOT Tests ({motHistory.length})</h4>
      {!motHistory.length ? <p>Historic MOT records are not available from the stored vehicle check yet.</p> : <div className="dealer-mot-report-list">{motHistory.slice(0, 8).map((item, index) => <MotReportRow item={item} expanded={index === 0} key={`${item.date}-${index}`} />)}</div>}
      <p className="dealer-history-note">Data sourced from the stored MOT history service.</p>
    </section>
  </div>;
}

function VehicleHistoryPanel({ check }: { check: NonNullable<DealerVisibleLead["portal_vehicle_check"]> }) {
  const motHistory = check.mot_history ?? [];
  const mileageHistory = check.mileage_history ?? [];
  const hasMileageHistory = mileageHistory.length > 0;
  const visibleMotHistory = motHistory.slice(0, 8);
  return <div className="dealer-history-grid">
    <section>
      <h4>MOT History</h4>
      {!motHistory.length ? <p>Historic MOT records are not available from the stored vehicle check yet.</p> : <><div className="dealer-mot-list">{visibleMotHistory.map((item, index) => <MotHistoryRow item={item} expanded={index === 0} key={`${item.date}-${index}`} />)}</div>{motHistory.length > visibleMotHistory.length && <p className="dealer-history-note">{motHistory.length - visibleMotHistory.length} more MOT record(s) in the report.</p>}</>}
    </section>
    <section className={hasMileageHistory ? "" : "dealer-mileage-empty"}>
      <h4>Mileage History</h4>
      {check.mileage_warning && <b className="dealer-mileage-warning">{check.mileage_warning}</b>}
      {hasMileageHistory ? <MileageGraph history={mileageHistory} /> : <p>MOT mileage readings were not returned by the stored vehicle check yet.</p>}
      {hasMileageHistory && check.seller_mileage != null && <p className="dealer-seller-mileage"><strong>Seller declared</strong><span>{check.seller_mileage.toLocaleString("en-GB")} miles</span></p>}
    </section>
  </div>;
}

function MotHistoryRow({ item, expanded }: { item: DealerMotHistoryItem; expanded: boolean }) {
  const label = item.status === "pass" ? "Pass" : item.status === "fail" ? "Fail" : "Unknown";
  return <article className={item.status}>
    <header><strong>{label}</strong><span>{item.details.length ? `${item.details.length} item${item.details.length === 1 ? "" : "s"}` : "No items"}</span><b>{item.date || "Date not returned"}</b><em>{item.mileage == null ? "Mileage not supplied" : `${item.mileage.toLocaleString("en-GB")} miles`}</em></header>
    {expanded && <><dl><Detail label="Mileage" value={item.mileage == null ? null : `${item.mileage.toLocaleString("en-GB")} miles`} /><Detail label="Expiry" value={item.expiry} /></dl>
    {item.details.length > 0 && <ul>{item.details.map(detail => <li key={detail}>{detail}</li>)}</ul>}</>}
  </article>;
}

function MileageGraph({ history }: { history: DealerMileageHistoryItem[] }) {
  const orderedHistory = [...history].sort((a, b) => motDateTime(b.date) - motDateTime(a.date) || b.mileage - a.mileage);
  const mileages = orderedHistory.map(item => item.mileage);
  const max = Math.max(...mileages);
  const deltas = orderedHistory.map((item, index) => {
    const previousReading = orderedHistory[index + 1]?.mileage;
    return previousReading == null ? null : item.mileage - previousReading;
  });
  return <div className="dealer-mileage-report">
    {orderedHistory.map((item, index) => {
      const width = Math.max(18, (item.mileage / Math.max(1, max)) * 100);
      const delta = deltas[index];
      const year = String(item.date || "").slice(0, 4) || item.source;
      return <div className="dealer-mileage-report-row" title={`${item.source}: ${item.mileage.toLocaleString("en-GB")} miles`} key={`${item.date}-${index}`}>
        <span>{year}</span>
        <i><b style={{ width: `${width}%` }} /></i>
        <strong>{item.mileage.toLocaleString("en-GB")}</strong>
        <em>{delta == null ? "" : `+${delta.toLocaleString("en-GB")}`}</em>
      </div>;
    })}
  </div>;
}

function MotReportRow({ item, expanded }: { item: DealerMotHistoryItem; expanded: boolean }) {
  const label = item.status === "pass" ? "PASS" : item.status === "fail" ? "FAIL" : "UNKNOWN";
  const mileage = item.mileage == null ? "Mileage not supplied" : `${item.mileage.toLocaleString("en-GB")} MI`;
  const testDate = formatMotDate(item.date);
  const expiryDate = formatMotDate(item.expiry);
  return <details className={`dealer-mot-report-test ${item.status}`} open={expanded}>
    <summary>
      <span><b>{label}</b>{item.details.length > 0 && <em>{item.details.length} item{item.details.length === 1 ? "" : "s"}</em>}</span>
      <small>{testDate}</small>
      <small>{mileage}</small>
    </summary>
    <div className="dealer-mot-report-detail">
      <dl>
        <Detail label="Test date" value={testDate} />
        <Detail label="Valid until" value={expiryDate} />
        <Detail label="Mileage" value={item.mileage == null ? null : `${item.mileage.toLocaleString("en-GB")} MI (read)`} />
      </dl>
      {item.details.length > 0 && <div><strong>Advisories</strong><ul>{item.details.map(detail => <li key={detail}>{detail}</li>)}</ul></div>}
    </div>
  </details>;
}

function formatMotDate(value: string | null | undefined) {
  if (!value) return "Date not returned";
  const parsed = parseMotDate(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function motDateTime(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = parseMotDate(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseMotDate(value: string) {
  const trimmed = value.trim();
  const ukDate = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (ukDate) {
    const year = Number(ukDate[3]) < 100 ? 2000 + Number(ukDate[3]) : Number(ukDate[3]);
    return new Date(year, Number(ukDate[2]) - 1, Number(ukDate[1]));
  }
  return new Date(trimmed);
}

function MotStats({ check, lead }: { check: NonNullable<DealerVisibleLead["portal_vehicle_check"]>; lead: DealerVisibleLead }) {
  const motHistory = check.mot_history ?? [];
  const passCount = motHistory.filter(item => item.status === "pass").length;
  const failCount = motHistory.filter(item => item.status === "fail").length;
  const latestMileage = check.mileage_history?.at(-1)?.mileage ?? motHistory.find(item => item.mileage != null)?.mileage ?? check.seller_mileage ?? null;
  const firstYear = Number(String(check.details.find(item => item.label === "First registered")?.value || lead.year || "").slice(0, 4));
  const age = Number.isFinite(firstYear) && firstYear > 1900 ? new Date().getFullYear() - firstYear : null;
  const avgMileage = latestMileage != null && age && age > 0 ? Math.round(latestMileage / age) : null;
  const advisories = motHistory.reduce((total, item) => total + item.details.length, 0);
  const passRate = motHistory.length ? Math.round((passCount / motHistory.length) * 100) : null;
  const stats = [
    ["MOT status", check.mot_expiry ? "Valid" : check.status || "Available", check.mot_expiry || "Expiry not supplied"],
    ["Latest mileage", latestMileage == null ? "Not supplied" : `${latestMileage.toLocaleString("en-GB")} mi`, motHistory[0]?.date || "From stored check"],
    ["Avg / year", avgMileage == null ? "Not supplied" : `${avgMileage.toLocaleString("en-GB")} mi`, avgMileage != null && avgMileage < 1500 ? "Low usage" : "Estimated usage"],
    ["Pass rate", passRate == null ? "Not supplied" : `${passRate}%`, motHistory.length ? `${passCount} pass - ${failCount} fail` : "No MOT tests returned"],
    ["Age", age == null ? "Not supplied" : `${age} yrs`, firstYear ? String(firstYear) : "First registered not supplied"],
    ["Advisories", String(advisories), "all-time"],
  ];
  return <div className="dealer-mot-stats">{stats.map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</div>;
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

function TextListInput({ label, value, set, placeholder = "" }: { label: string; value: string[]; set: (value: string[]) => void; placeholder?: string }) {
  return <label><span>{label}</span><input value={arrayText(value)} placeholder={placeholder} onChange={event => set(splitArrayText(event.target.value))} /></label>;
}

function NumberPreference({ label, value, set }: { label: string; value: number | null; set: (value: number | null) => void }) {
  return <label><span>{label}</span><input type="number" min="0" value={value ?? ""} onChange={event => set(event.target.value === "" ? null : Number(event.target.value))} /></label>;
}

function Checkbox({ label, checked, set }: { label: string; checked: boolean; set: (value: boolean) => void }) {
  return <label><input type="checkbox" checked={checked} onChange={event => set(event.target.checked)} /><span>{label}</span></label>;
}

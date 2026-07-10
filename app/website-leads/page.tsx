"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { directionsUrl, formatDriveMinutes, formatMiles, googleMapsUrl, leadLocationStatus, leadLocationTitle } from "@/lib/location-ui";
import { combineLeadImages, customerName, formatGbp, formatLeadDate, formatMileage, safeNumber, statusBadgeClass, statusLabel } from "@/lib/website-leads";
import type { DealerContact, ReferralShareOptions } from "@/types/referral";
import { WEBSITE_LEAD_SOURCES, WEBSITE_LEAD_STATUSES, type WebsiteLead } from "@/types/website-lead";

type SortKey = "newest" | "oldest" | "margin" | "offer";

export default function WebsiteLeadsPage() {
  const [leads, setLeads] = useState<WebsiteLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState("");
  const [valuationStatus, setValuationStatus] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [runningId, setRunningId] = useState<number | null>(null);
  const [locatingId, setLocatingId] = useState<number | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<number, string>>({});
  const [bookingLead, setBookingLead] = useState<WebsiteLead | null>(null);
  const [referralLead, setReferralLead] = useState<WebsiteLead | null>(null);
  const [bookingResult, setBookingResult] = useState<{ stockId: string; stockNumber?: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/website-leads").then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load website leads.");
      if (active) setLeads(payload.leads);
    }).catch((fetchError: Error) => active && setError(fetchError.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const valuationOptions = useMemo(() => Array.from(new Set(leads.map(lead => lead.valuation_status).filter(Boolean))) as string[], [leads]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return leads.filter(lead => {
      const searchable = [lead.reg, lead.make, lead.model, lead.fname, lead.lname, lead.email, lead.phone, lead.postcode].join(" ").toLowerCase();
      return (!search || searchable.includes(search)) && (!website || lead.website === website) && (!status || lead.status === status) && (!valuationStatus || lead.valuation_status === valuationStatus);
    }).sort((a, b) => {
      if (sort === "oldest") return new Date(a.date || a.created_at || 0).getTime() - new Date(b.date || b.created_at || 0).getTime();
      if (sort === "margin") return (b.estimated_margin ?? -Infinity) - (a.estimated_margin ?? -Infinity);
      if (sort === "offer") return (b.suggested_offer ?? -Infinity) - (a.suggested_offer ?? -Infinity);
      return new Date(b.date || b.created_at || 0).getTime() - new Date(a.date || a.created_at || 0).getTime();
    });
  }, [leads, query, website, status, valuationStatus, sort]);

  const kpis = useMemo(() => [
    ["New Leads", leads.filter(lead => (lead.status || "new") === "new").length],
    ["Pending Valuations", leads.filter(lead => (lead.valuation_status || "pending") === "pending").length],
    ["Contacted", leads.filter(lead => lead.status === "contacted").length],
    ["Offers Made", leads.filter(lead => lead.status === "offer_made").length],
    ["Purchased", leads.filter(lead => lead.status === "purchased").length],
    ["Total Leads", leads.length],
  ], [leads]);

  function clearFilters() {
    setQuery("");
    setWebsite("");
    setStatus("");
    setValuationStatus("");
    setSort("newest");
  }

  async function runValuation(lead: WebsiteLead) {
    if (!lead.reg?.trim()) return;
    if (lead.retail_check_id && lead.valuation_status === "completed" && !window.confirm("This lead already has a completed valuation. Create a second Retail Check?")) return;
    setRunningId(lead.id);
    setCardErrors(current => ({ ...current, [lead.id]: "" }));
    try {
      const response = await fetch(`/api/website-leads/${lead.id}/run-valuation`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to run valuation.");
      const refreshed = await fetch(`/api/website-leads/${lead.id}`);
      const refreshedPayload = await refreshed.json();
      if (refreshed.ok) setLeads(current => current.map(item => item.id === lead.id ? refreshedPayload.lead : item));
    } catch (runError) {
      setCardErrors(current => ({ ...current, [lead.id]: runError instanceof Error ? runError.message : "Unable to run valuation." }));
    } finally {
      setRunningId(null);
    }
  }

  async function refreshLocation(lead: WebsiteLead) {
    setLocatingId(lead.id);
    setCardErrors(current => ({ ...current, [lead.id]: "" }));
    try {
      const response = await fetch(`/api/website-leads/${lead.id}/location`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postcode: lead.postcode }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to refresh location.");
      setLeads(current => current.map(item => item.id === lead.id ? payload.lead : item));
    } catch (locationError) {
      setCardErrors(current => ({ ...current, [lead.id]: locationError instanceof Error ? locationError.message : "Unable to refresh location." }));
    } finally {
      setLocatingId(null);
    }
  }

  return <main className="admin-page website-leads-page">
    <div className="admin-heading">
      <div><h1>Website Leads</h1><p>Bike valuation enquiries from the public websites, ready for review and offer work.</p></div>
    </div>
    <section className="website-kpis">{kpis.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="website-lead-controls">
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search reg, bike, customer, email, phone or postcode" aria-label="Search website leads" />
      <select value={website} onChange={event => setWebsite(event.target.value)} aria-label="Filter by source website"><option value="">All websites</option>{WEBSITE_LEAD_SOURCES.map(source => <option value={source} key={source}>{source}</option>)}</select>
      <select value={status} onChange={event => setStatus(event.target.value)} aria-label="Filter by lead status"><option value="">All statuses</option>{WEBSITE_LEAD_STATUSES.map(item => <option value={item} key={item}>{statusLabel(item)}</option>)}</select>
      <select value={valuationStatus} onChange={event => setValuationStatus(event.target.value)} aria-label="Filter by valuation status"><option value="">All valuations</option>{valuationOptions.map(item => <option value={item} key={item}>{statusLabel(item)}</option>)}</select>
      <select value={sort} onChange={event => setSort(event.target.value as SortKey)} aria-label="Sort leads"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="margin">Highest estimated margin</option><option value="offer">Highest suggested offer</option></select>
      <button onClick={clearFilters}>Clear filters</button>
    </section>
    <div className="website-result-count">{loading ? "Loading leads..." : `${filtered.length.toLocaleString("en-GB")} matching leads`}</div>
    {error && <div className="website-state error">{error}</div>}
    {loading && <div className="website-card-grid">{Array.from({ length: 6 }).map((_, index) => <article className="website-lead-card skeleton" key={index}><i /><div><span /><span /><span /></div></article>)}</div>}
    {!loading && !error && !filtered.length && <div className="website-state">No website leads match these filters.</div>}
    {!loading && !error && <section className="website-card-grid">{filtered.map(lead => <LeadCard lead={lead} running={runningId === lead.id} locating={locatingId === lead.id} error={cardErrors[lead.id]} onRun={() => void runValuation(lead)} onRefreshLocation={() => void refreshLocation(lead)} onRefer={() => setReferralLead(lead)} onBook={() => { setBookingLead(lead); setBookingResult(null); }} key={lead.id} />)}</section>}
    {bookingLead && <BookIntoStockModal lead={bookingLead} result={bookingResult} onBooked={(stockId, stockNumber) => { setBookingResult({ stockId, stockNumber }); setLeads(current => current.map(item => item.id === bookingLead.id ? { ...item, status: "purchase_agreed", stock_bike_id: stockId, purchase_agreed_at: new Date().toISOString() } : item)); }} onClose={() => setBookingLead(null)} />}
    {referralLead && <ReferralModal lead={referralLead} onClose={() => setReferralLead(null)} onReferred={lead => { setLeads(current => current.map(item => item.id === lead.id ? lead : item)); setReferralLead(null); }} />}
  </main>;
}

function LeadCard({ lead, running, locating, error, onRun, onRefreshLocation, onRefer, onBook }: { lead: WebsiteLead; running: boolean; locating: boolean; error?: string; onRun: () => void; onRefreshLocation: () => void; onRefer: () => void; onBook: () => void }) {
  const router = useRouter();
  const images = lead.resolved_images ?? combineLeadImages(lead);
  const margin = safeNumber(lead.estimated_margin);
  const processing = lead.valuation_status === "processing";
  const hasReg = Boolean(lead.reg?.trim());
  const runLabel = processing ? "Valuation in progress" : running ? "Valuing..." : lead.retail_check_id && lead.valuation_status === "completed" ? "Re-run Valuation" : "Run Retail Check";
  const locationAvailable = Boolean(lead.postcode || lead.normalised_postcode || lead.location_display_name || lead.latitude != null);
  const locationResolved = lead.latitude != null && lead.longitude != null;
  return <article className="website-lead-card" onClick={() => router.push(`/website-leads/${lead.id}`)}>
    <div className="website-lead-photo">{images[0] ? <img src={images[0]} alt={`${lead.make ?? "Motorcycle"} ${lead.model ?? ""}`} onError={event => { event.currentTarget.style.display = "none"; }} /> : <span>No image</span>}<b>{images.length} photos</b></div>
    <div className="website-lead-card-body">
      <div className="website-lead-title"><span>{lead.reg || "No reg"}</span><h2>{[lead.make, lead.model].filter(Boolean).join(" ") || "Bike details pending"}</h2><p>{lead.year || "Year unknown"} · {formatMileage(lead.mileage)} · {lead.engine || "Engine n/a"}</p></div>
      <div className="website-card-badges"><span className="website-badge source">{lead.website || "unknown"}</span><span className={statusBadgeClass(lead.status)}>{statusLabel(lead.status)}</span><span className="website-badge">{statusLabel(lead.valuation_status || "pending")}</span>{Boolean(lead.referral_count) && <span className="website-badge badge-referred">Referred</span>}</div>
      <dl className="website-lead-facts">
        <div><dt>Customer</dt><dd>{customerName(lead)}</dd></div><div><dt>Phone</dt><dd>{lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : "Not set"}</dd></div><div><dt>Email</dt><dd>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : "Not set"}</dd></div><div><dt>Postcode</dt><dd>{lead.postcode || "Not set"}</dd></div>
        <div><dt>Received</dt><dd>{formatLeadDate(lead.date || lead.created_at)}</dd></div><div><dt>Asking</dt><dd>{lead.price || "Not set"}</dd></div><div><dt>Market Retail</dt><dd>{formatGbp(lead.retail_estimate)}</dd></div><div><dt>Suggested Offer</dt><dd>{formatGbp(lead.suggested_offer)}</dd></div><div className="highlight"><dt>Estimated Margin</dt><dd>{margin === null ? "Not set" : formatGbp(margin)}</dd></div>
      </dl>
      <div className={`website-location-strip ${lead.geocoding_status === "failed" ? "warning" : ""}`}><div><span>Location</span><b>{locationAvailable ? leadLocationTitle(lead) : "Location not supplied"}</b><small>{locationResolved ? `Approximately ${formatMiles(lead.distance_from_yesmoto_miles)} from YesMoto` : leadLocationStatus(lead)}</small></div>{lead.estimated_drive_minutes != null && <em>{formatDriveMinutes(lead.estimated_drive_minutes)}</em>}</div>
      {Boolean(lead.referral_count) && <div className="website-referral-strip"><span>{Number(lead.referral_count) > 1 ? `Referred to ${lead.referral_count} dealers` : `Referred to ${lead.latest_referred_dealer_name || "dealer"}`}</span><b>{lead.latest_referred_dealer_name || "Latest dealer not recorded"}</b><small>{formatLeadDate(lead.latest_referred_at)}</small></div>}
      {error && <div className="website-card-error">{error}</div>}
      <div className="website-card-actions" onClick={event => event.stopPropagation()}>
        {lead.phone ? <a href={`tel:${lead.phone}`}>Contact customer</a> : <span>Contact customer</span>}
        <span>MOT History soon</span>
        {locationAvailable ? <a href={googleMapsUrl(lead)} target="_blank" rel="noreferrer">View Map</a> : <span>Location not supplied</span>}
        {locationAvailable && <a href={directionsUrl("YesMoto", lead)} target="_blank" rel="noreferrer">Get Directions</a>}
        {(!locationResolved || lead.geocoding_status === "failed") && locationAvailable && <button disabled={locating} onClick={onRefreshLocation}>{locating ? "Refreshing..." : "Refresh Location"}</button>}
        <button onClick={onRefer}>Send to Dealer</button>
        {lead.stock_bike_id ? <Link href={`/admin/stock/${lead.stock_bike_id}`}>View Pending Stock</Link> : <button onClick={onBook}>Book Into Stock</button>}
        {hasReg ? <button disabled={running || processing} onClick={onRun}>{runLabel}</button> : <span>Registration required</span>}
        {lead.retail_check_id && <Link href={`/admin/retail-check?recordId=${encodeURIComponent(lead.retail_check_id)}&leadId=${lead.id}`}>View Valuation</Link>}
        <Link href={`/website-leads/${lead.id}`}>View Lead</Link>
      </div>
    </div>
  </article>;
}

function BookIntoStockModal({ lead, result, onBooked, onClose }: { lead: WebsiteLead; result: { stockId: string; stockNumber?: string } | null; onBooked: (stockId: string, stockNumber?: string) => void; onClose: () => void }) {
  const images = lead.resolved_images ?? combineLeadImages(lead);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => ({
    registration: lead.reg ?? "",
    make: lead.make ?? "",
    model: lead.model ?? "",
    variant: "",
    year: lead.year ?? "",
    mileage: String(safeNumber(lead.mileage) ?? ""),
    customer_name: customerName(lead),
    customer_phone: lead.phone ?? "",
    customer_email: lead.email ?? "",
    customer_postcode: lead.postcode ?? "",
    customer_address: "",
    collection_notes: "",
    purchase_price: String(safeNumber(lead.suggested_offer) ?? safeNumber(lead.price) ?? ""),
    target_retail_price: String(safeNumber(lead.retail_estimate) ?? ""),
    minimum_retail_price: "",
    estimated_preparation_cost: "",
    estimated_transport_cost: "",
    other_estimated_costs: "",
    deposit_paid: "",
    balance_outstanding: "",
    expected_arrival_date: "",
    payment_status: "Unpaid",
    purchase_notes: "",
  }));
  const total = (safeNumber(form.purchase_price) ?? 0) + (safeNumber(form.estimated_preparation_cost) ?? 0) + (safeNumber(form.estimated_transport_cost) ?? 0) + (safeNumber(form.other_estimated_costs) ?? 0);
  const profit = (safeNumber(form.target_retail_price) ?? 0) - total;
  function setField(key: keyof typeof form, value: string) {
    setForm(current => {
      const next = { ...current, [key]: value };
      if (key === "purchase_price" || key === "deposit_paid") {
        const purchase = safeNumber(next.purchase_price) ?? 0;
        const deposit = safeNumber(next.deposit_paid) ?? 0;
        next.balance_outstanding = String(Math.max(0, purchase - deposit));
      }
      return next;
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/website-leads/${lead.id}/book-into-stock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, image_urls: images }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to book into stock.");
      onBooked(String(payload.stock.id), payload.stock.stock_number);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to book into stock.");
    } finally {
      setSaving(false);
    }
  }
  return <div className="website-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="book-stock-title">
    <form className="website-book-modal" onSubmit={submit}>
      <header><div><h2 id="book-stock-title">Book Into Stock</h2><p>Reserve a stock number and create a Purchase Pending stock record.</p></div><button type="button" onClick={onClose}>Close</button></header>
      {result ? <div className="website-book-success"><b>Purchase pending stock created.</b><span>{result.stockNumber ? `Stock number ${result.stockNumber}` : "Stock number reserved"}</span><Link href={`/admin/stock/${result.stockId}`}>Open pending stock record</Link></div> : <>
        {error && <div className="website-card-error">{error}</div>}
        <div className="website-book-grid">
          <Input label="Registration" value={form.registration} set={v => setField("registration", v)} />
          <Input label="Make" value={form.make} set={v => setField("make", v)} required />
          <Input label="Model" value={form.model} set={v => setField("model", v)} required />
          <Input label="Variant" value={form.variant} set={v => setField("variant", v)} />
          <Input label="Year" value={form.year} set={v => setField("year", v)} type="number" />
          <Input label="Mileage" value={form.mileage} set={v => setField("mileage", v)} type="number" />
          <Input label="Customer name" value={form.customer_name} set={v => setField("customer_name", v)} />
          <Input label="Customer phone" value={form.customer_phone} set={v => setField("customer_phone", v)} />
          <Input label="Customer email" value={form.customer_email} set={v => setField("customer_email", v)} />
          <Input label="Customer postcode" value={form.customer_postcode} set={v => setField("customer_postcode", v)} />
          <label className="full"><span>Customer address</span><textarea value={form.customer_address} onChange={event => setField("customer_address", event.target.value)} /></label>
          <label className="full"><span>Collection notes</span><textarea value={form.collection_notes} onChange={event => setField("collection_notes", event.target.value)} /></label>
          <Input label="Agreed purchase price" value={form.purchase_price} set={v => setField("purchase_price", v)} type="number" />
          <Input label="Target retail price" value={form.target_retail_price} set={v => setField("target_retail_price", v)} type="number" />
          <Input label="Minimum retail price" value={form.minimum_retail_price} set={v => setField("minimum_retail_price", v)} type="number" />
          <Input label="Estimated prep cost" value={form.estimated_preparation_cost} set={v => setField("estimated_preparation_cost", v)} type="number" />
          <Input label="Estimated transport cost" value={form.estimated_transport_cost} set={v => setField("estimated_transport_cost", v)} type="number" />
          <Input label="Other estimated costs" value={form.other_estimated_costs} set={v => setField("other_estimated_costs", v)} type="number" />
          <Input label="Deposit paid" value={form.deposit_paid} set={v => setField("deposit_paid", v)} type="number" />
          <Input label="Balance outstanding" value={form.balance_outstanding} set={v => setField("balance_outstanding", v)} type="number" />
          <Input label="Expected arrival date" value={form.expected_arrival_date} set={v => setField("expected_arrival_date", v)} type="date" />
          <label><span>Payment status</span><select value={form.payment_status} onChange={event => setField("payment_status", event.target.value)}><option>Unpaid</option><option>Deposit Paid</option><option>Part Paid</option><option>Paid</option></select></label>
          <label className="full"><span>Purchase notes</span><textarea value={form.purchase_notes} onChange={event => setField("purchase_notes", event.target.value)} /></label>
          <div className="full website-book-finance"><span>Estimated total cost: {formatGbp(total)}</span><span>Expected profit: {formatGbp(profit)}</span><span>Lead ID: {lead.id}</span><span>{images.length} image URLs will be copied</span></div>
        </div>
        <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Booking..." : "Confirm Purchase Pending"}</button></footer>
      </>}
    </form>
  </div>;
}

const defaultShare: ReferralShareOptions = { registration: true, makeModel: true, year: true, mileage: true, askingPrice: true, condition: true, serviceHistory: true, mot: true, town: true, partialPostcode: true, fullPostcode: false, photos: true, customerNotes: true, customerName: false, customerPhone: false, customerEmail: false, fullAddress: false };

function ReferralModal({ lead, onClose, onReferred }: { lead: WebsiteLead; onClose: () => void; onReferred: (lead: WebsiteLead) => void }) {
  const [dealers, setDealers] = useState<DealerContact[]>([]);
  const [dealerId, setDealerId] = useState("");
  const [method, setMethod] = useState<"email" | "whatsapp" | "sms">("email");
  const [share, setShare] = useState<ReferralShareOptions>(defaultShare);
  const [consent, setConsent] = useState("Share motorcycle details only");
  const [confirmed, setConfirmed] = useState(false);
  const [subject, setSubject] = useState(() => referralSubject(lead));
  const [message, setMessage] = useState(() => referralMessage(lead, null, defaultShare));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selected = dealers.find(dealer => dealer.id === dealerId) ?? null;
  const includesPersonal = share.customerName || share.customerPhone || share.customerEmail || share.fullAddress || share.fullPostcode;

  useEffect(() => {
    fetch("/api/dealer-contacts?active=true").then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load dealers.");
      setDealers(payload.dealers ?? []);
    }).catch(error => setError(error instanceof Error ? error.message : "Unable to load dealers."));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (selected?.preferred_contact_method === "whatsapp" || selected?.preferred_contact_method === "sms" || selected?.preferred_contact_method === "email") setMethod(selected.preferred_contact_method);
      setMessage(referralMessage(lead, selected, share));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dealerId, lead, selected, share]);

  function toggle(key: keyof ReferralShareOptions) {
    setShare(current => {
      const next = { ...current, [key]: !current[key] };
      setMessage(referralMessage(lead, selected, next));
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dealerId) { setError("Select a dealer contact."); return; }
    if (includesPersonal && (!confirmed || consent === "Consent not confirmed" || consent === "Share motorcycle details only")) { setError("Confirm customer permission before sharing personal details."); return; }
    setSaving(true);
    setError("");
    const response = await fetch(`/api/website-leads/${lead.id}/referrals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealer_contact_id: dealerId, communication_method: method, share_options: share, customer_consent_confirmed: confirmed, customer_consent_source: consent, message_subject: subject, message_body: message }) });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Unable to record referral.");
      setSaving(false);
      return;
    }
    const url = payload.urls?.[method === "email" ? "mailto" : method];
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    const refreshed = await fetch(`/api/website-leads/${lead.id}`);
    const refreshedPayload = await refreshed.json();
    onReferred(refreshed.ok ? refreshedPayload.lead : { ...lead, status: "referred_to_dealer", latest_referred_dealer_name: selected?.dealer_name, latest_referred_at: new Date().toISOString(), referral_count: (lead.referral_count ?? 0) + 1 });
  }

  return <div className="website-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="refer-lead-title">
    <form className="website-book-modal referral-modal" onSubmit={submit}>
      <header><div><h2 id="refer-lead-title">Send to Dealer</h2><p>Review exactly what will be shared before opening email, WhatsApp or SMS.</p></div><button type="button" onClick={onClose}>Close</button></header>
      {lead.stock_bike_id && <div className="referral-warning"><b>Purchase warning</b><span>This lead is linked to active stock. Confirm internally before referring it to another dealer.</span></div>}
      {error && <div className="website-card-error">{error}</div>}
      <div className="referral-grid">
        <section><h3>1. Select Dealer</h3><select value={dealerId} onChange={event => setDealerId(event.target.value)} required><option value="">Choose dealer</option>{dealers.map(dealer => <option value={dealer.id} key={dealer.id}>{dealer.dealer_name} {dealer.town ? `- ${dealer.town}` : ""}</option>)}</select>{selected && <p>{selected.contact_name || "No named contact"} · {selected.email || selected.mobile_number || selected.whatsapp_number || "No preferred contact shown"}</p>}<a href="/dealer-contacts" target="_blank" rel="noreferrer">Manage dealer contacts</a></section>
        <section><h3>2. Communication</h3><div className="referral-methods">{(["email", "whatsapp", "sms"] as const).map(item => <label key={item}><input type="radio" checked={method === item} onChange={() => setMethod(item)} />{item.toUpperCase()}</label>)}</div><p>{method === "email" ? "Opens your email app with a prepared message." : method === "whatsapp" ? "Opens WhatsApp. This records that WhatsApp was opened, not delivered." : "Opens the SMS app where supported. Desktop support varies."}</p></section>
        <section className="full"><h3>3. Information to Share</h3><div className="referral-checks">{Object.entries(share).map(([key, value]) => <label key={key}><input type="checkbox" checked={value} onChange={() => toggle(key as keyof ReferralShareOptions)} />{shareLabel(key)}</label>)}</div></section>
        <section className="full"><h3>4. Consent Confirmation</h3>{includesPersonal ? <div className="referral-consent"><p>You are about to share customer details with {selected?.dealer_name || "the selected dealer"}.</p><select value={consent} onChange={event => setConsent(event.target.value)}><option>Consent not confirmed</option><option>Customer consent confirmed by telephone</option><option>Customer consent confirmed by email</option><option>Consent recorded on website form</option></select><label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm YesMoto has permission to share the selected customer details.</label></div> : <p>Motorcycle details only. No direct customer contact details selected.</p>}</section>
        <section className="full"><h3>5. Review Message</h3><input value={subject} onChange={event => setSubject(event.target.value)} /><textarea rows={13} value={message} onChange={event => setMessage(event.target.value)} /></section>
      </div>
      <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Recording..." : method === "email" ? "Prepare Email" : method === "whatsapp" ? "Open WhatsApp" : "Open SMS"}</button></footer>
    </form>
  </div>;
}

function referralSubject(lead: WebsiteLead) {
  return `Motorcycle purchase lead - ${[lead.year, lead.make, lead.model].filter(Boolean).join(" ") || lead.reg || "Website enquiry"}`;
}

function referralMessage(lead: WebsiteLead, dealer: DealerContact | null, share: ReferralShareOptions) {
  const bike = [lead.year, lead.make, lead.model].filter(Boolean).join(" ") || "Motorcycle purchase enquiry";
  const location = [lead.location_town, share.fullPostcode ? lead.normalised_postcode || lead.postcode : (lead.normalised_postcode || lead.postcode || "").split(/\s+/)[0]].filter(Boolean).join(", ");
  const rows = [`Hi ${dealer?.contact_name || dealer?.dealer_name || "there"},`, "", "We have received the following motorcycle purchase enquiry, but it is not one we are looking to buy at the moment.", "", "Motorcycle:"];
  if (share.makeModel) rows.push(bike);
  if (share.registration && lead.reg) rows.push(`Registration: ${lead.reg}`);
  if (share.mileage && lead.mileage) rows.push(`Mileage: ${formatMileage(lead.mileage)}`);
  if (share.askingPrice && lead.price) rows.push(`Customer asking price: ${lead.price}`);
  if ((share.town || share.partialPostcode || share.fullPostcode) && location) rows.push(`Location: ${location}`);
  const notes = [share.condition ? lead.bike_condition || lead.damage : "", share.serviceHistory ? lead.service || lead.history : "", share.mot ? lead.mot : "", share.customerNotes ? lead.extras : ""].filter((value): value is string => Boolean(value));
  if (notes.length) rows.push("", "Condition and notes:", ...notes);
  rows.push("", "Customer contact details:");
  const customer = [share.customerName ? customerName(lead) : "", share.customerPhone ? lead.phone : "", share.customerEmail ? lead.email : "", share.fullAddress ? [lead.location_display_name, lead.normalised_postcode || lead.postcode].filter(Boolean).join(", ") : ""].filter((value): value is string => Boolean(value));
  rows.push(...(customer.length ? customer : ["Not included."]));
  rows.push("", "Please contact us or the customer directly if this motorcycle may be of interest.", "", "Regards,", "YesMoto");
  return rows.join("\n");
}

function shareLabel(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, char => char.toUpperCase());
}

function Input({ label, value, set, type = "text", required = false }: { label: string; value: string; set: (value: string) => void; type?: string; required?: boolean }) {
  return <label><span>{label}</span><input type={type} value={value} required={required} min={type === "number" ? "0" : undefined} onChange={event => set(event.target.value)} /></label>;
}

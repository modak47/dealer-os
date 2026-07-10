"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { combineLeadImages, customerName, formatGbp, formatLeadDate, formatMileage, safeNumber, statusBadgeClass, statusLabel } from "@/lib/website-leads";
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
  const [cardErrors, setCardErrors] = useState<Record<number, string>>({});

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
    {!loading && !error && <section className="website-card-grid">{filtered.map(lead => <LeadCard lead={lead} running={runningId === lead.id} error={cardErrors[lead.id]} onRun={() => void runValuation(lead)} key={lead.id} />)}</section>}
  </main>;
}

function LeadCard({ lead, running, error, onRun }: { lead: WebsiteLead; running: boolean; error?: string; onRun: () => void }) {
  const router = useRouter();
  const images = lead.resolved_images ?? combineLeadImages(lead);
  const margin = safeNumber(lead.estimated_margin);
  const processing = lead.valuation_status === "processing";
  const hasReg = Boolean(lead.reg?.trim());
  const runLabel = processing ? "Valuation in progress" : running ? "Valuing..." : lead.retail_check_id && lead.valuation_status === "completed" ? "Re-run Valuation" : "Run Retail Check";
  return <article className="website-lead-card" onClick={() => router.push(`/website-leads/${lead.id}`)}>
    <div className="website-lead-photo">{images[0] ? <img src={images[0]} alt={`${lead.make ?? "Motorcycle"} ${lead.model ?? ""}`} onError={event => { event.currentTarget.style.display = "none"; }} /> : <span>No image</span>}<b>{images.length} photos</b></div>
    <div className="website-lead-card-body">
      <div className="website-lead-title"><span>{lead.reg || "No reg"}</span><h2>{[lead.make, lead.model].filter(Boolean).join(" ") || "Bike details pending"}</h2><p>{lead.year || "Year unknown"} · {formatMileage(lead.mileage)} · {lead.engine || "Engine n/a"}</p></div>
      <div className="website-card-badges"><span className="website-badge source">{lead.website || "unknown"}</span><span className={statusBadgeClass(lead.status)}>{statusLabel(lead.status)}</span><span className="website-badge">{statusLabel(lead.valuation_status || "pending")}</span></div>
      <dl className="website-lead-facts">
        <div><dt>Customer</dt><dd>{customerName(lead)}</dd></div><div><dt>Phone</dt><dd>{lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : "Not set"}</dd></div><div><dt>Email</dt><dd>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : "Not set"}</dd></div><div><dt>Postcode</dt><dd>{lead.postcode || "Not set"}</dd></div>
        <div><dt>Received</dt><dd>{formatLeadDate(lead.date || lead.created_at)}</dd></div><div><dt>Asking</dt><dd>{lead.price || "Not set"}</dd></div><div><dt>Market Retail</dt><dd>{formatGbp(lead.retail_estimate)}</dd></div><div><dt>Suggested Offer</dt><dd>{formatGbp(lead.suggested_offer)}</dd></div><div className="highlight"><dt>Estimated Margin</dt><dd>{margin === null ? "Not set" : formatGbp(margin)}</dd></div>
      </dl>
      {error && <div className="website-card-error">{error}</div>}
      <div className="website-card-actions" onClick={event => event.stopPropagation()}>
        {hasReg ? <button disabled={running || processing} onClick={onRun}>{runLabel}</button> : <span>Registration required</span>}
        {lead.retail_check_id && <Link href={`/admin/retail-check?recordId=${encodeURIComponent(lead.retail_check_id)}&leadId=${lead.id}`}>View Valuation</Link>}
        <Link href={`/website-leads/${lead.id}`}>View Lead</Link>
      </div>
    </div>
  </article>;
}

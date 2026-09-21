"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatGbp, formatLeadDate, formatMileage, statusLabel } from "@/lib/website-leads";
import { WEBSITE_LEAD_STATUSES } from "@/types/website-lead";
import type { LeadCounts, LeadListPage, LeadListRow, LeadView } from "@/lib/website-lead-list";

const views: [LeadView, string][] = [["all", "All leads"], ["needs_review", "Needs Review"], ["ready", "Ready to Release"], ["released", "Released"], ["active", "Claimed / Marketplace Live"], ["closed", "Closed"], ["archived", "Archived"], ["backlog", "Backlog / Older"]];
const sources = [["motorgeeks", "MotorGeeks"], ["bike_buyer_uk", "Bike Buyer UK"], ["sell_your_motorbike", "Sell Your Motorbike"], ["motorcyclebuyer", "Motorcycle Buyer"]];
type Result = { id: number; ok: boolean; error?: string };
export function LeadBrowser({ queue = false, dealers = [] }: { queue?: boolean; dealers?: { id: string; trading_name: string }[] }) {
  const [view, setView] = useState<LeadView>(queue ? "needs_review" : "all");
  const [query, setQuery] = useState(""), [search, setSearch] = useState("");
  const [period, setPeriod] = useState(queue ? "30" : "all"), [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [source, setSource] = useState(""), [mode, setMode] = useState(""), [status, setStatus] = useState(""), [review, setReview] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState<LeadListPage>({ leads: [], nextCursor: null, hasMore: false });
  const [counts, setCounts] = useState<LeadCounts | null>(null);
  const [loading, setLoading] = useState(true), [moreLoading, setMoreLoading] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(""), [countError, setCountError] = useState("");
  const [selected, setSelected] = useState<number[]>([]), [results, setResults] = useState<Result[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [method, setMethod] = useState("matching_pool"), [dealerIds, setDealerIds] = useState<string[]>([]), [override, setOverride] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 300); return () => clearTimeout(timer); }, [query]);
  const params = useMemo(() => new URLSearchParams({ view, q: search, period: search ? "all" : period, from, to, source, mode, status, review, include_archived: String(includeArchived), limit: "50" }).toString(), [view, search, period, from, to, source, mode, status, review, includeArchived]);
  const validRange = period !== "custom" || Boolean(from && to && from <= to) || Boolean(search);
  const getPage = useCallback(async (cursor: string | null, signal?: AbortSignal) => {
    const response = await fetch(`/api/website-leads?${params}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", signal });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load leads.");
    return payload as LeadListPage;
  }, [params]);
  useEffect(() => {
    const controller = new AbortController();
    if (!validRange) return () => controller.abort();
    // Clear the previous page immediately; selections never cross a filter change.
    const timer = setTimeout(() => {
      setLoading(true); setError(""); setSelected([]); setPage({ leads: [], nextCursor: null, hasMore: false });
      getPage(null, controller.signal).then(setPage).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [getPage, refresh, validRange]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/website-leads?counts=true", { cache: "no-store", signal: controller.signal }).then(async r => { const p = await r.json(); if (!r.ok) throw new Error(p.error); setCounts(p.summary); setCountError(""); }).catch(e => { if (!controller.signal.aborted) setCountError(e.message); });
    return () => controller.abort();
  }, [refresh]);
  async function loadMore() {
    if (!page.nextCursor || moreLoading) return;
    setMoreLoading(true); setError("");
    try { const next = await getPage(page.nextCursor); setPage(current => ({ ...next, leads: [...current.leads, ...next.leads.filter(row => !current.leads.some(old => old.id === row.id))] })); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load more."); }
    finally { setMoreLoading(false); }
  }
  function changeSearch(value: string) {
    if (value && !query) { setView("all"); setPeriod("all"); setSource(""); setMode(""); setStatus(""); setReview(""); }
    setQuery(value);
  }
  function chooseView(next: LeadView) { setView(next); setSelected([]); setReview(""); if (["ready", "backlog", "archived", "closed", "released", "active", "all"].includes(next)) setPeriod("all"); }
  async function bulk(action: "review" | "ready" | "archive" | "release") {
    if (!selected.length || saving) return;
    if (action === "archive" && !window.confirm(`Archive ${selected.length} selected leads? Active opportunities will be refused. Records remain searchable.`)) return;
    setSaving(true); setResults([]); setError("");
    try {
      if (action === "release") {
        const outcome: Result[] = [];
        for (const id of selected) {
          try {
            const r = await fetch("/api/dealer-portal/admin/release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ website_lead_id: id, allocation_method: method, dealer_account_ids: method === "matching_pool" ? [] : dealerIds, allow_previous_dealer_reclaim: override && method !== "matching_pool" }) });
            const p = await r.json(); outcome.push({ id, ok: r.ok, error: p.error });
          } catch { outcome.push({ id, ok: false, error: "Request failed. Refresh before retrying to check whether release completed." }); }
        }
        setResults(outcome);
      } else {
        const r = await fetch("/api/website-leads/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selected, action }) });
        const p = await r.json(); if (!r.ok) throw new Error(p.error); setResults(p.results);
      }
      setSelected([]); setRefresh(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); }
    finally { setSaving(false); }
  }
  const kpis = counts ? [["Total Leads", counts.total], ["Needs Review", counts.needsReview], ["Ready", counts.ready], ["Released", counts.released], ["Received Today", counts.receivedToday], ["Pending Valuations", counts.pendingValuations]] : [];
  return <section className="lead-browser" aria-label={queue ? "Dealer release workspace" : "Website lead browser"}>
    <section className="website-kpis">{kpis.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    {countError && <p role="status">Totals unavailable. {countError}</p>}
    <nav className="lead-view-tabs" aria-label="Lead workflow views">{views.map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => chooseView(key)} disabled={saving || moreLoading}>{label}</button>)}</nav>
    <div className="lead-browser-filters">
      <label className="lead-global-search">Search All history<input value={query} onChange={e => changeSearch(e.target.value)} placeholder="ID, registration, bike, name, email, phone or postcode" disabled={saving || moreLoading} /></label>
      <label>Date<select aria-label="Date" value={search ? "all" : period} onChange={e => setPeriod(e.target.value)} disabled={Boolean(query) || saving || moreLoading}><option value="all">All history</option><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom range</option></select></label>
      {period === "custom" && !search && <><label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)} disabled={saving || moreLoading}/></label><label>To<input type="date" value={to} onChange={e => setTo(e.target.value)} disabled={saving || moreLoading}/></label></>}
      <label>Source<select aria-label="Source" value={source} onChange={e => setSource(e.target.value)} disabled={saving || moreLoading}><option value="">All sources</option>{[...new Set([...sources.map(([v]) => v), ...(counts?.sourceOptions ?? []).filter(Boolean)])].map(v => <option key={v} value={v}>{sources.find(([s]) => s === v)?.[1] || statusLabel(v)}</option>)}</select></label>
      <label>Opportunity mode<select aria-label="Opportunity mode" value={mode} onChange={e => setMode(e.target.value)} disabled={saving || moreLoading}><option value="">Both modes</option><option value="direct_claim">Direct claim</option><option value="marketplace_offer">Marketplace offer</option></select></label>
      <label>Lead / Portal state<select aria-label="Lead / Portal state" value={status} onChange={e => setStatus(e.target.value)} disabled={saving || moreLoading}><option value="">All states</option>{[...new Set([...WEBSITE_LEAD_STATUSES, "submitted", "under_review", "live_to_dealers", "offer_received", "offer_accepted", "purchase_pending", "cancelled"])].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label>
      <label>Review<select aria-label="Review" value={review} onChange={e => setReview(e.target.value)} disabled={saving || moreLoading}><option value="">Any review state</option><option value="not_reviewed">Not reviewed</option><option value="reviewed">Reviewed</option></select></label>
      <label className="lead-inline-check"><input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} disabled={saving || moreLoading}/>Include archived</label>
      <button type="button" disabled={saving || moreLoading} onClick={() => { setQuery(""); setSearch(""); setPeriod("all"); setView("all"); setSource(""); setMode(""); setStatus(""); setReview(""); setIncludeArchived(false); }}>Clear filters</button>
    </div>
    <p className="lead-browser-help">{search ? "Searching All history. Source, mode and state filters apply only when selected." : view === "backlog" ? "Older than 30 days. Review historical leads deliberately before marking them Ready." : "Dates use Europe/London time. Estimated received dates are labelled."}</p>
    {!validRange && <p role="alert">Choose a valid start and end date.</p>}
    <div className="lead-bulk-bar"><span>{selected.length} selected (maximum 50)</span><button type="button" disabled={saving || loading || !validRange} onClick={() => setSelected(page.leads.slice(0, 50).map(l => l.id))}>Select first 50 shown</button><button type="button" onClick={() => setSelected([])} disabled={saving || !selected.length}>Clear selection</button><button type="button" disabled={saving || !selected.length || !validRange} onClick={() => void bulk("review")}>Mark reviewed</button><button type="button" disabled={saving || !selected.length || !validRange} onClick={() => void bulk("ready")}>Ready for Dealer Portal</button><button type="button" disabled={saving || !selected.length || !validRange} onClick={() => void bulk("archive")}>Archive</button></div>
    {queue && <div className="lead-release-options"><label>Distribution<select aria-label="Distribution" value={method} disabled={saving} onChange={e => { setMethod(e.target.value); setDealerIds([]); setOverride(false); }}><option value="matching_pool">Matching dealers</option><option value="direct">Specific dealer</option><option value="dealer_group">Dealer group</option></select></label>{method !== "matching_pool" && <fieldset><legend>Choose dealers</legend>{dealers.map(d => <label className="lead-inline-check" key={d.id}><input type="checkbox" disabled={saving} checked={dealerIds.includes(d.id)} onChange={() => setDealerIds(ids => method === "direct" ? [d.id] : ids.includes(d.id) ? ids.filter(id => id !== d.id) : [...ids, d.id])}/>{d.trading_name}</label>)}<label className="lead-inline-check"><input type="checkbox" checked={override} disabled={saving} onChange={e => setOverride(e.target.checked)}/>Allow selected previous dealers to reclaim</label></fieldset>}<button type="button" disabled={saving || !selected.length || !validRange || (method !== "matching_pool" && !dealerIds.length) || selected.some(id => !page.leads.find(l => l.id === id)?.portal_ready_at)} onClick={() => void bulk("release")}>{saving ? "Working…" : "Release selected Ready leads"}</button><p>Direct leads use first-to-claim. Marketplace leads open for dealer offers.</p></div>}
    {!!results.length && <div className="website-state" role="status"><p>{results.filter(r => r.ok).length} succeeded; {results.filter(r => !r.ok).length} refused or failed.</p><ul>{results.map(r => <li key={r.id}>#{r.id}: {r.ok ? "Completed" : r.error}</li>)}</ul></div>}
    {error && <div className="website-state error" role="alert">{error}<button type="button" onClick={() => setRefresh(n => n + 1)}>Retry</button></div>}
    <p className="website-result-count" aria-live="polite">{loading ? "Loading leads…" : `${page.leads.length} leads loaded${page.hasMore ? " — more available" : ""}`}</p>
    {!loading && !error && !page.leads.length && <div className="website-state">No leads match these filters.</div>}
    {validRange && <div className="lead-summary-grid" aria-busy={loading}>{page.leads.map(lead => <LeadSummaryCard key={lead.id} lead={lead} selected={selected.includes(lead.id)} disabled={saving || moreLoading || (selected.length >= 50 && !selected.includes(lead.id))} toggle={() => setSelected(ids => ids.includes(lead.id) ? ids.filter(id => id !== lead.id) : [...ids, lead.id])}/>)}</div>}
    {page.hasMore && validRange && <div className="lead-pagination"><button type="button" onClick={() => void loadMore()} disabled={moreLoading || loading || saving}>{moreLoading ? "Loading…" : "Load more (50)"}</button></div>}
  </section>;
}
function LeadSummaryCard({ lead, selected, disabled, toggle }: { lead: LeadListRow; selected: boolean; disabled: boolean; toggle: () => void }) {
  const [failed, setFailed] = useState(false);
  return <article className="website-lead-card lead-summary-card">
    <label className="lead-inline-check"><input type="checkbox" checked={selected} disabled={disabled} onChange={toggle}/>Select #{lead.id}</label>
    <Link className="lead-summary-thumb" href={`/website-leads/${lead.id}`} prefetch={false}>{lead.thumbnail_url && !failed ? <img src={lead.thumbnail_url} alt={`${lead.make || "Motorcycle"} ${lead.model || ""}`} loading="lazy" decoding="async" width="320" height="180" onError={() => setFailed(true)}/> : <span>{failed ? "Photo unavailable" : "No photo"}</span>}<small>{lead.photo_count} photos</small></Link>
    <div className="website-lead-card-body"><h2><Link href={`/website-leads/${lead.id}`} prefetch={false}>{lead.reg || "No registration"} · {[lead.make, lead.model].filter(Boolean).join(" ") || "Details pending"}</Link></h2><p>{lead.year || "Year unknown"} · {formatMileage(lead.mileage)}</p>
      <div className="website-card-badges"><span className="website-badge">{lead.opportunity_mode === "marketplace_offer" ? "Marketplace offer" : "Direct claim"}</span><span className="website-badge">{statusLabel(lead.opportunity_mode === "marketplace_offer" ? lead.marketplace_status : lead.status)}</span>{lead.portal_ready_at && <span className="website-badge badge-new">Ready</span>}{lead.archived_at && <span className="website-badge">Archived</span>}</div>
      <dl className="website-lead-facts"><div><dt>Received</dt><dd>{formatLeadDate(lead.received_at)}{lead.received_date_basis?.includes(":") && <small>Estimated — source date needs review</small>}</dd></div><div><dt>Source</dt><dd>{sources.find(([s]) => s === lead.lead_source)?.[1] || lead.lead_source || "Unknown"}</dd></div><div><dt>Location</dt><dd>{lead.location_town || "Not supplied"}</dd></div><div><dt>Asking</dt><dd>{lead.price || "Not supplied"}</dd></div><div><dt>Suggested offer</dt><dd>{formatGbp(lead.suggested_offer)}</dd></div><div><dt>Vehicle check</dt><dd>{statusLabel(lead.vehicle_check_status || "pending")}</dd></div><div><dt>Review</dt><dd>{lead.portal_reviewed_at ? "Reviewed" : "Not reviewed"}</dd></div></dl>
      <Link className="lead-open" href={`/website-leads/${lead.id}`} prefetch={false}>Open lead</Link>
    </div>
  </article>;
}

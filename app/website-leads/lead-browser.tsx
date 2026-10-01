"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatAskingPrice, formatLeadDate, formatMileage, statusLabel } from "@/lib/website-leads";
import { WEBSITE_LEAD_STATUSES } from "@/types/website-lead";
import type { LeadCounts, LeadListPage, LeadListRow, LeadView } from "@/lib/website-lead-list";

type Result = { id: number; ok: boolean; error?: string };
type Workspace = "intake" | "distribution";
type DealerOption = { id: string; trading_name: string };

const sourceLabels: Record<string, string> = { motorgeeks: "MotorGeeks", bike_buyer_uk: "Bike Buyer UK", sell_your_motorbike: "Sell Your Motorbike", motorcyclebuyer: "Motorcycle Buyer" };
const intakeViews: [LeadView, string, keyof LeadCounts][] = [["needs_review", "New Leads", "needsReview"], ["ready", "Ready", "ready"], ["released", "Sent to Dealers", "released"], ["closed", "Closed", "closed"], ["archived", "Archive", "archived"]];
const distributionViews: [LeadView, string, keyof LeadCounts][] = [["ready", "Ready to Send", "ready"], ["live", "Live", "live"], ["offers", "Offers", "offers"], ["deals_agreed", "Deals Agreed", "dealsAgreed"], ["completed", "Completed", "completed"]];

export function LeadBrowser({ workspace = "intake", dealers = [] }: { workspace?: Workspace; dealers?: DealerOption[] }) {
  const distribution = workspace === "distribution";
  const defaultView: LeadView = distribution ? "ready" : "needs_review";
  const workflowViews = distribution ? distributionViews : intakeViews;
  const [view, setView] = useState<LeadView>(defaultView);
  const [query, setQuery] = useState(""), [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [period, setPeriod] = useState("all"), [from, setFrom] = useState(""), [to, setTo] = useState("");
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
  const activeFilterCount = [period !== "all", Boolean(source), Boolean(mode), Boolean(status), Boolean(review), includeArchived].filter(Boolean).length;

  const getPage = useCallback(async (cursor: string | null, signal?: AbortSignal) => {
    const response = await fetch(`/api/website-leads?${params}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", signal });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load leads.");
    return payload as LeadListPage;
  }, [params]);

  useEffect(() => {
    const controller = new AbortController();
    if (!validRange) return () => controller.abort();
    const timer = setTimeout(() => {
      setLoading(true); setError(""); setSelected([]); setPage({ leads: [], nextCursor: null, hasMore: false });
      getPage(null, controller.signal).then(setPage).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [getPage, refresh, validRange]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/website-leads?counts=true", { cache: "no-store", signal: controller.signal }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setCounts(payload.summary); setCountError("");
    }).catch(e => { if (!controller.signal.aborted) setCountError(e.message); });
    return () => controller.abort();
  }, [refresh]);

  async function loadMore() {
    if (!page.nextCursor || moreLoading) return;
    setMoreLoading(true); setError("");
    try { const next = await getPage(page.nextCursor); setPage(current => ({ ...next, leads: [...current.leads, ...next.leads.filter(row => !current.leads.some(old => old.id === row.id))] })); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load more."); }
    finally { setMoreLoading(false); }
  }

  function chooseView(next: LeadView) { setView(next); setSelected([]); setPeriod("all"); setReview(""); setIncludeArchived(next === "archived"); }
  function changeSearch(value: string) { if (value && !query) { setView("all"); setPeriod("all"); } if (!value && query) setView(defaultView); setQuery(value); }
  function clearFilters() { setQuery(""); setSearch(""); setPeriod("all"); setFrom(""); setTo(""); setView(defaultView); setSource(""); setMode(""); setStatus(""); setReview(""); setIncludeArchived(false); setSelected([]); }

  async function bulk(action: "review" | "ready" | "archive" | "release") {
    if (!selected.length || saving) return;
    if (action === "archive" && !window.confirm(`Archive ${selected.length} selected leads? Active opportunities will be refused. Records remain searchable.`)) return;
    setSaving(true); setResults([]); setError("");
    try {
      if (action === "release") {
        const outcome: Result[] = [];
        for (const id of selected) {
          try {
            const response = await fetch("/api/dealer-portal/admin/release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ website_lead_id: id, allocation_method: method, dealer_account_ids: method === "matching_pool" ? [] : dealerIds, allow_previous_dealer_reclaim: override && method !== "matching_pool" }) });
            const payload = await response.json(); outcome.push({ id, ok: response.ok, error: payload.error });
          } catch { outcome.push({ id, ok: false, error: "Request failed. Refresh before retrying to check whether release completed." }); }
        }
        setResults(outcome);
      } else {
        const response = await fetch("/api/website-leads/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selected, action }) });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setResults(payload.results);
      }
      setSelected([]); setRefresh(value => value + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); }
    finally { setSaving(false); }
  }

  const availableSources = [...new Set(["motorgeeks", "sell_your_motorbike", "bike_buyer_uk", ...(counts?.sourceOptions ?? []).filter(Boolean)])];
  const detailOrigin = distribution ? "?origin=dealer-portal" : "";

  return <section className={`lead-browser lead-browser-${workspace}`} aria-label={distribution ? "Dealer distribution workspace" : "Website lead inbox"}>
    <nav className="lead-workflow-tabs" aria-label={distribution ? "Dealer distribution stages" : "Lead inbox stages"}>{workflowViews.map(([key, label, countKey]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => chooseView(key)} disabled={saving || moreLoading}><span>{label}</span>{counts && <b>{Number(counts[countKey] ?? 0)}</b>}</button>)}</nav>
    {countError && <p className="lead-browser-help" role="status">Counts unavailable. {countError}</p>}

    {!distribution && <div className="lead-source-chips" aria-label="Filter leads by source"><button type="button" aria-pressed={!source} onClick={() => setSource("")}>All sources</button>{availableSources.map(value => <button type="button" key={value} aria-pressed={source === value} onClick={() => { setSource(value); setView("needs_review"); }}>{sourceLabels[value] || statusLabel(value)}</button>)}</div>}

    <div className="lead-search-row"><label className="lead-global-search"><span className="sr-only">Search all lead history</span><input aria-label="Search all lead history" value={query} onChange={event => changeSearch(event.target.value)} placeholder={distribution ? "Search registration, motorcycle, location or reference" : "Search registration, motorcycle, customer or reference"} disabled={saving || moreLoading} /></label><button type="button" className="lead-filter-toggle" aria-expanded={filtersOpen} aria-controls={`lead-filters-${workspace}`} onClick={() => setFiltersOpen(value => !value)}>Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</button></div>

    {filtersOpen && <div className="lead-browser-filters" id={`lead-filters-${workspace}`}><label>Date<select aria-label="Date" value={search ? "all" : period} onChange={event => setPeriod(event.target.value)} disabled={Boolean(query) || saving || moreLoading}><option value="all">All history</option><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom range</option></select></label>{period === "custom" && !search && <><label>From<input type="date" value={from} onChange={event => setFrom(event.target.value)} disabled={saving || moreLoading} /></label><label>To<input type="date" value={to} onChange={event => setTo(event.target.value)} disabled={saving || moreLoading} /></label></>}<label>Source<select aria-label="Source" value={source} onChange={event => setSource(event.target.value)} disabled={saving || moreLoading}><option value="">All sources</option>{availableSources.map(value => <option key={value} value={value}>{sourceLabels[value] || statusLabel(value)}</option>)}</select></label><label>Opportunity mode<select aria-label="Opportunity mode" value={mode} onChange={event => setMode(event.target.value)} disabled={saving || moreLoading}><option value="">Both modes</option><option value="direct_claim">Direct claim</option><option value="marketplace_offer">Marketplace offer</option></select></label><label>Lead / portal state<select aria-label="Lead / Portal state" value={status} onChange={event => setStatus(event.target.value)} disabled={saving || moreLoading}><option value="">All states</option>{[...new Set([...WEBSITE_LEAD_STATUSES, "submitted", "under_review", "live_to_dealers", "offer_received", "offer_accepted", "purchase_pending", "cancelled"])].map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label><label>Review<select aria-label="Review" value={review} onChange={event => setReview(event.target.value)} disabled={saving || moreLoading}><option value="">Any review state</option><option value="not_reviewed">Not reviewed</option><option value="reviewed">Reviewed</option></select></label><label className="lead-inline-check"><input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} disabled={saving || moreLoading} />Include archived</label><button type="button" disabled={saving || moreLoading} onClick={clearFilters}>Clear filters</button></div>}

    <div className="lead-results-head"><p className="website-result-count" aria-live="polite">{loading ? "Loading leads..." : `${page.leads.length} leads loaded${page.hasMore ? " - more available" : ""}`}</p>{!loading && page.leads.length > 0 && <button type="button" className="lead-select-shown" disabled={saving || !validRange} onClick={() => setSelected(page.leads.slice(0, 50).map(lead => lead.id))}>Select shown</button>}</div>
    {search && <p className="lead-browser-help">Searching full lead history. Selected filters still apply.</p>}
    {!validRange && <p role="alert">Choose a valid start and end date.</p>}

    {selected.length > 0 && <div className="lead-bulk-bar"><strong>{selected.length} selected</strong><button type="button" onClick={() => setSelected([])} disabled={saving}>Clear selection</button>{distribution ? <><label>Distribution<select aria-label="Distribution" value={method} disabled={saving} onChange={event => { setMethod(event.target.value); setDealerIds([]); setOverride(false); }}><option value="matching_pool">Matching dealers</option><option value="direct">Specific dealer</option><option value="dealer_group">Dealer group</option></select></label>{method !== "matching_pool" && <fieldset><legend>Choose dealers</legend>{dealers.map(dealer => <label className="lead-inline-check" key={dealer.id}><input type="checkbox" disabled={saving} checked={dealerIds.includes(dealer.id)} onChange={() => setDealerIds(ids => method === "direct" ? [dealer.id] : ids.includes(dealer.id) ? ids.filter(id => id !== dealer.id) : [...ids, dealer.id])} />{dealer.trading_name}</label>)}<label className="lead-inline-check"><input type="checkbox" checked={override} disabled={saving} onChange={event => setOverride(event.target.checked)} />Allow selected previous dealers to reclaim</label></fieldset>}<button type="button" disabled={saving || !validRange || (method !== "matching_pool" && !dealerIds.length) || selected.some(id => !page.leads.find(lead => lead.id === id)?.portal_ready_at)} onClick={() => void bulk("release")}>{saving ? "Working..." : "Release selected"}</button></> : <><button type="button" disabled={saving || !validRange} onClick={() => void bulk("review")}>Mark reviewed</button><button type="button" disabled={saving || !validRange} onClick={() => void bulk("ready")}>Mark ready</button><button type="button" disabled={saving || !validRange} onClick={() => void bulk("archive")}>Archive</button></>}</div>}

    {!!results.length && <div className="website-state compact" role="status"><p>{results.filter(result => result.ok).length} succeeded; {results.filter(result => !result.ok).length} refused or failed.</p><ul>{results.map(result => <li key={result.id}>#{result.id}: {result.ok ? "Completed" : result.error}</li>)}</ul></div>}
    {error && <div className="website-state error" role="alert">{error}<button type="button" onClick={() => setRefresh(value => value + 1)}>Retry</button></div>}
    {!loading && !error && !page.leads.length && <div className="website-state">No leads match this view.</div>}
    {validRange && <div className="lead-summary-list" aria-busy={loading}>{page.leads.map(lead => <LeadSummaryRow key={lead.id} lead={lead} href={`/website-leads/${lead.id}${detailOrigin}`} selected={selected.includes(lead.id)} disabled={saving || moreLoading || (selected.length >= 50 && !selected.includes(lead.id))} toggle={() => setSelected(ids => ids.includes(lead.id) ? ids.filter(id => id !== lead.id) : [...ids, lead.id])} />)}</div>}
    {page.hasMore && validRange && <div className="lead-pagination"><button type="button" onClick={() => void loadMore()} disabled={moreLoading || loading || saving}>{moreLoading ? "Loading..." : "Load more (50)"}</button></div>}
  </section>;
}

function LeadSummaryRow({ lead, href, selected, disabled, toggle }: { lead: LeadListRow; href: string; selected: boolean; disabled: boolean; toggle: () => void }) {
  const [failed, setFailed] = useState(false);
  const marketplace = lead.opportunity_mode === "marketplace_offer";
  const motorcycle = [lead.make, lead.model].filter(Boolean).join(" ") || "motorcycle";
  return <article className="lead-summary-card lead-summary-row">
    <label className="lead-row-select"><input type="checkbox" checked={selected} disabled={disabled} onChange={toggle} /><span className="sr-only">Select #{lead.id}</span></label>
    <Link className="lead-row-thumb" href={href} prefetch={false} aria-label={`Open lead #${lead.id}: ${motorcycle}`}>{lead.thumbnail_url && !failed ? <img src={lead.thumbnail_url} alt={`${motorcycle} thumbnail`} loading="lazy" decoding="async" width="120" height="82" onError={() => setFailed(true)} /> : <span>{failed ? "Photo unavailable" : "No photo"}</span>}</Link>
    <Link className="lead-row-main" href={href} prefetch={false}><small>#{lead.id}</small><strong>{lead.reg || "No registration"} - {motorcycle === "motorcycle" ? "Details pending" : motorcycle}</strong><span>{lead.year || "Year unknown"} | {formatMileage(lead.mileage)} | {lead.location_town || "Location not supplied"}</span><div className="website-card-badges"><em className={`website-badge ${lead.lead_source === "motorgeeks" ? "source" : ""}`}>{sourceLabels[lead.lead_source || ""] || statusLabel(lead.lead_source || "unknown")}</em><em className="website-badge">{marketplace ? "Marketplace" : "Direct"}</em></div></Link>
    <div className="lead-row-meta"><span>Received<strong>{formatLeadDate(lead.received_at)}</strong></span><span>Status<strong>{workflowLabel(lead)}</strong></span><span>Asking price<strong>{formatAskingPrice(lead.price)}</strong></span></div>
    <Link className="lead-open" href={href} prefetch={false}>Open</Link>
  </article>;
}

function workflowLabel(lead: LeadListRow) {
  if (lead.archived_at) return "Archived";
  if (lead.portal_ready_at) return "Ready to send";
  if (lead.opportunity_mode === "marketplace_offer") {
    const labels: Record<string, string> = { submitted: "Needs review", under_review: "Under review", live_to_dealers: "Live with dealers", offer_received: "Offer received", offer_accepted: "Deal agreed", purchase_pending: "Purchase pending", purchased: "Completed", cancelled: "Closed", closed: "Closed" };
    return labels[lead.marketplace_status || ""] || "Marketplace review";
  }
  const labels: Record<string, string> = { new: lead.portal_ready_at ? "Ready to send" : lead.portal_reviewed_at ? "Reviewed" : "Needs review", dealer_pool_available: "Live with dealers", dealer_allocated: "Live with dealer", dealer_claimed: "Claimed", purchased: "Completed", dealer_purchased: "Completed", declined: "Closed", closed: "Closed" };
  return labels[lead.status] || statusLabel(lead.status);
}

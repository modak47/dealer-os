"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketAnalytics, MarketListing, MarketSortKey } from "@/lib/market-intelligence";

interface MarketResponse {
  analytics: MarketAnalytics;
  rows: MarketListing[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
  meta: { totalRows: number; fetchedRows: number; usedServerFilters: boolean; sampleLimited: boolean };
}

type FilterState = {
  from: string;
  to: string;
  listingStatus: string;
  dealerPrivate: string;
  dealerName: string;
  make: string;
  model: string;
  derivative: string;
  year: string;
  minPrice: string;
  maxPrice: string;
  minMileage: string;
  maxMileage: string;
  location: string;
  radius: string;
  sort: MarketSortKey;
  direction: "asc" | "desc";
  pageSize: string;
};

const defaultFilters: FilterState = {
  from: "",
  to: "",
  listingStatus: "",
  dealerPrivate: "",
  dealerName: "",
  make: "",
  model: "",
  derivative: "",
  year: "",
  minPrice: "",
  maxPrice: "",
  minMileage: "",
  maxMileage: "",
  location: "",
  radius: "",
  sort: "lastSeen",
  direction: "desc",
  pageSize: "50",
};

const money = (value: number | null | undefined) => value === null || value === undefined ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
const number = (value: number | null | undefined) => value === null || value === undefined ? "—" : Math.round(value).toLocaleString("en-GB");
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("en-GB") : "—";

function buildParams(filters: FilterState, page: number) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  params.set("page", String(page));
  return params;
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <article className="mi-kpi"><span /><p>{label}</p><strong>{value}</strong><small>{hint}</small></article>;
}

function Leaderboard({ title, rows, valueLabel = "Sold" }: { title: string; rows: MarketAnalytics["dealerLeaderboard"]; valueLabel?: string }) {
  return <section className="mi-panel"><div className="panel-title"><h2>{title}</h2><span>{valueLabel}</span></div><div className="mi-leaderboard">{rows.map((row, index) => <div key={`${title}-${row.name}`}><b>{index + 1}</b><span>{row.name}</span><strong>{row.count}</strong></div>)}{!rows.length && <p className="mi-empty">No matching rows for this filter.</p>}</div></section>;
}

function TrendChart({ points }: { points: MarketAnalytics["removedTrend"] }) {
  const max = Math.max(...points.map((point) => point.removed), 1);
  return <section className="mi-panel mi-trend-panel"><div className="panel-title"><h2>Removed listings trend</h2><span>{points.length} dates</span></div><div className="mi-trend">{points.slice(-40).map((point) => <div key={point.date} title={`${date(point.date)}: ${point.removed} removed`}><i style={{ height: `${Math.max(8, (point.removed / max) * 100)}%` }} /><span>{new Date(point.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span></div>)}{!points.length && <p className="mi-empty">No removed listings in this range.</p>}</div></section>;
}

export function MarketIntelligenceClient() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MarketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const params = useMemo(() => buildParams(appliedFilters, page), [appliedFilters, page]);
  const exportHref = `/api/market-intelligence?${params.toString()}&format=csv`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/market-intelligence?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load market intelligence.");
        setData(body);
      })
      .catch((fetchError: Error) => {
        if (fetchError.name !== "AbortError") setError(fetchError.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [params]);

  function update(key: keyof FilterState, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function apply(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setAppliedFilters(filters);
  }

  function reset() {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setPage(1);
  }

  const analytics = data?.analytics;

  return <div className="market-intelligence">
    <form className="mi-filters" onSubmit={apply}>
      <label><span>Date from</span><input type="date" value={filters.from} onChange={(event) => update("from", event.target.value)} /></label>
      <label><span>Date to</span><input type="date" value={filters.to} onChange={(event) => update("to", event.target.value)} /></label>
      <label><span>Listing status</span><select value={filters.listingStatus} onChange={(event) => update("listingStatus", event.target.value)}><option value="">All</option><option>Active</option><option>Removed</option></select></label>
      <label><span>Seller type</span><select value={filters.dealerPrivate} onChange={(event) => update("dealerPrivate", event.target.value)}><option value="">All</option><option>Dealer</option><option>Private</option></select></label>
      <label><span>Dealer name</span><input value={filters.dealerName} onChange={(event) => update("dealerName", event.target.value)} placeholder="Superbike Factory Crawley" /></label>
      <label><span>Make</span><input value={filters.make} onChange={(event) => update("make", event.target.value)} placeholder="Yamaha" /></label>
      <label><span>Model</span><input value={filters.model} onChange={(event) => update("model", event.target.value)} placeholder="MT-125" /></label>
      <label><span>Derivative</span><input value={filters.derivative} onChange={(event) => update("derivative", event.target.value)} placeholder="ABS, Tech Max..." /></label>
      <label><span>Year</span><input inputMode="numeric" value={filters.year} onChange={(event) => update("year", event.target.value)} placeholder="2022" /></label>
      <label><span>Min price</span><input inputMode="numeric" value={filters.minPrice} onChange={(event) => update("minPrice", event.target.value)} placeholder="1000" /></label>
      <label><span>Max price</span><input inputMode="numeric" value={filters.maxPrice} onChange={(event) => update("maxPrice", event.target.value)} placeholder="10000" /></label>
      <label><span>Min mileage</span><input inputMode="numeric" value={filters.minMileage} onChange={(event) => update("minMileage", event.target.value)} placeholder="0" /></label>
      <label><span>Max mileage</span><input inputMode="numeric" value={filters.maxMileage} onChange={(event) => update("maxMileage", event.target.value)} placeholder="30000" /></label>
      <label><span>Location / postcode</span><input value={filters.location} onChange={(event) => update("location", event.target.value)} placeholder="Crawley, BN, RH..." /></label>
      <label><span>Radius</span><select value={filters.radius} onChange={(event) => update("radius", event.target.value)}><option value="">Any</option><option value="10">10 miles</option><option value="25">25 miles</option><option value="50">50 miles</option><option value="100">100 miles</option></select></label>
      <label><span>Sort by</span><select value={filters.sort} onChange={(event) => update("sort", event.target.value as MarketSortKey)}><option value="lastSeen">Last seen</option><option value="firstSeen">First seen</option><option value="price">Price</option><option value="mileage">Mileage</option><option value="year">Year</option><option value="dealerName">Dealer</option><option value="make">Make</option><option value="model">Model</option><option value="daysLive">Days live</option></select></label>
      <label><span>Direction</span><select value={filters.direction} onChange={(event) => update("direction", event.target.value)}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
      <label><span>Rows</span><select value={filters.pageSize} onChange={(event) => update("pageSize", event.target.value)}><option>25</option><option>50</option><option>100</option></select></label>
      <div className="mi-filter-actions"><button type="submit" disabled={loading}>{loading ? "Analysing..." : "Apply filters"}</button><button type="button" onClick={reset}>Reset</button><a href={exportHref}>Export CSV</a></div>
    </form>

    {error && <div className="crm-setup"><b>Market intelligence could not load</b><span>{error}</span></div>}
    {loading && !data && <div className="mi-loading">Analysing AutoTrader listings...</div>}

    {analytics && <><div className="mi-kpis">
      <KpiCard label="Removed / sold" value={number(analytics.removedCount)} hint="Listings removed in selected range" />
      <KpiCard label="Active stock" value={number(analytics.activeCount)} hint="Currently active listings" />
      <KpiCard label="Dealers" value={number(analytics.dealerCount)} hint="Unique dealer sellers" />
      <KpiCard label="Avg asking price" value={money(analytics.averageAskingPrice)} hint="Filtered market average" />
      <KpiCard label="Median asking price" value={money(analytics.medianAskingPrice)} hint="Less distorted by outliers" />
      <KpiCard label="Avg days live" value={number(analytics.averageDaysLive)} hint="From first seen to removed/today" />
    </div>

    {data?.meta.sampleLimited && <div className="mi-warning">Analysis is based on the first 10,000 matching rows. Tighten filters for exact large-range reporting.</div>}

    <div className="mi-grid">
      <TrendChart points={analytics.removedTrend} />
      <Leaderboard title="Dealer sold leaderboard" rows={analytics.dealerLeaderboard} />
      <Leaderboard title="Make / model sold counts" rows={analytics.makeModelSoldCounts} />
      <Leaderboard title="Active stock by dealer" rows={analytics.activeStockByDealer} valueLabel="Active" />
    </div>

    <section className="mi-panel mi-listings">
      <div className="panel-title"><h2>Listings</h2><span>{data?.pagination.total.toLocaleString("en-GB")} matching rows</span></div>
      <div className="mi-table-wrap"><table className="mi-table"><thead><tr><th>Status</th><th>Dealer</th><th>Bike</th><th>Year</th><th>Price</th><th>Mileage</th><th>Days</th><th>Seen</th><th /></tr></thead><tbody>{data?.rows.map((row) => <tr key={`${row.listingId}-${row.advertUrl}`}><td><span className={`mi-status ${row.status.toLowerCase()}`}>{row.status}</span></td><td><b>{row.dealerName}</b><small>{row.dealerPrivate}</small></td><td><b>{[row.make, row.model].filter(Boolean).join(" ") || "—"}</b><small>{row.derivative || `${row.location} ${row.postcode}`.trim() || row.listingId}</small></td><td>{row.year || "—"}</td><td>{money(row.price)}</td><td>{number(row.mileage)}</td><td>{number(row.daysLive)}</td><td><small>First {date(row.firstSeen)}</small><small>Last {date(row.lastSeen)}</small></td><td>{row.advertUrl ? <a href={row.advertUrl} target="_blank" rel="noreferrer">Advert ↗</a> : "—"}</td></tr>)}{!data?.rows.length && <tr><td colSpan={9}><p className="mi-empty">No listings match the selected filters.</p></td></tr>}</tbody></table></div>
      <div className="mi-pagination"><button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading}>Previous</button><span>Page {data?.pagination.page} of {data?.pagination.pages}</span><button onClick={() => setPage((current) => current + 1)} disabled={loading || Boolean(data && page >= data.pagination.pages)}>Next</button></div>
    </section></>}
  </div>;
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseStockBike } from "@/lib/stock-bike-types";

export type StockFilter = "active" | "live" | "reserved" | "sold" | "prep" | "pending" | "all";
const normal = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const money = (value: number | null) => value == null ? "Price missing" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);

export function AdminStockTable({ bikes, initialFilter = "active", initialQuery = "", warning = "" }: { bikes: SupabaseStockBike[]; initialFilter?: StockFilter; initialQuery?: string; warning?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<StockFilter>(initialFilter);
  const updateUrl = (nextFilter: StockFilter, nextQuery: string) => {
    const params = new URLSearchParams();
    if (nextFilter !== "active") params.set("filter", nextFilter);
    if (nextQuery) params.set("q", nextQuery);
    if (warning) params.set("warning", warning);
    router.replace(`/admin/stock${params.size ? `?${params}` : ""}`, { scroll: false });
  };
  const shown = useMemo(() => bikes.filter(bike => {
    const status = normal(bike.status);
    const statusMatch = filter === "all" || (filter === "active" && ["in stock", "on forecourt", "reserved", "prep"].includes(status)) || (filter === "live" && ["in stock", "on forecourt"].includes(status)) || (filter === "reserved" && status === "reserved") || (filter === "sold" && ["sold", "sale completed"].includes(status)) || (filter === "prep" && status === "prep") || (filter === "pending" && ["purchase pending", "purchase cancelled"].includes(status));
    const searchMatch = !query || `${bike.make ?? ""} ${bike.model ?? ""} ${bike.variant ?? ""} ${bike.registration ?? ""} ${bike.stock_number ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const images = [bike.primary_image_url, ...bike.image_urls].filter(Boolean);
    const warningMatch = warning === "image" ? images.length === 0 : warning === "price" ? bike.price == null || bike.price <= 0 : true;
    return statusMatch && searchMatch && warningMatch;
  }), [bikes, filter, query, warning]);

  return <>
    <div className="admin-filters stock-manager-filters">
      <input value={query} onChange={event => { setQuery(event.target.value); updateUrl(filter, event.target.value); }} placeholder="Search registration, make, model or stock number..." />
      <select value={filter} onChange={event => { const value = event.target.value as StockFilter; setFilter(value); updateUrl(value, query); }}><option value="active">Active stock</option><option value="pending">Incoming / Purchase Pending</option><option value="live">In Stock</option><option value="reserved">Reserved</option><option value="sold">Sold</option><option value="prep">Prep</option><option value="all">All stock</option></select>
      <span>{shown.length} motorcycle{shown.length === 1 ? "" : "s"}</span>
    </div>
    {shown.length === 0 ? <div className="stock-state"><b>No stock found</b><span>Try another search or filter.</span></div> : <div className="admin-stock-grid">{shown.map(bike => <StockManagerCard bike={bike} key={bike.id} />)}</div>}
  </>;
}

function StockManagerCard({ bike }: { bike: SupabaseStockBike }) {
  const router = useRouter();
  const href = `/admin/stock/${bike.id}`;
  const images = Array.from(new Set(bike.image_urls.filter((value): value is string => Boolean(value))));
  const image = images[0];
  const statusClass = normal(bike.status).replaceAll(" ", "-");
  const purchasePending = statusClass === "purchase-pending";
  return <article className="admin-stock-card" role="link" tabIndex={0} onClick={() => router.push(href)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); router.push(href); } }}>
    <div className="admin-stock-photo">{image ? <img src={image} alt={`${bike.make ?? ""} ${bike.model ?? ""}`} /> : <div><b>YM</b><span>Image required</span></div>}<span className={`status ${statusClass}`}>{bike.status || "Unknown"}</span><small>{images.length} photo{images.length === 1 ? "" : "s"}</small></div>
    <div className="admin-stock-copy"><p>{bike.registration || "Registration pending"}{bike.stock_number ? ` · ${bike.stock_number}` : ""}</p><h2>{bike.make || "Make missing"} {bike.model || "Model missing"}</h2>{bike.variant && <h3>{bike.variant}</h3>}<dl><div><dt>Year</dt><dd>{bike.year || "-"}</dd></div><div><dt>Mileage</dt><dd>{bike.mileage == null ? "-" : bike.mileage.toLocaleString("en-GB")}</dd></div><div><dt>{purchasePending ? "Target" : "Price"}</dt><dd className={bike.price == null || bike.price <= 0 ? "warning" : ""}>{money(bike.price)}</dd></div>{purchasePending && <><div><dt>Arrival</dt><dd>{bike.expected_arrival_date || "-"}</dd></div><div><dt>Agreed</dt><dd>{money(bike.purchase_price ?? null)}</dd></div><div><dt>Margin</dt><dd>{money(bike.expected_gross_profit ?? null)}</dd></div></>}</dl><div className="admin-stock-actions"><Link href={href} onClick={event => event.stopPropagation()}>View</Link><Link className="primary" href={`${href}?edit=1`} onClick={event => event.stopPropagation()}>Edit</Link></div></div>
  </article>;
}

export function Toggle({ on }: { on: boolean }) {
  return <button aria-label="Status toggle" className={`toggle ${on ? "on" : ""}`} onClick={event => event.stopPropagation()}><i /></button>;
}

export type ListingStatusFilter = "" | "Active" | "Removed";
export type DealerPrivateFilter = "" | "Dealer" | "Private";

export type MarketSortKey =
  | "lastSeen"
  | "firstSeen"
  | "price"
  | "mileage"
  | "year"
  | "dealerName"
  | "make"
  | "model"
  | "daysLive";

export interface MarketFilters {
  from?: string;
  to?: string;
  listingStatus?: ListingStatusFilter;
  dealerPrivate?: DealerPrivateFilter;
  dealerName?: string;
  make?: string;
  model?: string;
  derivative?: string;
  year?: string;
  minPrice?: string;
  maxPrice?: string;
  minMileage?: string;
  maxMileage?: string;
  location?: string;
  radius?: string;
  page: number;
  pageSize: number;
  sort: MarketSortKey;
  direction: "asc" | "desc";
}

export interface MarketListing {
  id: string;
  listingId: string;
  dealerName: string;
  dealerPrivate: string;
  status: string;
  make: string;
  model: string;
  derivative: string;
  year: number | null;
  price: number | null;
  mileage: number | null;
  location: string;
  postcode: string;
  firstSeen: string | null;
  lastSeen: string | null;
  daysLive: number | null;
  advertUrl: string;
}

export interface MarketGroup {
  name: string;
  count: number;
  active?: number;
  removed?: number;
  averagePrice?: number | null;
}

export interface MarketTrendPoint {
  date: string;
  removed: number;
}

export interface MarketAnalytics {
  totalRows: number;
  filteredRows: number;
  activeCount: number;
  removedCount: number;
  dealerCount: number;
  averageAskingPrice: number | null;
  medianAskingPrice: number | null;
  averageDaysLive: number | null;
  dealerLeaderboard: MarketGroup[];
  makeModelSoldCounts: MarketGroup[];
  activeStockByDealer: MarketGroup[];
  removedTrend: MarketTrendPoint[];
  sampleLimited: boolean;
}

const keys = {
  listingId: ["Listing ID", "listing_id", "listingId", "id"],
  dealerName: ["Dealer Name", "dealer_name", "dealerName", "dealer", "seller_name"],
  dealerPrivate: ["Dealer or Private", "dealer_or_private", "dealerPrivate", "seller_type"],
  status: ["Listing Status", "listing_status", "listingStatus", "status"],
  make: ["Make", "make"],
  model: ["Model", "model"],
  derivative: ["Derivative", "derivative", "Variant", "variant"],
  year: ["Year", "year", "Registration Year", "registration_year"],
  price: ["Listed Price", "listed_price", "Price", "price", "asking_price"],
  mileage: ["Mileage", "mileage"],
  location: ["Location", "location", "Town", "town"],
  postcode: ["Postcode", "postcode", "Post Code", "post_code"],
  firstSeen: ["First Seen Date", "first_seen_date", "firstSeen", "created_at"],
  lastSeen: ["Last Seen Date", "last_seen_date", "lastSeen", "removed_at", "updated_at"],
  daysLive: ["Days Live", "days_live", "daysLive"],
  advertUrl: ["Advert URL", "advert_url", "advertUrl", "url", "listing_url"],
};

function raw(row: Record<string, unknown>, candidates: string[]) {
  for (const key of candidates) if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  return null;
}

export function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

export function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = text(value).replace(/[£,\s]/g, "").replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: unknown): string | null {
  const valueText = text(value);
  if (!valueText) return null;
  const date = new Date(valueText);
  return Number.isNaN(date.getTime()) ? valueText : date.toISOString();
}

function daysBetween(start: string | null, end: string | null) {
  if (!start) return null;
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000));
}

export function normalizeMarketListing(row: Record<string, unknown>, index = 0): MarketListing {
  const firstSeen = dateValue(raw(row, keys.firstSeen));
  const lastSeen = dateValue(raw(row, keys.lastSeen));
  const daysLive = numberValue(raw(row, keys.daysLive)) ?? daysBetween(firstSeen, lastSeen);
  const listingId = text(raw(row, keys.listingId)) || `listing-${index}`;
  return {
    id: text(row.id) || listingId,
    listingId,
    dealerName: text(raw(row, keys.dealerName)) || "Unknown dealer",
    dealerPrivate: text(raw(row, keys.dealerPrivate)) || "—",
    status: text(raw(row, keys.status)) || "—",
    make: text(raw(row, keys.make)),
    model: text(raw(row, keys.model)),
    derivative: text(raw(row, keys.derivative)),
    year: numberValue(raw(row, keys.year)),
    price: numberValue(raw(row, keys.price)),
    mileage: numberValue(raw(row, keys.mileage)),
    location: text(raw(row, keys.location)),
    postcode: text(raw(row, keys.postcode)),
    firstSeen,
    lastSeen,
    daysLive,
    advertUrl: text(raw(row, keys.advertUrl)),
  };
}

export function parseMarketFilters(searchParams: URLSearchParams): MarketFilters {
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") || 50), 10), 100);
  const sort = (searchParams.get("sort") || "lastSeen") as MarketSortKey;
  return {
    from: text(searchParams.get("from")),
    to: text(searchParams.get("to")),
    listingStatus: (searchParams.get("listingStatus") || "") as ListingStatusFilter,
    dealerPrivate: (searchParams.get("dealerPrivate") || "") as DealerPrivateFilter,
    dealerName: text(searchParams.get("dealerName")),
    make: text(searchParams.get("make")),
    model: text(searchParams.get("model")),
    derivative: text(searchParams.get("derivative")),
    year: text(searchParams.get("year")),
    minPrice: text(searchParams.get("minPrice")),
    maxPrice: text(searchParams.get("maxPrice")),
    minMileage: text(searchParams.get("minMileage")),
    maxMileage: text(searchParams.get("maxMileage")),
    location: text(searchParams.get("location")),
    radius: text(searchParams.get("radius")),
    page: Math.max(Number(searchParams.get("page") || 1), 1),
    pageSize,
    sort: ["lastSeen", "firstSeen", "price", "mileage", "year", "dealerName", "make", "model", "daysLive"].includes(sort) ? sort : "lastSeen",
    direction: searchParams.get("direction") === "asc" ? "asc" : "desc",
  };
}

export function applyClientFilters(rows: MarketListing[], filters: MarketFilters) {
  const contains = (value: string, needle?: string) => !needle || value.toLowerCase().includes(needle.toLowerCase());
  const minPrice = numberValue(filters.minPrice);
  const maxPrice = numberValue(filters.maxPrice);
  const minMileage = numberValue(filters.minMileage);
  const maxMileage = numberValue(filters.maxMileage);
  const year = numberValue(filters.year);
  const from = filters.from ? new Date(`${filters.from}T00:00:00`) : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59`) : null;

  return rows.filter((row) => {
    const rowDate = new Date(row.lastSeen || row.firstSeen || "");
    if (filters.listingStatus && row.status.toLowerCase() !== filters.listingStatus.toLowerCase()) return false;
    if (filters.dealerPrivate && row.dealerPrivate.toLowerCase() !== filters.dealerPrivate.toLowerCase()) return false;
    if (!contains(row.dealerName, filters.dealerName)) return false;
    if (!contains(row.make, filters.make)) return false;
    if (!contains(row.model, filters.model)) return false;
    if (!contains(row.derivative, filters.derivative)) return false;
    if (year !== null && row.year !== year) return false;
    if (minPrice !== null && (row.price === null || row.price < minPrice)) return false;
    if (maxPrice !== null && (row.price === null || row.price > maxPrice)) return false;
    if (minMileage !== null && (row.mileage === null || row.mileage < minMileage)) return false;
    if (maxMileage !== null && (row.mileage === null || row.mileage > maxMileage)) return false;
    if (filters.location && !contains(`${row.location} ${row.postcode}`, filters.location)) return false;
    if (from && !Number.isNaN(rowDate.getTime()) && rowDate < from) return false;
    if (to && !Number.isNaN(rowDate.getTime()) && rowDate > to) return false;
    return true;
  });
}

export function sortMarketRows(rows: MarketListing[], filters: Pick<MarketFilters, "sort" | "direction">) {
  const direction = filters.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[filters.sort];
    const bv = b[filters.sort];
    if (typeof av === "number" || typeof bv === "number") return ((av ?? -Infinity) as number) > ((bv ?? -Infinity) as number) ? direction : -direction;
    return text(av).localeCompare(text(bv), "en-GB") * direction;
  });
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function groupRows(rows: MarketListing[], getName: (row: MarketListing) => string, limit = 15): MarketGroup[] {
  const groups = new Map<string, MarketListing[]>();
  for (const row of rows) {
    const name = getName(row) || "Unknown";
    groups.set(name, [...(groups.get(name) || []), row]);
  }
  return [...groups.entries()]
    .map(([name, groupedRows]) => ({
      name,
      count: groupedRows.length,
      active: groupedRows.filter((row) => row.status.toLowerCase() === "active").length,
      removed: groupedRows.filter((row) => row.status.toLowerCase() === "removed").length,
      averagePrice: average(groupedRows.map((row) => row.price).filter((value): value is number => value !== null)),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function buildMarketAnalytics(rows: MarketListing[], totalRows: number, sampleLimited: boolean): MarketAnalytics {
  const active = rows.filter((row) => row.status.toLowerCase() === "active");
  const removed = rows.filter((row) => row.status.toLowerCase() === "removed");
  const prices = rows.map((row) => row.price).filter((value): value is number => value !== null && value > 0);
  const daysLive = rows.map((row) => row.daysLive).filter((value): value is number => value !== null);
  const dealerCount = new Set(rows.filter((row) => row.dealerPrivate.toLowerCase() === "dealer").map((row) => row.dealerName).filter(Boolean)).size;
  const trend = new Map<string, number>();

  for (const row of removed) {
    const date = row.lastSeen || row.firstSeen;
    if (!date) continue;
    const key = date.slice(0, 10);
    trend.set(key, (trend.get(key) || 0) + 1);
  }

  return {
    totalRows,
    filteredRows: rows.length,
    activeCount: active.length,
    removedCount: removed.length,
    dealerCount,
    averageAskingPrice: average(prices),
    medianAskingPrice: median(prices),
    averageDaysLive: average(daysLive),
    dealerLeaderboard: groupRows(removed, (row) => row.dealerName, 20),
    makeModelSoldCounts: groupRows(removed, (row) => [row.make, row.model].filter(Boolean).join(" "), 20),
    activeStockByDealer: groupRows(active, (row) => row.dealerName, 20),
    removedTrend: [...trend.entries()].map(([date, count]) => ({ date, removed: count })).sort((a, b) => a.date.localeCompare(b.date)),
    sampleLimited,
  };
}

export function csvEscape(value: unknown) {
  const stringValue = text(value);
  return /[",\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

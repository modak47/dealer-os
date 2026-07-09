import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildMarketAnalytics,
  csvEscape,
  normalizeMarketListing,
  numberValue,
  parseMarketFilters,
  sortMarketRows,
  text,
  type MarketFilters,
} from "@/lib/market-intelligence";

export const dynamic = "force-dynamic";

const FETCH_CHUNK_SIZE = 1000;

const sortableColumns: Partial<Record<MarketFilters["sort"], string>> = {
  lastSeen: "Last Seen Date",
  firstSeen: "First Seen Date",
  price: "Listed Price",
  mileage: "Mileage",
  year: "Year",
  dealerName: "Dealer Name",
  make: "Make",
  model: "Model",
  daysLive: "Days Live",
};

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function applyMarketFilters(query: any, filters: MarketFilters) {
  let nextQuery = query;
  const year = numberValue(filters.year);
  const minPrice = numberValue(filters.minPrice);
  const maxPrice = numberValue(filters.maxPrice);
  const minMileage = numberValue(filters.minMileage);
  const maxMileage = numberValue(filters.maxMileage);

  if (filters.listingStatus) nextQuery = nextQuery.eq("Listing Status", filters.listingStatus);
  if (filters.dealerPrivate) nextQuery = nextQuery.eq("Dealer or Private", filters.dealerPrivate);
  if (filters.dealerName) nextQuery = nextQuery.ilike("Dealer Name", `%${escapeLike(filters.dealerName)}%`);
  if (filters.make) nextQuery = nextQuery.ilike("Make", `%${escapeLike(filters.make)}%`);
  if (filters.model) nextQuery = nextQuery.ilike("Model", `%${escapeLike(filters.model)}%`);
  if (filters.derivative) nextQuery = nextQuery.ilike("Derivative", `%${escapeLike(filters.derivative)}%`);
  if (year !== null) nextQuery = nextQuery.eq("Year", year);
  if (minPrice !== null) nextQuery = nextQuery.gte("Listed Price", minPrice);
  if (maxPrice !== null) nextQuery = nextQuery.lte("Listed Price", maxPrice);
  if (minMileage !== null) nextQuery = nextQuery.gte("Mileage", minMileage);
  if (maxMileage !== null) nextQuery = nextQuery.lte("Mileage", maxMileage);
  if (filters.location) {
    const location = escapeLike(filters.location);
    nextQuery = nextQuery.or(`Location.ilike.%${location}%,Postcode.ilike.%${location}%`);
  }
  if (filters.from) nextQuery = nextQuery.gte("Last Seen Date", filters.from);
  if (filters.to) nextQuery = nextQuery.lte("Last Seen Date", filters.to);
  return nextQuery;
}

function baseQuery() {
  return getSupabaseAdmin().from("autotrader_listings");
}

async function getExactFilteredCount(filters: MarketFilters) {
  const { count, error } = await applyMarketFilters(baseQuery().select("*", { count: "exact", head: true }), filters);
  if (error) throw error;
  return count || 0;
}

async function loadAllFilteredRows(filters: MarketFilters, exactCount: number) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < exactCount; from += FETCH_CHUNK_SIZE) {
    const to = Math.min(from + FETCH_CHUNK_SIZE - 1, exactCount - 1);
    const { data, error } = await applyMarketFilters(baseQuery().select("*"), filters).range(from, to);
    if (error) throw error;
    rows.push(...((data || []) as Record<string, unknown>[]));
    if ((data || []).length < FETCH_CHUNK_SIZE) break;
  }
  return rows;
}

function csvResponse(rows: ReturnType<typeof normalizeMarketListing>[]) {
  const headers = ["Listing ID", "Status", "Dealer/Private", "Dealer Name", "Make", "Model", "Derivative", "Year", "Price", "Mileage", "Location", "Postcode", "First Seen", "Last Seen", "Days Live", "Advert URL"];
  const csvRows = rows.map((row) => [
    row.listingId,
    row.status,
    row.dealerPrivate,
    row.dealerName,
    row.make,
    row.model,
    row.derivative,
    row.year ?? "",
    row.price ?? "",
    row.mileage ?? "",
    row.location,
    row.postcode,
    row.firstSeen ?? "",
    row.lastSeen ?? "",
    row.daysLive ?? "",
    row.advertUrl,
  ]);
  const csv = [headers, ...csvRows].map((row) => row.map(csvEscape).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="autotrader-market-intelligence-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function filteredErrorMessage(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? text((error as { message?: unknown }).message) : "";
  if (/column|schema cache|does not exist/i.test(message)) return "AutoTrader table columns do not match the expected market intelligence mapping.";
  return "Unable to load AutoTrader market intelligence.";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filters = parseMarketFilters(url.searchParams);
    const format = url.searchParams.get("format");
    const exactFilteredCount = await getExactFilteredCount(filters);
    const rawRows = await loadAllFilteredRows(filters, exactFilteredCount);
    const normalized = rawRows.map((row, index) => normalizeMarketListing(row, index));
    const sorted = sortMarketRows(normalized, filters);
    const start = (filters.page - 1) * filters.pageSize;
    const pageRows = sorted.slice(start, start + filters.pageSize);
    const analytics = buildMarketAnalytics(sorted, exactFilteredCount, false);

    if (format === "csv") return csvResponse(sorted);

    return NextResponse.json({
      filters,
      analytics,
      rows: pageRows,
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        total: exactFilteredCount,
        pages: Math.max(1, Math.ceil(exactFilteredCount / filters.pageSize)),
      },
      meta: {
        totalRows: exactFilteredCount,
        fetchedRows: rawRows.length,
        usedServerFilters: true,
        sampleLimited: false,
        sortableColumn: sortableColumns[filters.sort] || null,
      },
    });
  } catch (error) {
    console.error("Market intelligence API failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: filteredErrorMessage(error) }, { status: 500 });
  }
}

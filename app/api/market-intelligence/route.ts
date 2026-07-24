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
const FILTER_OPTION_SELECT = '"Dealer Name","Dealer or Private","Make","Model","Year"';

type MarketFilterQuery = {
  eq(column: string, value: unknown): MarketFilterQuery;
  ilike(column: string, pattern: string): MarketFilterQuery;
  gte(column: string, value: unknown): MarketFilterQuery;
  lte(column: string, value: unknown): MarketFilterQuery;
  or(filters: string): MarketFilterQuery;
  range(from: number, to: number): MarketFilterQuery;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): MarketFilterQuery;
  limit(count: number): MarketFilterQuery;
};

type MarketQueryResult = {
  data?: Record<string, unknown>[] | null;
  count?: number | null;
  error?: unknown;
};

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

function applyMarketFilters(query: MarketFilterQuery, filters: MarketFilters) {
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

function sortedTextOptions(values: Set<string>) {
  return [...values].sort((a, b) => a.localeCompare(b, "en-GB"));
}

async function loadFilterOptions() {
  const { count, error: countError } = await baseQuery().select("*", { count: "exact", head: true });
  if (countError) throw countError;

  const dealerNames = new Set<string>();
  const makes = new Set<string>();
  const models = new Set<string>();
  const years = new Set<string>();
  const total = count || 0;

  for (let from = 0; from < total; from += FETCH_CHUNK_SIZE) {
    const to = Math.min(from + FETCH_CHUNK_SIZE - 1, total - 1);
    const { data, error } = await baseQuery().select(FILTER_OPTION_SELECT).range(from, to);
    if (error) throw error;

    for (const row of (data || []) as Record<string, unknown>[]) {
      const dealerName = text(row["Dealer Name"]);
      const sellerType = text(row["Dealer or Private"]);
      const make = text(row.Make);
      const model = text(row.Model);
      const year = text(row.Year);
      if (dealerName && sellerType.toLowerCase() === "dealer") dealerNames.add(dealerName);
      if (make) makes.add(make);
      if (model) models.add(model);
      if (year) years.add(year);
    }
  }

  return {
    dealerNames: sortedTextOptions(dealerNames),
    makes: sortedTextOptions(makes),
    models: sortedTextOptions(models),
    years: [...years].sort((a, b) => Number(b) - Number(a) || b.localeCompare(a, "en-GB")),
  };
}

async function getExactFilteredCount(filters: MarketFilters) {
  const { count, error } = await (applyMarketFilters(baseQuery().select("*", { count: "exact", head: true }) as unknown as MarketFilterQuery, filters) as unknown as Promise<MarketQueryResult>);
  if (error) throw error;
  return count || 0;
}

function hasAnalysisFilters(filters: MarketFilters) {
  return Boolean(filters.from || filters.to || filters.listingStatus || filters.dealerPrivate || filters.dealerName || filters.make || filters.model || filters.derivative || filters.year || filters.minPrice || filters.maxPrice || filters.minMileage || filters.maxMileage || filters.location);
}

async function loadAllFilteredRows(filters: MarketFilters, exactCount: number, select = "*") {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < exactCount; from += FETCH_CHUNK_SIZE) {
    const to = Math.min(from + FETCH_CHUNK_SIZE - 1, exactCount - 1);
    let query = applyMarketFilters(baseQuery().select(select) as unknown as MarketFilterQuery, filters);
    query = query.order(sortableColumns[filters.sort] || "Last Seen Date", { ascending: filters.direction === "asc", nullsFirst: false });
    const { data, error } = await (query.range(from, to) as unknown as Promise<MarketQueryResult>);
    if (error) throw error;
    rows.push(...((data || []) as Record<string, unknown>[]));
    if ((data || []).length < FETCH_CHUNK_SIZE) break;
  }
  return rows;
}

async function loadSummaryAnalytics(filters: MarketFilters, exactFilteredCount: number) {
  const rawRows = await loadAllFilteredRows(filters, exactFilteredCount);
  const normalized = rawRows.map((row, index) => normalizeMarketListing(row, index));
  return buildMarketAnalytics(normalized, exactFilteredCount, false);
}

const csvHeaders = ["Listing ID", "Status", "Dealer/Private", "Dealer Name", "Make", "Model", "Derivative", "Year", "Price", "Mileage", "Location", "Postcode", "First Seen", "Last Seen", "Days Live", "Advert URL"];

function csvValues(row: ReturnType<typeof normalizeMarketListing>) {
  return [
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
  ];
}

function csvLine(row: unknown[]) {
  return `${row.map(csvEscape).join(",")}\n`;
}

function csvResponse(filters: MarketFilters, exactCount: number) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(csvLine(csvHeaders)));
        for (let from = 0; from < exactCount; from += FETCH_CHUNK_SIZE) {
          const to = Math.min(from + FETCH_CHUNK_SIZE - 1, exactCount - 1);
          let query = applyMarketFilters(baseQuery().select("*") as unknown as MarketFilterQuery, filters);
          query = query.order(sortableColumns[filters.sort] || "Last Seen Date", { ascending: filters.direction === "asc", nullsFirst: false });
          const { data, error } = await (query.range(from, to) as unknown as Promise<MarketQueryResult>);
          if (error) throw error;
          const lines = ((data || []) as Record<string, unknown>[])
            .map((row, index) => csvLine(csvValues(normalizeMarketListing(row, from + index))))
            .join("");
          if (lines) controller.enqueue(encoder.encode(lines));
          if ((data || []).length < FETCH_CHUNK_SIZE) break;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(stream, {
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
    if (url.searchParams.get("options") === "filters") {
      return NextResponse.json({ options: await loadFilterOptions() });
    }

    const filters = parseMarketFilters(url.searchParams);
    const format = url.searchParams.get("format");
    const exactFilteredCount = await getExactFilteredCount(filters);
    const canLoadAnalysis = hasAnalysisFilters(filters);

    if (format === "csv") return csvResponse(filters, exactFilteredCount);

    if (!canLoadAnalysis) {
      const analytics = await loadSummaryAnalytics(filters, exactFilteredCount);
      return NextResponse.json({
        filters,
        analytics,
        rows: [],
        pagination: { page: 1, pageSize: filters.pageSize, total: exactFilteredCount, pages: 1 },
        meta: {
          totalRows: exactFilteredCount,
          fetchedRows: 0,
          usedServerFilters: true,
          sampleLimited: false,
          summaryOnly: true,
          sortableColumn: null,
        },
      });
    }

    const rawRows = await loadAllFilteredRows(filters, exactFilteredCount);
    const normalized = rawRows.map((row, index) => normalizeMarketListing(row, index));
    const sorted = sortMarketRows(normalized, filters);
    const start = (filters.page - 1) * filters.pageSize;
    const pageRows = sorted.slice(start, start + filters.pageSize);
    const analytics = buildMarketAnalytics(sorted, exactFilteredCount, false);

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
        summaryOnly: false,
        sortableColumn: sortableColumns[filters.sort] || null,
      },
    });
  } catch (error) {
    console.error("Market intelligence API failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: filteredErrorMessage(error) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  csvEscape,
  normalizeMarketListing,
  numberValue,
  parseMarketFilters,
  text,
  type MarketFilters,
  type MarketAnalytics,
  type MarketGroup,
  type MarketTrendPoint,
} from "@/lib/market-intelligence";

export const dynamic = "force-dynamic";

const FETCH_CHUNK_SIZE = 1000;
const LISTING_SELECT = "listing_id,dealer_name,dealer_or_private:seller_display,listing_status:status_display,make,model,derivative,year:listing_year,listed_price,mileage,location,postcode,first_seen_date,last_seen_date,days_live,advert_url";

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
  lastSeen: "last_seen_date",
  firstSeen: "first_seen_date",
  price: "listed_price",
  mileage: "mileage",
  year: "listing_year",
  dealerName: "dealer_name",
  make: "make",
  model: "model",
  daysLive: "days_live",
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

  if (filters.listingStatus) nextQuery = nextQuery.eq("listing_status", filters.listingStatus.toLowerCase());
  if (filters.dealerPrivate) nextQuery = nextQuery.eq("seller_type", filters.dealerPrivate.toLowerCase());
  if (filters.dealerName) nextQuery = nextQuery.ilike("dealer_name", `%${escapeLike(filters.dealerName)}%`);
  if (filters.make) nextQuery = nextQuery.ilike("make", `%${escapeLike(filters.make)}%`);
  if (filters.model) nextQuery = nextQuery.ilike("model", `%${escapeLike(filters.model)}%`);
  if (filters.derivative) nextQuery = nextQuery.ilike("derivative_search", `%${escapeLike(filters.derivative)}%`);
  if (year !== null) nextQuery = nextQuery.eq("listing_year", year);
  if (minPrice !== null) nextQuery = nextQuery.gte("listed_price", minPrice);
  if (maxPrice !== null) nextQuery = nextQuery.lte("listed_price", maxPrice);
  if (minMileage !== null) nextQuery = nextQuery.gte("mileage", minMileage);
  if (maxMileage !== null) nextQuery = nextQuery.lte("mileage", maxMileage);
  if (filters.location) {
    const location = escapeLike(filters.location);
    nextQuery = nextQuery.ilike("location", `%${location}%`);
  }
  if (filters.from) nextQuery = nextQuery.gte("last_seen_date", filters.from);
  if (filters.to) nextQuery = nextQuery.lte("last_seen_date", filters.to);
  return nextQuery;
}

function baseQuery() {
  return getSupabaseAdmin().from("market_intelligence_snapshot");
}

const cachedBootstrap = unstable_cache(async () => {
  const { data, error } = await getSupabaseAdmin().rpc("get_market_intelligence_bootstrap");
  if (error) throw error;
  if (!data?.summary || !data?.options || !data?.generatedAt) throw new Error("The market reporting snapshot is not ready.");
  return data as { summary: Record<string, unknown>; options: Record<string, unknown>; generatedAt: string };
}, ["market-bootstrap-snapshot-v1"], { revalidate: 60 });

function stringOptions(value: unknown) {
  return Array.isArray(value) ? value.map((option) => text(option)).filter(Boolean) : [];
}

async function loadFilterOptions() {
  const { options: values } = await cachedBootstrap();
    return {
      dealerNames: stringOptions(values.dealerNames),
      makes: stringOptions(values.makes),
      models: stringOptions(values.models),
      years: stringOptions(values.years),
    };
}

async function getExactFilteredCount(filters: MarketFilters) {
  const { count, error } = await (applyMarketFilters(baseQuery().select("*", { count: "exact", head: true }) as unknown as MarketFilterQuery, filters) as unknown as Promise<MarketQueryResult>);
  if (error) throw error;
  return count || 0;
}

function summaryNumber(summary: Record<string, unknown>, key: string) {
  const value = Number(summary[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function summaryNullableNumber(summary: Record<string, unknown>, key: string) {
  const value = summary[key];
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function marketGroups(value: unknown): MarketGroup[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, unknown>;
      return {
        name: text(record.name),
        count: summaryNumber(record, "count"),
      };
    })
    .filter((row): row is MarketGroup => Boolean(row && row.name));
}

function marketTrend(value: unknown): MarketTrendPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, unknown>;
      return {
        date: text(record.date),
        removed: summaryNumber(record, "removed"),
      };
    })
    .filter((row): row is MarketTrendPoint => Boolean(row && row.date));
}

function hasAnalysisFilters(filters: MarketFilters) {
  return Boolean(filters.from || filters.to || filters.listingStatus || filters.dealerPrivate || filters.dealerName || filters.make || filters.model || filters.derivative || filters.year || filters.minPrice || filters.maxPrice || filters.minMileage || filters.maxMileage || filters.location);
}

async function loadSummaryAnalytics(): Promise<{ analytics: MarketAnalytics; generatedAt: string }> {
    const { summary: values, generatedAt } = await cachedBootstrap();
    const totalRows = summaryNumber(values, "totalRows");
    return { generatedAt, analytics: {
      totalRows,
      filteredRows: totalRows,
      activeCount: summaryNumber(values, "activeCount"),
      removedCount: summaryNumber(values, "removedCount"),
      dealerCount: summaryNumber(values, "dealerCount"),
      averageAskingPrice: summaryNullableNumber(values, "averageAskingPrice"),
      medianAskingPrice: summaryNullableNumber(values, "medianAskingPrice"),
      averageDaysLive: summaryNullableNumber(values, "averageDaysLive"),
      dealerLeaderboard: [],
      makeModelSoldCounts: [],
      activeStockByDealer: [],
      removedTrend: [],
      sampleLimited: false,
    } };
}

async function loadFilteredAnalytics(filters: MarketFilters): Promise<{ analytics: MarketAnalytics; generatedAt: string }> {
  const { data: summary, error } = await getSupabaseAdmin().rpc("get_market_intelligence_analytics", { filters });
  if (!error && summary && typeof summary === "object" && !Array.isArray(summary)) {
    const values = summary as Record<string, unknown>;
    const totalRows = summaryNumber(values, "totalRows");
    return { generatedAt: text(values.generatedAt), analytics: {
      totalRows,
      filteredRows: summaryNumber(values, "filteredRows"),
      activeCount: summaryNumber(values, "activeCount"),
      removedCount: summaryNumber(values, "removedCount"),
      dealerCount: summaryNumber(values, "dealerCount"),
      averageAskingPrice: summaryNullableNumber(values, "averageAskingPrice"),
      medianAskingPrice: summaryNullableNumber(values, "medianAskingPrice"),
      averageDaysLive: summaryNullableNumber(values, "averageDaysLive"),
      dealerLeaderboard: marketGroups(values.dealerLeaderboard),
      makeModelSoldCounts: marketGroups(values.makeModelSoldCounts),
      activeStockByDealer: marketGroups(values.activeStockByDealer),
      removedTrend: marketTrend(values.removedTrend),
      sampleLimited: false,
    } };
  }

  throw error || new Error("Market analytics returned an invalid response.");
}

// Paging and sorting reuse successful aggregates. All market reads use the
// reporting snapshot; source listings are never scanned by this API.
const cachedFilteredAnalytics = unstable_cache(async (filters: Omit<MarketFilters, "page" | "pageSize" | "sort" | "direction" | "radius">) =>
  loadFilteredAnalytics({ ...filters, page: 1, pageSize: 50, sort: "lastSeen", direction: "desc" }),
["market-filtered-snapshot-v1"], { revalidate: 60 });

async function loadPageRows(filters: MarketFilters) {
  const start = (filters.page - 1) * filters.pageSize;
  const end = start + filters.pageSize - 1;
  let query = applyMarketFilters(baseQuery().select(LISTING_SELECT) as unknown as MarketFilterQuery, filters);
  query = query.order(sortableColumns[filters.sort] || "last_seen_date", { ascending: filters.direction === "asc", nullsFirst: false }).order("listing_id", { ascending: true });
  const { data, error } = await (query.range(start, end) as unknown as Promise<MarketQueryResult>);
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map((row, index) => normalizeMarketListing(row, start + index));
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
          let query = applyMarketFilters(baseQuery().select(LISTING_SELECT) as unknown as MarketFilterQuery, filters);
          query = query.order(sortableColumns[filters.sort] || "last_seen_date", { ascending: filters.direction === "asc", nullsFirst: false }).order("listing_id", { ascending: true });
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
  if (/statement timeout/i.test(message) || (error as { code?: string })?.code === "57014") return "The market database is taking too long to respond. Please retry or apply a narrower make, model or date filter.";
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
    const canLoadAnalysis = hasAnalysisFilters(filters);

    if (format === "csv") return csvResponse(filters, await getExactFilteredCount(filters));

    if (!canLoadAnalysis) {
      const { analytics, generatedAt } = await loadSummaryAnalytics();
      return NextResponse.json({
        filters,
        analytics,
        rows: [],
        pagination: { page: 1, pageSize: filters.pageSize, total: analytics.totalRows, pages: 1 },
        meta: {
          generatedAt,
          totalRows: analytics.totalRows,
          fetchedRows: 0,
          usedServerFilters: true,
          sampleLimited: false,
          summaryOnly: true,
          sortableColumn: null,
        },
      });
    }

    const analysisFilters = {
      from: filters.from, to: filters.to, listingStatus: filters.listingStatus, dealerPrivate: filters.dealerPrivate,
      dealerName: filters.dealerName, make: filters.make, model: filters.model, derivative: filters.derivative,
      year: filters.year, minPrice: filters.minPrice, maxPrice: filters.maxPrice,
      minMileage: filters.minMileage, maxMileage: filters.maxMileage, location: filters.location,
    };
    const [{ analytics, generatedAt }, pageRows] = await Promise.all([
      cachedFilteredAnalytics(analysisFilters),
      loadPageRows(filters),
    ]);

    return NextResponse.json({
      filters,
      analytics,
      rows: pageRows,
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        total: analytics.filteredRows,
        pages: Math.max(1, Math.ceil(analytics.filteredRows / filters.pageSize)),
      },
      meta: {
        generatedAt,
        totalRows: analytics.filteredRows,
        fetchedRows: pageRows.length,
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

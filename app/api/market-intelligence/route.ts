import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  applyClientFilters,
  buildMarketAnalytics,
  csvEscape,
  normalizeMarketListing,
  parseMarketFilters,
  sortMarketRows,
} from "@/lib/market-intelligence";

export const dynamic = "force-dynamic";

const ANALYSIS_ROW_LIMIT = 10_000;

function applySafeServerFilters(query: any, filters: ReturnType<typeof parseMarketFilters>) {
  let nextQuery = query;
  if (filters.listingStatus) nextQuery = nextQuery.eq("Listing Status", filters.listingStatus);
  if (filters.dealerPrivate) nextQuery = nextQuery.eq("Dealer or Private", filters.dealerPrivate);
  if (filters.dealerName) nextQuery = nextQuery.ilike("Dealer Name", `%${filters.dealerName}%`);
  if (filters.make) nextQuery = nextQuery.ilike("Make", `%${filters.make}%`);
  if (filters.model) nextQuery = nextQuery.ilike("Model", `%${filters.model}%`);
  if (filters.from) nextQuery = nextQuery.gte("Last Seen Date", filters.from);
  if (filters.to) nextQuery = nextQuery.lte("Last Seen Date", filters.to);
  return nextQuery;
}

async function loadRawRows(filters: ReturnType<typeof parseMarketFilters>) {
  const db = getSupabaseAdmin();
  const filteredQuery = applySafeServerFilters(db.from("autotrader_listings").select("*", { count: "exact" }), filters).range(0, ANALYSIS_ROW_LIMIT - 1);
  const filteredResult = await filteredQuery;

  if (!filteredResult.error) {
    return {
      rows: (filteredResult.data || []) as Record<string, unknown>[],
      totalRows: filteredResult.count || 0,
      usedServerFilters: true,
    };
  }

  console.warn("Market intelligence filtered query failed; falling back to client-side filtering.", filteredResult.error.message);
  const fallback = await db.from("autotrader_listings").select("*", { count: "exact" }).range(0, ANALYSIS_ROW_LIMIT - 1);
  if (fallback.error) throw fallback.error;
  return {
    rows: (fallback.data || []) as Record<string, unknown>[],
    totalRows: fallback.count || 0,
    usedServerFilters: false,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filters = parseMarketFilters(url.searchParams);
    const format = url.searchParams.get("format");
    const { rows: rawRows, totalRows, usedServerFilters } = await loadRawRows(filters);
    const normalized = rawRows.map((row, index) => normalizeMarketListing(row, index));
    const filtered = applyClientFilters(normalized, filters);
    const sorted = sortMarketRows(filtered, filters);
    const start = (filters.page - 1) * filters.pageSize;
    const pageRows = sorted.slice(start, start + filters.pageSize);
    const analytics = buildMarketAnalytics(filtered, totalRows, rawRows.length >= ANALYSIS_ROW_LIMIT);

    if (format === "csv") {
      const headers = ["Listing ID", "Status", "Dealer/Private", "Dealer Name", "Make", "Model", "Derivative", "Year", "Price", "Mileage", "Location", "Postcode", "First Seen", "Last Seen", "Days Live", "Advert URL"];
      const csvRows = sorted.map((row) => [
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

    return NextResponse.json({
      filters,
      analytics,
      rows: pageRows,
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        total: filtered.length,
        pages: Math.max(1, Math.ceil(filtered.length / filters.pageSize)),
      },
      meta: {
        totalRows,
        fetchedRows: rawRows.length,
        usedServerFilters,
        sampleLimited: rawRows.length >= ANALYSIS_ROW_LIMIT,
      },
    });
  } catch (error) {
    console.error("Market intelligence API failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to load AutoTrader market intelligence." }, { status: 500 });
  }
}

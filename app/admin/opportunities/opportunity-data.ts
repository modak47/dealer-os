import type { SupabaseClient } from "@supabase/supabase-js";

type OpportunityRow = Record<string, unknown>;

type ListingRow = {
  "Listing ID": number | string | null;
  "First Seen Date": string | null;
  "Last Seen Date": string | null;
  "Days Live": number | string | null;
  "Listing Status": string | null;
  "Dealer or Private": string | null;
};

type ActivityRow = {
  listing_id: number | string | null;
  activity_type: string | null;
  description: string | null;
  created_at: string | null;
};

const LISTING_SELECT =
  '"Listing ID","First Seen Date","Last Seen Date","Days Live","Listing Status","Dealer or Private"';

function normalizeListingId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? value : null;
}

function earliestDate(...values: (string | null | undefined)[]): string | null {
  return values
    .map(validDate)
    .filter((value): value is string => value !== null)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

function dateFromListingId(value: unknown): string | null {
  const text = String(value ?? "");
  const match = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  const isoDate = `${year}-${month}-${day}T00:00:00.000Z`;
  return validDate(isoDate);
}

async function fetchListingsById(
  supabase: SupabaseClient,
  listingIds: number[],
): Promise<Map<number, ListingRow>> {
  const listings = new Map<number, ListingRow>();

  for (const batch of chunk(listingIds, 500)) {
    const { data, error } = await supabase
      .from("autotrader_listings")
      .select(LISTING_SELECT)
      .in("Listing ID", batch);

    if (error) throw error;

    for (const row of (data ?? []) as ListingRow[]) {
      const listingId = normalizeListingId(row["Listing ID"]);
      if (listingId !== null) listings.set(listingId, row);
    }
  }

  return listings;
}

async function fetchEarliestActivityById(
  supabase: SupabaseClient,
  listingIds: number[],
): Promise<Map<number, string>> {
  const activityByListingId = new Map<number, string>();

  for (const batch of chunk(listingIds, 500)) {
    const { data, error } = await supabase
      .from("opportunity_activity")
      .select("listing_id, activity_type, description, created_at")
      .in("listing_id", batch)
      .order("created_at", { ascending: true });

    if (error) {
      if (["42P01", "42703"].includes(error.code ?? "")) return activityByListingId;
      throw error;
    }

    for (const row of (data ?? []) as ActivityRow[]) {
      const listingId = normalizeListingId(row.listing_id);
      const createdAt = validDate(row.created_at);
      if (listingId === null || !createdAt) continue;
      const activityText = `${row.activity_type ?? ""} ${row.description ?? ""}`.trim();
      if (activityText && !/created/i.test(activityText)) continue;
      activityByListingId.set(listingId, earliestDate(activityByListingId.get(listingId), createdAt) ?? createdAt);
    }
  }

  return activityByListingId;
}

export async function loadOpportunitiesWithListingDates(supabase: SupabaseClient): Promise<{
  data: OpportunityRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from("buying_opportunities")
    .select("*")
    .order("Score", { ascending: false });

  if (error) return { data: data ?? [], error };

  const opportunityRows = ((data ?? []) as OpportunityRow[]).filter((row) => {
    return normalizeListingId(row["Listing ID"]) !== null;
  });
  const listingIds = opportunityRows
    .map((row) => normalizeListingId(row["Listing ID"]))
    .filter((listingId): listingId is number => listingId !== null);
  const [listingsById, earliestActivityById] = await Promise.all([
    fetchListingsById(supabase, listingIds),
    fetchEarliestActivityById(supabase, listingIds),
  ]);

  const merged = opportunityRows.flatMap((row) => {
    const listingId = normalizeListingId(row["Listing ID"]);
    if (listingId === null) return [];

    const listing = listingsById.get(listingId);

    if (!listing) return [];
    if (listing["Listing Status"] !== "Active" || listing["Dealer or Private"] !== "Private") {
      return [];
    }

    return [
      {
        ...row,
        listingFirstSeenAt: earliestDate(
          listing["First Seen Date"],
          earliestActivityById.get(listingId),
          dateFromListingId(listingId),
        ),
        listingLastConfirmedAt: listing["Last Seen Date"],
        listingDaysLive: listing["Days Live"],
        listingStatus: listing["Listing Status"],
        listingSellerType: listing["Dealer or Private"],
      },
    ];
  });

  return { data: merged, error: null };
}

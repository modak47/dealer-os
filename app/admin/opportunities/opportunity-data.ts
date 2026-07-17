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
  const listingsById = await fetchListingsById(supabase, listingIds);

  const merged = opportunityRows.flatMap((row) => {
    const listingId = normalizeListingId(row["Listing ID"]);
    const listing = listingId === null ? null : listingsById.get(listingId);

    if (!listing) return [];
    if (listing["Listing Status"] !== "Active" || listing["Dealer or Private"] !== "Private") {
      return [];
    }

    return [
      {
        ...row,
        listingFirstSeenAt: listing["First Seen Date"],
        listingLastConfirmedAt: listing["Last Seen Date"],
        listingDaysLive: listing["Days Live"],
        listingStatus: listing["Listing Status"],
        listingSellerType: listing["Dealer or Private"],
      },
    ];
  });

  return { data: merged, error: null };
}

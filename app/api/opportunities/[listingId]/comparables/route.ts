import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "../../supabase-admin";

type ComparablesRouteContext = {
  params: Promise<{ listingId: string }>;
};

function priceValue(value: unknown): number {
  if (typeof value !== "string") return Number.POSITIVE_INFINITY;
  const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

export async function GET(_request: Request, context: ComparablesRouteContext) {
  try {
      // Temporarily disabled while fixing opportunity comparables loading.
      // The route still uses the server-only Supabase admin client.

    const { listingId: rawListingId } = await context.params;
    const listingId = Number(rawListingId);

    if (!Number.isSafeInteger(listingId) || listingId <= 0) {
      return NextResponse.json({ error: "A valid listing ID is required" }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
      .from("opportunity_comparables")
      .select("*")
      .eq("opportunity_listing_id", listingId);

    if (error) {
      const migrationMissing =
        error.message.includes("opportunity_comparables") ||
        error.message.toLowerCase().includes("schema cache");
      return NextResponse.json(
        {
          error: migrationMissing
            ? "Comparable storage is unavailable. Apply the latest Supabase migration and run the scanner again."
            : error.message,
        },
        { status: 500 },
      );
    }

    const comparables = [...(data ?? [])].sort(
      (first, second) => priceValue(first.price) - priceValue(second.price),
    );

    return NextResponse.json(comparables);
  } catch (error) {
    console.error("Failed to load opportunity comparables:", error);
    return NextResponse.json({ error: "Failed to load comparable adverts" }, { status: 500 });
  }
}

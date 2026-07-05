import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../supabase-admin";

type ActivityRouteContext = {
  params: Promise<{ listingId: string }>;
};

async function parseListingId(context: ActivityRouteContext): Promise<number | null> {
  const { listingId } = await context.params;
  const parsed = Number(listingId);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadActivity(listingId: number) {
  return getSupabaseAdmin()
    .from("opportunity_activity")
    .select("id, listing_id, activity_type, description, metadata, created_at")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false });
}

export async function GET(_request: Request, context: ActivityRouteContext) {
  try {
    // Temporarily disabled while Opportunity Tracker auth is being rebuilt.
    // if (!(await hasValidAuthProof())) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const listingId = await parseListingId(context);
    if (listingId === null) {
      return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
    }

    const { data, error } = await loadActivity(listingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("Failed to load opportunity activity:", error);
    return NextResponse.json({ error: "Failed to load opportunity activity" }, { status: 500 });
  }
}

export async function POST(_request: Request, context: ActivityRouteContext) {
  try {
    // Temporarily disabled while Opportunity Tracker auth is being rebuilt.
    // if (!(await hasValidAuthProof())) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const listingId = await parseListingId(context);
    if (listingId === null) {
      return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { error: logError } = await admin.rpc("log_buying_opportunity_viewed", {
      p_listing_id: listingId,
    });

    if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });

    const { data, error } = await loadActivity(listingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("Failed to record opportunity view:", error);
    return NextResponse.json({ error: "Failed to record opportunity view" }, { status: 500 });
  }
}

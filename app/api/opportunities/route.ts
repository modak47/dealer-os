import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "./supabase-admin";
import { normalizeOpportunities } from "@/app/admin/opportunities/normalize-opportunity";
import { loadOpportunitiesWithListingDates } from "@/app/admin/opportunities/opportunity-data";

const statuses = new Set([
  "New",
  "Seen",
  "Researching",
  "Contacted",
  "Negotiating",
  "Purchased",
  "Rejected",
]);

type UpdateBody = {
  listingId?: unknown;
  notes?: unknown;
  status?: unknown;
  favourite?: unknown;
  hidden?: unknown;
};

export async function GET() {
  try {
    const { data, error } = await loadOpportunitiesWithListingDates(getSupabaseAdmin());

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(normalizeOpportunities(data ?? []));
  } catch (error) {
    console.error("Failed to load opportunities:", error);
    return NextResponse.json({ error: "Failed to load opportunities" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    // Temporary while Opportunity Tracker auth is being rebuilt.
    // if (!(await hasValidAuthProof())) {
    //   return NextResponse.json(
    //     { error: "Unauthorized" },
    //     { status: 401 }
    //   );
    // }

    const body = (await request.json()) as UpdateBody;
    const listingId = body.listingId;

    if (typeof listingId !== "number" || !Number.isFinite(listingId)) {
      return NextResponse.json({ error: "A valid listingId is required" }, { status: 400 });
    }

    const update: Record<string, boolean | string | null> = {};

    for (const field of ["favourite", "hidden"] as const) {
      if (field in body) {
        if (typeof body[field] !== "boolean") {
          return NextResponse.json({ error: `${field} must be a boolean` }, { status: 400 });
        }
        update[field] = body[field];
      }
    }

    if ("notes" in body) {
      if (body.notes !== null && typeof body.notes !== "string") {
        return NextResponse.json({ error: "notes must be text or null" }, { status: 400 });
      }
      update.notes = body.notes;
    }

    if ("status" in body) {
      if (typeof body.status !== "string" || !statuses.has(body.status)) {
        return NextResponse.json({ error: "Invalid opportunity status" }, { status: 400 });
      }
      update.status = body.status;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No supported fields were supplied" }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
      .rpc("update_buying_opportunity_user_fields", {
        p_listing_id: listingId,
        p_patch: update,
      })
      .maybeSingle();

    if (error) {
      const migrationMissing =
        error.message.includes("update_buying_opportunity_user_fields") ||
        error.message.toLowerCase().includes("schema cache");
      return NextResponse.json(
        {
          error: migrationMissing
            ? "Opportunity Tracker database fields are unavailable. Apply the latest Supabase migration."
            : error.message,
        },
        { status: 500 },
      );
    }
    if (!data) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

    if (typeof data !== "object") {
      return NextResponse.json({ error: "Supabase returned an invalid opportunity" }, { status: 500 });
    }

    for (const field of ["notes", "status", "favourite", "hidden", "updated_at"] as const) {
      if (!(field in data)) {
        return NextResponse.json(
          { error: `Supabase did not return ${field}. Apply the latest Opportunity Tracker migration.` },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to update opportunity:", error);
    return NextResponse.json({ error: "Failed to update opportunity" }, { status: 500 });
  }
}

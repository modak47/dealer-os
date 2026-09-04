import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { allocationReasonPayload, allocationStatusForEligibility, evaluateDealerEligibility, excludedReasonPayload } from "@/lib/dealer-matching";
import { withDealerPreferencesList } from "@/lib/dealer-portal";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText } from "@/lib/website-leads";
import type { DealerPortalAccount } from "@/types/dealer-portal";

export const dynamic = "force-dynamic";

const releaseLeadSelect = [
  "id",
  "status",
  "make",
  "model",
  "year",
  "price",
  "mileage",
  "engine",
  "extras",
  "postcode",
  "normalised_postcode",
  "location_display_name",
  "location_town",
  "latitude",
  "longitude",
  "autotrader_vehicle_lookup_data",
  "autotrader_vehicle_check_data",
  "vehicle_check_status",
].join(",");

function leadId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(request: Request) {
  try {
    if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const websiteLeadId = leadId(body.website_lead_id);
    if (!websiteLeadId) return NextResponse.json({ error: "Select a valid website lead." }, { status: 400 });
    const method = cleanText(body.allocation_method, 40) || "matching_pool";
    if (!["direct", "dealer_group", "matching_pool"].includes(method)) return NextResponse.json({ error: "Allocation method is invalid." }, { status: 400 });
    const requestedDealerIds = Array.isArray(body.dealer_account_ids) ? body.dealer_account_ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
    const db = getSupabaseAdminClient();
    const { data: lead, error: leadError } = await db.from("website_leads").select(releaseLeadSelect).eq("id", websiteLeadId).maybeSingle();
    if (leadError) return NextResponse.json({ error: "Unable to load website lead." }, { status: 500 });
    if (!lead) return NextResponse.json({ error: "Website lead not found." }, { status: 404 });
    const dealerQuery = db.from("dealer_portal_accounts").select("*").eq("account_status", "active");
    const dealerResult = requestedDealerIds.length ? await dealerQuery.in("id", requestedDealerIds) : await dealerQuery;
    if (dealerResult.error) return NextResponse.json({ error: "Unable to load dealer portal accounts." }, { status: 500 });
    const dealers = await withDealerPreferencesList((dealerResult.data ?? []) as DealerPortalAccount[]);
    if (!dealers.length) return NextResponse.json({ error: "No active dealer portal accounts are available for this release." }, { status: 400 });
    const manualOverride = method === "direct" || method === "dealer_group" || requestedDealerIds.length > 0;
    const matchingLead = lead as unknown as Parameters<typeof evaluateDealerEligibility>[1];
    const evaluatedDealers = dealers.map(dealer => ({ dealer, eligibility: evaluateDealerEligibility(dealer, matchingLead) }));
    const availableDealers = method === "matching_pool" && !requestedDealerIds.length
      ? evaluatedDealers.filter(item => item.eligibility.eligible)
      : evaluatedDealers;
    if (!manualOverride && !availableDealers.length) {
      return NextResponse.json({
        error: "No eligible dealer portal accounts are available for this matching pool release.",
        eligibility: evaluatedDealers.map(item => ({
          dealer_account_id: item.dealer.id,
          trading_name: item.dealer.trading_name,
          ...item.eligibility,
        })),
      }, { status: 400 });
    }
    const userId = await getCurrentUserId();
    const now = new Date().toISOString();
    await db.from("dealer_lead_allocations").update({ allocation_status: "withdrawn", updated_at: now, updated_by: userId }).eq("website_lead_id", websiteLeadId).eq("allocation_status", "available");
    const allocations = evaluatedDealers.map(({ dealer, eligibility }) => ({
      website_lead_id: websiteLeadId,
      dealer_account_id: dealer.id,
      allocation_method: method,
      allocation_status: allocationStatusForEligibility(eligibility, manualOverride),
      match_score: null,
      match_reasons: {
        allocation_method: method,
        selected_by_admin: manualOverride,
        ...allocationReasonPayload(eligibility, manualOverride),
      },
      excluded_reasons: eligibility.eligible ? {} : excludedReasonPayload(eligibility),
      created_by: userId,
      updated_by: userId,
    }));
    const { data: inserted, error: allocationError } = await db.from("dealer_lead_allocations").insert(allocations).select("*");
    if (allocationError) return NextResponse.json({ error: `Unable to release lead: ${allocationError.message}` }, { status: 500 });
    const status = requestedDealerIds.length === 1 && method === "direct" ? "dealer_allocated" : "dealer_pool_available";
    const { error: updateError } = await db.from("website_leads").update({ status, updated_at: now }).eq("id", websiteLeadId);
    if (updateError) return NextResponse.json({ error: "Allocations were recorded, but the lead status could not be updated." }, { status: 500 });
    await db.from("dealer_portal_audit_events").insert({
      website_lead_id: websiteLeadId,
      dealer_user_id: userId,
      event_type: "lead_released_to_dealers",
      event_data: { allocation_method: method, dealer_count: dealers.length, available_count: availableDealers.length, excluded_count: evaluatedDealers.length - availableDealers.length },
    });
    return NextResponse.json({
      allocations: inserted ?? [],
      status,
      eligibility: evaluatedDealers.map(item => ({
        dealer_account_id: item.dealer.id,
        trading_name: item.dealer.trading_name,
        ...item.eligibility,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to release lead." }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { releaseBlockReason, type ReleaseState } from "@/lib/website-lead-release";
import { notifyDealerLeadAllocation } from "@/lib/dealer-notifications";
import { dealerPreviouslyHandledClaim } from "@/lib/dealer-portal-lifecycle";
import { allocationReasonPayload, allocationStatusForEligibility, evaluateDealerEligibility, excludedReasonPayload } from "@/lib/dealer-matching";
import { withDealerPreferencesList } from "@/lib/dealer-portal";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText } from "@/lib/website-leads";
import type { DealerLeadAllocation, DealerLeadClaimStatus, DealerPortalAccount } from "@/types/dealer-portal";

export const dynamic = "force-dynamic";

const releaseLeadSelect = [
  "id",
  "updated_at",
  "portal_ready_at",
  "archived_at",
  "marketplace_accepted_offer_id",
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
  "opportunity_mode",
  "marketplace_status",
  "seller_profile",
  "seller_condition",
  "seller_progress",
  "marketplace_fee_amount",
].join(",");

function leadId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export async function POST(request: Request) {
  try {
    if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const websiteLeadId = leadId(body.website_lead_id);
    if (!websiteLeadId) return NextResponse.json({ error: "Select a valid website lead." }, { status: 400 });
    const method = cleanText(body.allocation_method, 40) || "matching_pool";
    if (!["direct", "dealer_group", "matching_pool"].includes(method)) return NextResponse.json({ error: "Allocation method is invalid." }, { status: 400 });
    const requestedDealerIds = stringArray(body.dealer_account_ids);
    if ((method === "direct" && requestedDealerIds.length !== 1) || (method === "dealer_group" && !requestedDealerIds.length)) return NextResponse.json({ error: "Choose the required dealer accounts." }, { status: 400 });
    const requestedOverrideIds = new Set(stringArray(body.previous_dealer_override_ids));
    const allowSelectedPreviousDealerReclaim = body.allow_previous_dealer_reclaim === true || body.allow_previous_dealer_reclaim === "true";
    const db = getSupabaseAdminClient();
    const { data: lead, error: leadError } = await db.from("website_leads").select(releaseLeadSelect).eq("id", websiteLeadId).maybeSingle();
    if (leadError) return NextResponse.json({ error: "Unable to load website lead." }, { status: 500 });
    if (!lead) return NextResponse.json({ error: "Website lead not found." }, { status: 404 });
    const blocked = releaseBlockReason(lead as unknown as ReleaseState);
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
    const dealerQuery = db.from("dealer_portal_accounts").select("*").eq("account_status", "active");
    const dealerResult = requestedDealerIds.length ? await dealerQuery.in("id", requestedDealerIds) : await dealerQuery;
    if (dealerResult.error) return NextResponse.json({ error: "Unable to load dealer portal accounts." }, { status: 500 });
    const dealers = await withDealerPreferencesList((dealerResult.data ?? []) as DealerPortalAccount[]);
    if (!dealers.length) return NextResponse.json({ error: "No active dealer portal accounts are available for this release." }, { status: 400 });
    const previousClaims = await db.from("dealer_lead_claims")
      .select("id,dealer_account_id,status")
      .eq("website_lead_id", websiteLeadId)
      .in("status", ["lost", "returned_to_pool"]);
    if (previousClaims.error) return NextResponse.json({ error: "Unable to load previous dealer claim history." }, { status: 500 });
    const previousDealerIds = new Set((previousClaims.data ?? [])
      .filter(claim => dealerPreviouslyHandledClaim({ status: claim.status as DealerLeadClaimStatus }))
      .map(claim => String(claim.dealer_account_id)));
    const selectedPreviousDealerIds = requestedDealerIds.filter(id => previousDealerIds.has(id));
    const overrideDealerIds = new Set([
      ...[...requestedOverrideIds].filter(id => previousDealerIds.has(id)),
      ...(allowSelectedPreviousDealerReclaim ? selectedPreviousDealerIds : []),
    ]);
    if (selectedPreviousDealerIds.some(id => !overrideDealerIds.has(id))) {
      return NextResponse.json({
        error: "This release includes a dealer that previously Lost or Returned this lead. Staff must explicitly allow previous-dealer reclaim to continue.",
        previous_dealer_ids: selectedPreviousDealerIds,
      }, { status: 409 });
    }
    if (method === "matching_pool" && allowSelectedPreviousDealerReclaim && !requestedOverrideIds.size) {
      return NextResponse.json({ error: "Select the previous dealer to override before allowing reclaim from the matching pool." }, { status: 400 });
    }
    const manualOverride = method === "direct" || method === "dealer_group" || requestedDealerIds.length > 0;
    const matchingLead = lead as unknown as Parameters<typeof evaluateDealerEligibility>[1];
    const evaluatedDealers = dealers.map(dealer => ({ dealer, eligibility: evaluateDealerEligibility(dealer, matchingLead) }));
    const availableDealers = method === "matching_pool" && !requestedDealerIds.length
      ? evaluatedDealers.filter(item => item.eligibility.eligible && (!previousDealerIds.has(item.dealer.id) || overrideDealerIds.has(item.dealer.id)))
      : evaluatedDealers.filter(item => !previousDealerIds.has(item.dealer.id) || overrideDealerIds.has(item.dealer.id));
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

    const allocations = evaluatedDealers.map(({ dealer, eligibility }) => ({
      previousDealer: previousDealerIds.has(dealer.id),
      reclaimOverride: overrideDealerIds.has(dealer.id),
      dealer,
      eligibility,
    })).map(({ dealer, eligibility, previousDealer, reclaimOverride }) => ({
      website_lead_id: websiteLeadId,
      dealer_account_id: dealer.id,
      allocation_method: method,
      allocation_status: previousDealer && !reclaimOverride ? "excluded" : allocationStatusForEligibility(eligibility, manualOverride),
      match_score: null,
      match_reasons: {
        allocation_method: method,
        selected_by_admin: manualOverride,
        previous_dealer_reclaim_override: reclaimOverride,
        ...allocationReasonPayload(eligibility, manualOverride),
      },
      excluded_reasons: previousDealer && !reclaimOverride
        ? { previous_dealer: "Dealer previously Lost or Returned this lead." }
        : eligibility.eligible ? {} : excludedReasonPayload(eligibility),
      created_by: userId,
      updated_by: userId,
    }));
    const { data: committed, error: commitError } = await db.rpc("staff_release_website_lead", {
      p_id: websiteLeadId, p_actor: userId, p_expected_updated_at: (lead as unknown as { updated_at: string }).updated_at,
      p_method: method, p_allocations: allocations,
    });
    if (commitError) return NextResponse.json({ error: commitError.code === "PGRST202" ? "Website Leads migration required." : commitError.message }, { status: 409 });
    const inserted = (committed?.allocations ?? []) as DealerLeadAllocation[];
    const status = committed?.status;
    const dealerById = new Map(dealers.map(dealer => [dealer.id, dealer]));
    const notifications = await Promise.allSettled((inserted ?? [])
      .filter(allocation => allocation.allocation_status === "available")
      .map(allocation => {
        const dealer = dealerById.get(String(allocation.dealer_account_id));
        return dealer ? notifyDealerLeadAllocation({ lead: lead as Parameters<typeof notifyDealerLeadAllocation>[0]["lead"], dealer, allocation, createdBy: userId }) : null;
      })
      .filter(Boolean));
    return NextResponse.json({
      allocations: inserted ?? [],
      notificationWarnings: notifications.filter(result => result.status === "rejected").length,
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

import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText } from "@/lib/website-leads";

export const dynamic = "force-dynamic";

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
    if (!["direct", "dealer_group", "matching_pool", "priority"].includes(method)) return NextResponse.json({ error: "Allocation method is invalid." }, { status: 400 });
    const requestedDealerIds = Array.isArray(body.dealer_account_ids) ? body.dealer_account_ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
    const db = getSupabaseAdminClient();
    const { data: lead, error: leadError } = await db.from("website_leads").select("id,status").eq("id", websiteLeadId).maybeSingle();
    if (leadError) return NextResponse.json({ error: "Unable to load website lead." }, { status: 500 });
    if (!lead) return NextResponse.json({ error: "Website lead not found." }, { status: 404 });
    const dealerQuery = db.from("dealer_portal_accounts").select("id,trading_name").eq("account_status", "active");
    const dealerResult = requestedDealerIds.length ? await dealerQuery.in("id", requestedDealerIds) : await dealerQuery;
    if (dealerResult.error) return NextResponse.json({ error: "Unable to load dealer portal accounts." }, { status: 500 });
    const dealers = dealerResult.data ?? [];
    if (!dealers.length) return NextResponse.json({ error: "No active dealer portal accounts are available for this release." }, { status: 400 });
    const userId = await getCurrentUserId();
    const now = new Date().toISOString();
    await db.from("dealer_lead_allocations").update({ allocation_status: "withdrawn", updated_at: now, updated_by: userId }).eq("website_lead_id", websiteLeadId).eq("allocation_status", "available");
    const allocations = dealers.map(dealer => ({
      website_lead_id: websiteLeadId,
      dealer_account_id: dealer.id,
      allocation_method: method,
      allocation_status: "available",
      match_reasons: requestedDealerIds.length ? { selected_by_admin: true } : { open_matching_pool: true },
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
      event_data: { allocation_method: method, dealer_count: dealers.length },
    });
    return NextResponse.json({ allocations: inserted ?? [], status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to release lead." }, { status: 400 });
  }
}

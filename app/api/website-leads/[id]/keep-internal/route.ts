import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { combineLeadImages } from "@/lib/website-leads";
import type { WebsiteLead } from "@/types/website-lead";

export const dynamic = "force-dynamic";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (!id) return NextResponse.json({ error: "Invalid lead ID." }, { status: 400 });

    const db = getSupabaseAdminClient();
    const { data: existingLead, error: leadLoadError } = await db.from("website_leads").select("id,status").eq("id", id).maybeSingle();
    if (leadLoadError) return NextResponse.json({ error: "Unable to load website lead." }, { status: 500 });
    if (!existingLead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const activeClaims = await db.from("dealer_lead_claims").select("id").eq("website_lead_id", id).in("status", ["claimed", "attempting_contact", "contacted", "offer_made", "negotiating", "agreed_to_purchase", "collection_booked", "purchased", "purchased_later"]).limit(1);
    if (activeClaims.error) return NextResponse.json({ error: "Unable to check dealer claims." }, { status: 500 });
    if ((activeClaims.data ?? []).length) return NextResponse.json({ error: "This lead already has an active dealer claim. Return or close the claim before keeping it for YesMoto." }, { status: 409 });

    const now = new Date().toISOString();
    const userId = await getCurrentUserId();
    const leadUpdate = await db.from("website_leads").update({ status: "internal_buying", updated_at: now }).eq("id", id).select("*").maybeSingle();
    if (leadUpdate.error) return NextResponse.json({ error: "Unable to mark lead as internal." }, { status: 500 });
    if (!leadUpdate.data) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const allocationUpdate = await db.from("dealer_lead_allocations").update({ allocation_status: "withdrawn", updated_at: now, updated_by: userId }).eq("website_lead_id", id).eq("allocation_status", "available");
    if (allocationUpdate.error) return NextResponse.json({ error: "Lead was marked internal, but dealer allocations could not be withdrawn." }, { status: 500 });

    await db.from("dealer_portal_audit_events").insert({
      website_lead_id: id,
      dealer_user_id: userId,
      event_type: "lead_kept_internal",
      event_data: { previous_status: existingLead.status ?? null },
    });

    const lead = leadUpdate.data as WebsiteLead;
    return NextResponse.json({ lead: { ...lead, resolved_images: combineLeadImages(lead) } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to keep lead for YesMoto." }, { status: 400 });
  }
}

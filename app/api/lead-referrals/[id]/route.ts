import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText } from "@/lib/website-leads";

export const dynamic = "force-dynamic";

const outcomes = ["Awaiting response", "Dealer interested", "Dealer declined", "Customer contacted", "Completed", "Cancelled"];
const statusByOutcome: Record<string, string> = {
  "Dealer interested": "Dealer Interested",
  "Dealer declined": "Dealer Declined",
  "Customer contacted": "Customer Contacted",
  Completed: "Completed",
  Cancelled: "Cancelled",
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const outcome = cleanText(body.dealer_outcome, 80);
    if (!outcome || !outcomes.includes(outcome)) return NextResponse.json({ error: "Invalid referral outcome." }, { status: 400 });
    const userId = await getCurrentUserId();
    const updates = {
      dealer_outcome: outcome,
      referral_status: statusByOutcome[outcome] ?? undefined,
      notes: "notes" in body ? cleanText(body.notes, 4000) : undefined,
      updated_by: userId,
    };
    const { data, error } = await getSupabaseAdminClient().from("lead_referrals").update(updates).eq("id", id).select("*,dealer:dealer_contacts(dealer_name,contact_name,email,mobile_number,whatsapp_number,town)").maybeSingle();
    if (error) return NextResponse.json({ error: `Unable to update referral: ${error.message}` }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Referral not found." }, { status: 404 });
    return NextResponse.json({ referral: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update referral." }, { status: 400 });
  }
}

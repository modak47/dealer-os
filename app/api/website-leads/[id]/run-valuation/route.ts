import { NextResponse } from "next/server";
import { createRetailCheck, extractRetailCheckWebsiteLeadUpdates, waitForRetailCheck } from "@/lib/retail-checks";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { normaliseRegistration, lookupVrm, vehicleField } from "@/lib/vrm-lookup";
import type { WebsiteLead } from "@/types/website-lead";

export const dynamic = "force-dynamic";

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function failLead(id: number, message: string) {
  await getSupabaseAdminClient().from("website_leads").update({ valuation_status: "failed", valuation_error: message, updated_at: new Date().toISOString() }).eq("id", id);
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: "Invalid lead ID." }, { status: 400 });

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("website_leads").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load website lead." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const lead = data as WebsiteLead;
  const registration = normaliseRegistration(lead.reg);
  if (!registration) return NextResponse.json({ error: "Registration required" }, { status: 400 });
  if (lead.valuation_status === "processing") return NextResponse.json({ error: "Valuation in progress" }, { status: 409 });

  const now = new Date().toISOString();
  await supabase.from("website_leads").update({ valuation_status: "processing", valuation_started_at: now, valuation_error: null, updated_at: now }).eq("id", id);

  try {
    let lookup;
    try {
      lookup = await lookupVrm(registration);
    } catch (lookupError) {
      throw new Error(`VRM lookup failed: ${lookupError instanceof Error ? lookupError.message : "service unavailable"}`);
    }
    const retailCheck = await createRetailCheck({
      registration,
      make: vehicleField(lookup, "make") || lead.make,
      model: vehicleField(lookup, "model") || lead.model,
      year: vehicleField(lookup, "year") || lead.year,
      mileage: lead.mileage,
      askingPrice: lead.price,
    });
    await supabase.from("website_leads").update({ retail_check_id: String(retailCheck.id), updated_at: new Date().toISOString() }).eq("id", id);
    const completed = await waitForRetailCheck(retailCheck.id);
    const valuationUpdates = extractRetailCheckWebsiteLeadUpdates(completed);
    const completedAt = new Date().toISOString();
    const { error: updateError } = await supabase.from("website_leads").update({
      retail_check_id: String(retailCheck.id),
      valuation_status: "completed",
      valuation_completed_at: completedAt,
      valuation_error: null,
      updated_at: completedAt,
      ...valuationUpdates,
    }).eq("id", id);
    if (updateError) throw new Error(updateError.message || "Unable to update Website Lead valuation results");
    return NextResponse.json({ retail_check_id: String(retailCheck.id), valuation: completed });
  } catch (runError) {
    const message = runError instanceof Error ? runError.message : "Valuation service unavailable";
    await failLead(id, message);
    return NextResponse.json({ error: message }, { status: /timed out/i.test(message) ? 504 : 500 });
  }
}

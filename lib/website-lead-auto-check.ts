import "server-only";

import { lookupVehicleByVrm } from "@/lib/autotrader-vehicle-lookup";
import { createRetailCheck } from "@/lib/retail-checks";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { normaliseRegistration } from "@/lib/vrm-lookup";

type AutoCheckLead = {
  reg?: string | null;
  make?: string | null;
  model?: string | null;
  year?: string | null;
  mileage?: string | null;
  price?: string | null;
  retail_check_id?: string | null;
};

export async function createAutomaticVehicleCheckForWebsiteLead(leadId: number | string, lead: AutoCheckLead) {
  const registration = normaliseRegistration(lead.reg);
  if (!registration || lead.retail_check_id) return { skipped: true, reason: lead.retail_check_id ? "already_linked" : "missing_registration" };

  const db = getSupabaseAdminClient();
  const now = new Date().toISOString();
  await db.from("website_leads").update({ valuation_status: "processing", valuation_started_at: now, valuation_error: null, updated_at: now }).eq("id", leadId);

  try {
    const lookup = await lookupVehicleByVrm(registration);
    const retailCheck = await createRetailCheck({
      registration,
      make: lookup.make || lead.make,
      model: lookup.model || lead.model,
      year: lookup.year ? String(lookup.year) : lead.year,
      mileage: lead.mileage,
      askingPrice: lead.price,
      requestId: `website-lead:${leadId}:auto-vehicle-check:v1`,
      derivative: lookup.derivative,
      derivativeId: lookup.derivativeId,
      autotraderVehicleId: lookup.vehicleId,
      autotraderTaxonomyData: lookup.taxonomyData,
      autotraderMotData: { motTests: lookup.motTests ?? null, history: lookup.history ?? null, check: lookup.check ?? null },
    });
    await db.from("website_leads").update({ retail_check_id: String(retailCheck.id), updated_at: new Date().toISOString() }).eq("id", leadId);
    return { skipped: false, retail_check_id: String(retailCheck.id) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automatic vehicle check failed.";
    await db.from("website_leads").update({ valuation_status: "failed", valuation_error: message, updated_at: new Date().toISOString() }).eq("id", leadId);
    console.warn("Automatic website lead vehicle check failed.", { leadId, registration, message });
    return { skipped: false, error: message };
  }
}

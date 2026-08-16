import "server-only";

import { lookupVehicleByVrm } from "@/lib/autotrader-vehicle-lookup";
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
  vehicle_check_status?: string | null;
};

export async function createAutomaticVehicleCheckForWebsiteLead(leadId: number | string, lead: AutoCheckLead) {
  const registration = normaliseRegistration(lead.reg);
  if (!registration) return { skipped: true, reason: "missing_registration" };
  if (lead.vehicle_check_status === "checked") return { skipped: true, reason: "already_checked" };

  const db = getSupabaseAdminClient();
  const now = new Date().toISOString();
  await db.from("website_leads").update({ vehicle_check_status: "processing", vehicle_check_error: null, updated_at: now }).eq("id", leadId);

  try {
    const lookup = await lookupVehicleByVrm(registration);
    const checkedAt = new Date().toISOString();
    await db.from("website_leads").update({
      autotrader_vehicle_id: lookup.vehicleId ?? null,
      autotrader_vehicle_lookup_data: lookup.taxonomyData ?? {},
      autotrader_vehicle_check_data: {
        check: lookup.check ?? null,
        history: lookup.history ?? null,
        motTests: lookup.motTests ?? null,
        vehicleCheck: lookup.vehicleCheck ?? null,
      },
      vehicle_check_status: "checked",
      vehicle_check_checked_at: checkedAt,
      vehicle_check_error: null,
      updated_at: checkedAt,
    }).eq("id", leadId);
    return { skipped: false, checked: true, autotrader_vehicle_id: lookup.vehicleId ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automatic vehicle check failed.";
    await db.from("website_leads").update({ vehicle_check_status: "failed", vehicle_check_error: message, updated_at: new Date().toISOString() }).eq("id", leadId);
    console.warn("Automatic website lead vehicle check failed.", { leadId, registration, message });
    return { skipped: false, error: message };
  }
}

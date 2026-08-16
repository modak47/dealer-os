import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { createAutomaticVehicleCheckForWebsiteLead } from "@/lib/website-lead-auto-check";

export const dynamic = "force-dynamic";

type BackfillLead = {
  id: number;
  reg: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  mileage: string | null;
  price: string | null;
  retail_check_id: string | null;
};

export async function POST(request: Request) {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const limit = Math.min(Math.max(Number(body.limit ?? 25) || 25, 1), 25);
  const { data, error } = await getSupabaseAdminClient()
    .from("website_leads")
    .select("id,reg,make,model,year,mileage,price,retail_check_id")
    .not("reg", "is", null)
    .is("retail_check_id", null)
    .order("id", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: "Unable to load website leads for vehicle-check backfill." }, { status: 500 });

  const results = [];
  for (const lead of (data ?? []) as BackfillLead[]) {
    if (!String(lead.reg ?? "").trim()) {
      results.push({ id: lead.id, skipped: true, reason: "missing_registration" });
      continue;
    }
    const result = await createAutomaticVehicleCheckForWebsiteLead(lead.id, lead);
    results.push({ id: lead.id, reg: lead.reg, ...result });
  }

  return NextResponse.json({
    requested: limit,
    processed: results.length,
    created: results.filter(result => "retail_check_id" in result).length,
    failed: results.filter(result => "error" in result).length,
    skipped: results.filter(result => result.skipped).length,
    results,
  });
}

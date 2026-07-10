import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText, safeNumber } from "@/lib/website-leads";
import type { DealerContact } from "@/types/referral";

export const dynamic = "force-dynamic";

function cleanDealerPayload(body: Record<string, unknown>, userId: string | null) {
  const payload: Record<string, unknown> = { updated_by: userId };
  for (const key of ["dealer_name", "contact_name", "email", "mobile_number", "landline_number", "whatsapp_number", "town", "postcode", "notes", "preferred_contact_method", "bike_types_interested", "referral_fee_arrangement"]) {
    if (key in body) payload[key] = cleanText(body[key], key === "notes" ? 4000 : 1000);
  }
  if ("active" in body) payload.active = Boolean(body.active);
  if ("brands_handled" in body) payload.brands_handled = Array.isArray(body.brands_handled) ? body.brands_handled.filter((value): value is string => typeof value === "string").map(value => value.trim()).filter(Boolean) : [];
  for (const key of ["max_collection_radius_miles", "min_purchase_value", "max_purchase_value"]) if (key in body) payload[key] = safeNumber(body[key]);
  if ("dealer_name" in payload && !payload.dealer_name) throw new Error("Dealer name is required.");
  if ("preferred_contact_method" in payload && !["email", "whatsapp", "sms", "phone"].includes(String(payload.preferred_contact_method))) throw new Error("Preferred contact method is invalid.");
  return payload;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const { id } = await params;
  const db = getSupabaseAdminClient();
  const [dealerResult, referralsResult] = await Promise.all([
    db.from("dealer_contacts").select("*").eq("id", id).maybeSingle(),
    db.from("lead_referrals").select("*,dealer:dealer_contacts(dealer_name,contact_name,email,mobile_number,whatsapp_number,town)").eq("dealer_contact_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (dealerResult.error) return NextResponse.json({ error: "Unable to load dealer contact." }, { status: 500 });
  if (!dealerResult.data) return NextResponse.json({ error: "Dealer contact not found." }, { status: 404 });
  return NextResponse.json({ dealer: { ...(dealerResult.data as DealerContact), recent_referrals: referralsResult.data ?? [] } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    const { id } = await params;
    const userId = await getCurrentUserId();
    const body = await request.json() as Record<string, unknown>;
    const payload = cleanDealerPayload(body, userId);
    const { data, error } = await getSupabaseAdminClient().from("dealer_contacts").update(payload).eq("id", id).select("*").maybeSingle();
    if (error) return NextResponse.json({ error: `Unable to update dealer contact: ${error.message}` }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Dealer contact not found." }, { status: 404 });
    return NextResponse.json({ dealer: data as DealerContact });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update dealer contact." }, { status: 400 });
  }
}

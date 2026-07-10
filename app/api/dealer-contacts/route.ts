import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText, safeNumber } from "@/lib/website-leads";
import type { DealerContact } from "@/types/referral";

export const dynamic = "force-dynamic";

function cleanDealerPayload(body: Record<string, unknown>, userId: string | null, creating: boolean) {
  const payload: Record<string, unknown> = {
    dealer_name: cleanText(body.dealer_name, 160),
    contact_name: cleanText(body.contact_name, 160),
    email: cleanText(body.email, 180),
    mobile_number: cleanText(body.mobile_number, 80),
    landline_number: cleanText(body.landline_number, 80),
    whatsapp_number: cleanText(body.whatsapp_number, 80),
    town: cleanText(body.town, 120),
    postcode: cleanText(body.postcode, 30),
    notes: cleanText(body.notes, 4000),
    preferred_contact_method: cleanText(body.preferred_contact_method, 20) || "email",
    active: "active" in body ? Boolean(body.active) : true,
    brands_handled: Array.isArray(body.brands_handled) ? body.brands_handled.filter((value): value is string => typeof value === "string").map(value => value.trim()).filter(Boolean) : [],
    max_collection_radius_miles: safeNumber(body.max_collection_radius_miles),
    bike_types_interested: cleanText(body.bike_types_interested, 1000),
    min_purchase_value: safeNumber(body.min_purchase_value),
    max_purchase_value: safeNumber(body.max_purchase_value),
    referral_fee_arrangement: cleanText(body.referral_fee_arrangement, 1000),
    updated_by: userId,
  };
  if (!payload.dealer_name) throw new Error("Dealer name is required.");
  if (!["email", "whatsapp", "sms", "phone"].includes(String(payload.preferred_contact_method))) throw new Error("Preferred contact method is invalid.");
  if (!payload.email && !payload.mobile_number && !payload.landline_number && !payload.whatsapp_number) throw new Error("At least one contact method is required.");
  if (creating) payload.created_by = userId;
  return payload;
}

export async function GET(request: Request) {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim();
  const active = url.searchParams.get("active");
  const db = getSupabaseAdminClient();
  let query = db.from("dealer_contacts").select("*").order("dealer_name", { ascending: true }).limit(200);
  if (active === "true") query = query.eq("active", true);
  if (active === "false") query = query.eq("active", false);
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(`dealer_name.ilike.${pattern},contact_name.ilike.${pattern},email.ilike.${pattern},mobile_number.ilike.${pattern},town.ilike.${pattern},postcode.ilike.${pattern}`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Unable to load dealer contacts." }, { status: 500 });
  return NextResponse.json({ dealers: (data ?? []) as DealerContact[] });
}

export async function POST(request: Request) {
  try {
    if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    const userId = await getCurrentUserId();
    const body = await request.json() as Record<string, unknown>;
    const payload = cleanDealerPayload(body, userId, true);
    const { data, error } = await getSupabaseAdminClient().from("dealer_contacts").insert(payload).select("*").single();
    if (error) return NextResponse.json({ error: `Unable to create dealer contact: ${error.message}` }, { status: 500 });
    return NextResponse.json({ dealer: data as DealerContact }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create dealer contact." }, { status: 400 });
  }
}

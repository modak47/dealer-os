import { NextResponse } from "next/server";
import { leadLocationUpdate, lookupLeadLocation } from "@/lib/location";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText, combineLeadImages } from "@/lib/website-leads";
import type { WebsiteLead } from "@/types/website-lead";

export const dynamic = "force-dynamic";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: "Invalid lead ID." }, { status: 400 });

  const db = getSupabaseAdminClient();
  const { data: leadRow, error: leadError } = await db.from("website_leads").select("*").eq("id", id).maybeSingle();
  if (leadError) return NextResponse.json({ error: "Unable to load website lead." }, { status: 500 });
  if (!leadRow) return NextResponse.json({ error: "Website lead not found." }, { status: 404 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const lead = leadRow as WebsiteLead;
  const address = cleanText(body.address, 1000);
  const postcode = cleanText(body.postcode, 30);
  const town = cleanText(body.town, 120);
  const result = await lookupLeadLocation({
    address: address || null,
    postcode: postcode || lead.postcode,
    town: town || lead.location_town,
  });

  const { data, error } = await db.from("website_leads").update({ ...leadLocationUpdate(result), updated_at: new Date().toISOString() }).eq("id", id).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: `Unable to save location lookup: ${error.message}` }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Website lead not found." }, { status: 404 });
  const refreshed = data as WebsiteLead;
  return NextResponse.json({ lead: { ...refreshed, resolved_images: combineLeadImages(refreshed) }, location: result });
}

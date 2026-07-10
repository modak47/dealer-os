import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText, combineLeadImages, isValidLeadStatus, safeNumber } from "@/lib/website-leads";
import type { WebsiteLead, WebsiteLeadUpdate } from "@/types/website-lead";

export const dynamic = "force-dynamic";

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function cleanTimestamp(value: unknown): string | null {
  const text = cleanText(value, 80);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildUpdates(body: Record<string, unknown>): WebsiteLeadUpdate {
  const updates: WebsiteLeadUpdate = {};
  if ("valuation_status" in body) updates.valuation_status = cleanText(body.valuation_status, 80);
  if ("retail_estimate" in body) updates.retail_estimate = safeNumber(body.retail_estimate);
  if ("suggested_offer" in body) updates.suggested_offer = safeNumber(body.suggested_offer);
  if ("estimated_margin" in body) updates.estimated_margin = safeNumber(body.estimated_margin);
  if ("similar_bikes" in body) updates.similar_bikes = cleanText(body.similar_bikes, 6000);
  if ("auto_trader_search" in body) updates.auto_trader_search = cleanText(body.auto_trader_search, 1000);
  if ("valuation_notes" in body) updates.valuation_notes = cleanText(body.valuation_notes, 6000);
  if ("Motorway output" in body) updates["Motorway output"] = cleanText(body["Motorway output"], 6000);
  if ("internal_notes" in body) updates.internal_notes = cleanText(body.internal_notes, 6000);
  if ("status" in body) {
    const status = cleanText(body.status, 40);
    if (!isValidLeadStatus(status)) throw new Error("Invalid lead status.");
    updates.status = status;
  }
  if ("assigned_to" in body) updates.assigned_to = cleanText(body.assigned_to, 120);
  if ("contacted_at" in body) updates.contacted_at = cleanTimestamp(body.contacted_at);
  if ("offer_made_at" in body) updates.offer_made_at = cleanTimestamp(body.offer_made_at);
  if ("purchased_at" in body) updates.purchased_at = cleanTimestamp(body.purchased_at);
  if ("retail_check_id" in body) updates.retail_check_id = cleanText(body.retail_check_id, 80);
  if ("valuation_started_at" in body) updates.valuation_started_at = cleanTimestamp(body.valuation_started_at);
  if ("valuation_completed_at" in body) updates.valuation_completed_at = cleanTimestamp(body.valuation_completed_at);
  if ("valuation_error" in body) updates.valuation_error = cleanText(body.valuation_error, 1000);
  return updates;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: "Invalid lead ID." }, { status: 400 });
  const { data, error } = await getSupabaseAdminClient().from("website_leads").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load website lead." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  const lead = data as WebsiteLead;
  return NextResponse.json({ lead: { ...lead, resolved_images: combineLeadImages(lead) } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: "Invalid lead ID." }, { status: 400 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const updates = buildUpdates(body);
    if (!Object.keys(updates).length) return NextResponse.json({ error: "No editable fields supplied." }, { status: 400 });
    const { data, error } = await getSupabaseAdminClient().from("website_leads").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select("*").maybeSingle();
    if (error) return NextResponse.json({ error: "Unable to update website lead." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    const lead = data as WebsiteLead;
    return NextResponse.json({ lead: { ...lead, resolved_images: combineLeadImages(lead) } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid lead update." }, { status: 400 });
  }
}

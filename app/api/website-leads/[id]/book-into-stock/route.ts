import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { cleanLocationText, leadLocationUpdate, lookupLeadLocation, stockLocationUpdate } from "@/lib/location";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText, combineLeadImages, safeNumber } from "@/lib/website-leads";
import type { WebsiteLead } from "@/types/website-lead";

export const dynamic = "force-dynamic";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function positiveNumber(value: unknown, label: string) {
  const parsed = safeNumber(value) ?? 0;
  if (parsed < 0) throw new Error(`${label} cannot be negative.`);
  return parsed;
}

function optionalDate(value: unknown, label: string) {
  const text = cleanText(value, 40);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be valid.`);
  return date.toISOString().slice(0, 10);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const id = parseId(rawId);
    if (!id) return NextResponse.json({ error: "Invalid lead ID." }, { status: 400 });
    const body = await request.json() as Record<string, unknown>;
    const db = getSupabaseAdminClient();
    const { data: leadRow, error: leadError } = await db.from("website_leads").select("*").eq("id", id).maybeSingle();
    if (leadError) return NextResponse.json({ error: "Unable to load website lead." }, { status: 500 });
    if (!leadRow) return NextResponse.json({ error: "Website lead not found." }, { status: 404 });
    const lead = leadRow as WebsiteLead;
    const existing = await db.from("stock_bikes").select("id,stock_number,status").eq("website_lead_id", id).neq("status", "Purchase Cancelled").maybeSingle();
    if (existing.error) return NextResponse.json({ error: "Unable to check existing stock records." }, { status: 500 });
    if (existing.data) return NextResponse.json({ error: "This lead has already been booked into stock.", stock_id: existing.data.id }, { status: 409 });
    const make = cleanText(body.make, 80) || lead.make;
    const model = cleanText(body.model, 120) || lead.model;
    if (!make || !model) return NextResponse.json({ error: "Make and model are required." }, { status: 400 });
    const stockNumberResult = await db.rpc("reserve_next_stock_number");
    if (stockNumberResult.error || !stockNumberResult.data) return NextResponse.json({ error: "Unable to reserve stock number. Run the purchase pending migration." }, { status: 500 });
    const purchasePrice = positiveNumber(body.purchase_price, "Purchase price");
    const targetRetailPrice = positiveNumber(body.target_retail_price, "Target retail price");
    const minimumRetailPrice = positiveNumber(body.minimum_retail_price, "Minimum retail price");
    const estimatedPreparationCost = positiveNumber(body.estimated_preparation_cost, "Estimated preparation cost");
    const estimatedTransportCost = positiveNumber(body.estimated_transport_cost, "Estimated transport cost");
    const otherEstimatedCosts = positiveNumber(body.other_estimated_costs, "Other estimated costs");
    const depositPaid = positiveNumber(body.deposit_paid, "Deposit paid");
    const balanceOutstanding = positiveNumber(body.balance_outstanding, "Balance outstanding");
    const imageUrls = Array.isArray(body.image_urls) ? body.image_urls.filter((value): value is string => typeof value === "string" && Boolean(value.trim())) : combineLeadImages(lead);
    const collectionAddress = cleanText(body.customer_address, 1000);
    const collectionPostcode = cleanText(body.customer_postcode, 30) || lead.postcode;
    const collectionNotes = cleanText(body.collection_notes, 2000);
    const locationResult = await lookupLeadLocation({
      address: collectionAddress,
      postcode: collectionPostcode,
      town: cleanLocationText(lead.location_town, 120),
    });
    const now = new Date().toISOString();
    const userId = await getCurrentUserId();
    const payload = {
      registration: cleanText(body.registration, 30) || lead.reg,
      make,
      model,
      variant: cleanText(body.variant, 120),
      year: safeNumber(body.year ?? lead.year),
      mileage: safeNumber(body.mileage ?? lead.mileage),
      price: targetRetailPrice || null,
      status: "Purchase Pending",
      stock_number: String(stockNumberResult.data),
      website_lead_id: id,
      customer_name: cleanText(body.customer_name, 180),
      customer_phone: cleanText(body.customer_phone, 80),
      customer_email: cleanText(body.customer_email, 160),
      customer_postcode: locationResult.normalisedPostcode || collectionPostcode,
      customer_address: collectionAddress,
      ...stockLocationUpdate(locationResult, collectionAddress, collectionNotes),
      purchase_price: purchasePrice,
      target_retail_price: targetRetailPrice,
      minimum_retail_price: minimumRetailPrice,
      estimated_preparation_cost: estimatedPreparationCost,
      estimated_transport_cost: estimatedTransportCost,
      other_estimated_costs: otherEstimatedCosts,
      deposit_paid: depositPaid,
      balance_outstanding: balanceOutstanding,
      payment_status: cleanText(body.payment_status, 80) || "Unpaid",
      expected_arrival_date: optionalDate(body.expected_arrival_date, "Expected arrival date"),
      purchase_notes: cleanText(body.purchase_notes, 4000),
      purchase_agreed_at: now,
      show_on_website: false,
      reserve_enabled: false,
      workshop_status: "Locked until arrival",
      valeting_status: "Locked until arrival",
      photo_status: "Locked until arrival",
      image_urls: imageUrls,
      primary_image_url: imageUrls[0] ?? null,
      notes: cleanText(body.purchase_notes, 4000),
      created_by: userId,
      updated_by: userId,
    };
    const { data: stock, error: stockError } = await db.from("stock_bikes").insert(payload).select("*").single();
    if (stockError) {
      const duplicate = stockError.code === "23505" || /duplicate|unique/i.test(stockError.message);
      return NextResponse.json({ error: duplicate ? "This lead has already been booked into stock." : `Unable to create stock record: ${stockError.message}` }, { status: duplicate ? 409 : 500 });
    }
    const updateLead = await db.from("website_leads").update({ ...leadLocationUpdate(locationResult), status: "purchase_agreed", stock_bike_id: stock.id, purchase_agreed_at: now, updated_at: now }).eq("id", id);
    if (updateLead.error) console.warn("Stock record created but website lead link update failed.", updateLead.error.message);
    return NextResponse.json({ stock }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to book lead into stock." }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { cleanText, combineLeadImages, isValidLeadStatus, safeNumber } from "@/lib/website-leads";
import type { WebsiteLead, WebsiteLeadStatus } from "@/types/website-lead";

export const dynamic = "force-dynamic";

const defaultSelect = "*";
const listSelect = "id,reg,make,model,price,website,status,valuation_status,date,created_at,images,Images,image1,image2,image3,image4,image5,image6,image7,image8,image9,image10,retail_check_id,retail_estimate,suggested_offer,estimated_margin";
const sourceLabels: Record<string, string> = { bikebuyeruk: "Bike Buyer UK", sellyourmotorbike: "Sell Your Motorbike", motorcyclebuyer: "Motorcycle Buyer" };

type LeadQueryResult = { data?: unknown; error?: { message?: string; code?: string } | null; count?: number | null };
type LeadQuery = PromiseLike<LeadQueryResult> & {
  eq(column: string, value: unknown): LeadQuery;
  in(column: string, values: unknown[]): LeadQuery;
  gte(column: string, value: unknown): LeadQuery;
  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean }): LeadQuery;
  limit(count: number): LeadQuery;
};

function imageValue(body: Record<string, unknown>, key: string): string | null {
  return cleanText(body[key], 1000);
}

function cleanPayload(body: Record<string, unknown>) {
  const suppliedStatus = cleanText(body.status, 40);
  const status: WebsiteLeadStatus = isValidLeadStatus(suppliedStatus) ? suppliedStatus : "new";
  const images = Array.isArray(body.images) ? body.images.flatMap(value => cleanText(value, 1000) ?? []) : null;
  const now = new Date().toISOString();
  return {
    owner: cleanText(body.owner, 120),
    reg: cleanText(body.reg ?? body.registration, 30),
    make: cleanText(body.make, 80),
    model: cleanText(body.model, 120),
    year: cleanText(body.year, 20),
    engine: cleanText(body.engine, 60),
    colour: cleanText(body.colour ?? body.color, 60),
    mileage: cleanText(body.mileage, 40),
    owners: cleanText(body.owners, 40),
    spare_keys: cleanText(body.spare_keys ?? body.spareKeys, 40),
    bike_condition: cleanText(body.bike_condition ?? body.condition, 500),
    damage: cleanText(body.damage, 1000),
    history: cleanText(body.history, 1000),
    service: cleanText(body.service ?? body.service_history, 1000),
    mot: cleanText(body.mot, 120),
    extras: cleanText(body.extras, 1000),
    price: cleanText(body.price ?? body.asking_price, 80),
    fname: cleanText(body.fname ?? body.first_name, 100),
    lname: cleanText(body.lname ?? body.last_name, 100),
    email: cleanText(body.email, 160),
    phone: cleanText(body.phone ?? body.telephone, 80),
    postcode: cleanText(body.postcode, 30),
    image1: imageValue(body, "image1"),
    image2: imageValue(body, "image2"),
    image3: imageValue(body, "image3"),
    image4: imageValue(body, "image4"),
    image5: imageValue(body, "image5"),
    image6: imageValue(body, "image6"),
    image7: imageValue(body, "image7"),
    image8: imageValue(body, "image8"),
    image9: imageValue(body, "image9"),
    image10: imageValue(body, "image10"),
    website: cleanText(body.website ?? body.source, 80),
    date: cleanText(body.date, 80) ?? now,
    Images: cleanText(body.Images ?? body.legacy_images, 6000),
    valuation_status: cleanText(body.valuation_status, 80) ?? "pending",
    retail_estimate: safeNumber(body.retail_estimate),
    suggested_offer: safeNumber(body.suggested_offer),
    estimated_margin: safeNumber(body.estimated_margin),
    similar_bikes: cleanText(body.similar_bikes, 6000),
    auto_trader_search: cleanText(body.auto_trader_search, 1000),
    valuation_notes: cleanText(body.valuation_notes, 6000),
    "Motorway output": cleanText(body["Motorway output"] ?? body.motorway_output, 6000),
    images,
    status,
    assigned_to: cleanText(body.assigned_to, 120),
    internal_notes: cleanText(body.internal_notes, 6000),
    created_at: now,
    updated_at: now,
  };
}

function leadQuery(query: unknown): LeadQuery {
  return query as LeadQuery;
}

function applyLeadFilters(query: LeadQuery, searchParams: URLSearchParams) {
  const status = searchParams.get("status");
  const valuationStatus = searchParams.get("valuation_status");
  const website = searchParams.get("website");
  if (status) query = query.eq("status", status);
  if (valuationStatus) query = query.eq("valuation_status", valuationStatus);
  if (website) query = query.eq("website", website);
  return query;
}

async function countLeads(searchParams: URLSearchParams, extra?: (query: LeadQuery) => LeadQuery) {
  let query = applyLeadFilters(leadQuery(getSupabaseAdminClient().from("website_leads").select("id", { count: "exact", head: true })), searchParams);
  if (extra) query = extra(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function websiteLeadSummary(searchParams: URLSearchParams) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - ((startOfToday.getDay() + 6) % 7));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const latestLimit = Math.min(Math.max(Number(searchParams.get("limit") ?? 5) || 5, 1), 20);
  const supabase = getSupabaseAdminClient();
  const latestQuery = applyLeadFilters(leadQuery(supabase.from("website_leads").select(listSelect)), searchParams).order("date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false, nullsFirst: false }).limit(latestLimit);
  const [total, newCount, pendingValuations, receivedToday, receivedThisWeek, purchasedThisMonth, bikeBuyerUk, sellYourMotorbike, motorcycleBuyer, latestResult] = await Promise.all([
    countLeads(searchParams),
    countLeads(searchParams, query => query.eq("status", "new")),
    countLeads(searchParams, query => query.in("valuation_status", ["pending", "processing", "in_progress"])),
    countLeads(searchParams, query => query.gte("date", startOfToday.toISOString())),
    countLeads(searchParams, query => query.gte("date", startOfWeek.toISOString())),
    countLeads(searchParams, query => query.eq("status", "purchased").gte("purchased_at", startOfMonth.toISOString())),
    countLeads(searchParams, query => query.eq("website", "bikebuyeruk")),
    countLeads(searchParams, query => query.eq("website", "sellyourmotorbike")),
    countLeads(searchParams, query => query.eq("website", "motorcyclebuyer")),
    latestQuery,
  ]);
  if (latestResult.error) throw latestResult.error;
  const latestLeads = ((latestResult.data ?? []) as WebsiteLead[]).map(lead => ({ ...lead, resolved_images: combineLeadImages(lead) }));
  return { total, new: newCount, pendingValuations, receivedToday, receivedThisWeek, purchasedThisMonth, sourceCounts: { bikebuyeruk: bikeBuyerUk, sellyourmotorbike: sellYourMotorbike, motorcyclebuyer: motorcycleBuyer }, sourceLabels, latestLeads };
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  if (searchParams.get("summary") === "true") {
    try {
      return NextResponse.json({ summary: await websiteLeadSummary(searchParams) });
    } catch (error) {
      console.error("Website leads summary failed.", { message: error instanceof Error ? error.message : "Unknown error" });
      return NextResponse.json({ error: "Unable to load website leads summary." }, { status: 500 });
    }
  }
  const limit = Number(searchParams.get("limit") ?? 0);
  const sort = searchParams.get("sort") ?? "newest";
  let query = applyLeadFilters(leadQuery(getSupabaseAdminClient().from("website_leads").select(defaultSelect)), searchParams);
  if (sort === "oldest") query = query.order("date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true, nullsFirst: false });
  else if (sort === "highest_margin") query = query.order("estimated_margin", { ascending: false, nullsFirst: false });
  else if (sort === "highest_offer") query = query.order("suggested_offer", { ascending: false, nullsFirst: false });
  else query = query.order("date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false, nullsFirst: false });
  if (Number.isFinite(limit) && limit > 0) query = query.limit(Math.min(limit, 500));
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Unable to load website leads." }, { status: 500 });
  const leads = ((data ?? []) as WebsiteLead[]).map(lead => ({ ...lead, resolved_images: combineLeadImages(lead) }));
  return NextResponse.json({ leads });
}

export async function POST(request: Request) {
  try {
    const expectedSecret = process.env.WEBSITE_LEADS_WEBHOOK_SECRET;
    const providedSecret = request.headers.get("x-webhook-secret");
    if (!expectedSecret || providedSecret !== expectedSecret) {
      console.warn("Website leads webhook rejected because the secret was missing or invalid.");
      return NextResponse.json({ error: "Unauthorised webhook request." }, { status: 401 });
    }
    const body = await request.json() as Record<string, unknown>;
    const payload = cleanPayload(body);
    const meaningfulDetails = [payload.reg, payload.make, payload.model, payload.email, payload.phone, payload.postcode, payload.fname, payload.lname].filter(Boolean).length;
    if (!payload.reg && meaningfulDetails < 2) return NextResponse.json({ error: "Lead must include a registration or meaningful bike/customer details." }, { status: 400 });
    const { data, error } = await getSupabaseAdminClient().from("website_leads").insert(payload).select("id").single();
    if (error) {
      console.error("Website leads webhook insert failed.", { code: error.code, message: error.message });
      return NextResponse.json({ error: "Unable to save website lead." }, { status: 500 });
    }
    console.info("Website lead created from webhook.", { id: data.id, source: payload.website ?? "unknown" });
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    console.error("Website leads webhook request failed.", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
}

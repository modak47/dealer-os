import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { safeNumber } from "@/lib/website-leads";

export type RetailCheckRecord = Record<string, unknown> & { id: number | string; Status?: string; created_at?: string };

export type RetailCheckInput = {
  registration: string;
  make?: string | null;
  model?: string | null;
  year?: string | null;
  mileage?: string | null;
  askingPrice?: string | null;
};

export async function createRetailCheck(input: RetailCheckInput): Promise<RetailCheckRecord> {
  const { data, error } = await getSupabaseAdmin().from("retail_checks").insert([{
    Registration: input.registration,
    Make: input.make ?? "",
    Model: input.model ?? "",
    Year: String(input.year ?? ""),
    Mileage: String(input.mileage ?? ""),
    "Asking Price": String(input.askingPrice ?? ""),
    Status: "Pending",
  }]).select().single();
  if (error) throw new Error(error.message || "Unable to create Retail Check");
  return data as RetailCheckRecord;
}

export async function getRetailCheck(id: string | number): Promise<RetailCheckRecord | null> {
  const { data, error } = await getSupabaseAdmin().from("retail_checks").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message || "Unable to load Retail Check");
  return data as RetailCheckRecord | null;
}

export async function waitForRetailCheck(id: string | number, timeoutMs = 75000, intervalMs = 5000): Promise<RetailCheckRecord> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const record = await getRetailCheck(id);
    if (!record) throw new Error("Retail Check not found");
    if (record.Status === "Checked") return record;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error("Valuation timed out");
}

export function extractRetailCheckWebsiteLeadUpdates(record: RetailCheckRecord) {
  const retail = safeNumber(record["Market Retail"]);
  const offer = safeNumber(record["Suggested Offer"]);
  const margin = safeNumber(record["Available Margin"]) ?? (retail !== null && offer !== null ? retail - offer : null);
  const comparableSummary = typeof record["Comparable Summary"] === "string" ? record["Comparable Summary"] : null;
  return {
    retail_estimate: retail,
    suggested_offer: offer,
    estimated_margin: margin,
    valuation_notes: [
      record["Buy Decision"] ? `Buy decision: ${String(record["Buy Decision"])}` : "",
      record["Confidence"] ? `Confidence: ${String(record["Confidence"])}` : "",
      record["Opportunity Score"] ? `Opportunity score: ${String(record["Opportunity Score"])}` : "",
    ].filter(Boolean).join("\n") || null,
    similar_bikes: comparableSummary,
    auto_trader_search: extractFirstUrl(comparableSummary),
  };
}

function extractFirstUrl(value: string | null): string | null {
  return value?.match(/https?:\/\/[^\s"'<>),]+/i)?.[0] ?? null;
}

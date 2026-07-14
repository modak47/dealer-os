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
  requestId?: string | null;
};

export async function createRetailCheck(input: RetailCheckInput): Promise<RetailCheckRecord> {
  const registration = String(input.registration ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!registration) throw new Error("Registration is required.");
  if (input.mileage !== undefined && input.mileage !== null && input.mileage !== "" && !Number.isFinite(Number(input.mileage))) throw new Error("Mileage must be a number.");
  if (input.askingPrice !== undefined && input.askingPrice !== null && input.askingPrice !== "" && !Number.isFinite(Number(input.askingPrice))) throw new Error("Asking price must be a number.");
  const requestId = input.requestId || crypto.randomUUID();
  const existing = await getRetailCheckByRequestId(requestId);
  if (existing) return existing;

  const { data, error } = await getSupabaseAdmin().from("retail_checks").insert([{
    Registration: registration,
    Make: input.make ?? "",
    Model: input.model ?? "",
    Year: String(input.year ?? ""),
    Mileage: String(input.mileage ?? ""),
    "Asking Price": String(input.askingPrice ?? ""),
    Status: "Pending",
    "Progress Stage": "Queued",
    "Progress Message": "Your retail check has been queued.",
    "Progress Percent": 0,
    "Queued At": new Date().toISOString(),
    "Request ID": requestId,
  }]).select().single();
  if (error) {
    if (requestId && /duplicate|unique/i.test(error.message || "")) {
      const duplicate = await getRetailCheckByRequestId(requestId);
      if (duplicate) return duplicate;
    }
    throw new Error(error.message || "Unable to create Retail Check");
  }
  return data as RetailCheckRecord;
}

export async function getRetailCheck(id: string | number): Promise<RetailCheckRecord | null> {
  const { data, error } = await getSupabaseAdmin().from("retail_checks").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message || "Unable to load Retail Check");
  return data as RetailCheckRecord | null;
}

export async function getRetailCheckByRequestId(requestId: string): Promise<RetailCheckRecord | null> {
  if (!requestId) return null;
  const { data, error } = await getSupabaseAdmin().from("retail_checks").select("*").eq("Request ID", requestId).maybeSingle();
  if (error) throw new Error(error.message || "Unable to load Retail Check");
  return data as RetailCheckRecord | null;
}

export async function retryRetailCheck(id: string | number): Promise<RetailCheckRecord> {
  const current = await getRetailCheck(id);
  if (!current) throw new Error("Retail Check not found");
  if (current.Status !== "Failed") throw new Error("Only failed Retail Checks can be retried.");
  const { data, error } = await getSupabaseAdmin().from("retail_checks").update({
    Status: "Pending",
    "Progress Stage": "Queued",
    "Progress Message": "Your retail check has been queued.",
    "Progress Percent": 0,
    "Queued At": new Date().toISOString(),
    "Processing Started At": null,
    "Processing Heartbeat At": null,
    "Failed At": null,
    "Last Error": null,
    "Worker ID": null,
  }).eq("id", id).eq("Status", "Failed").select("*").single();
  if (error) throw new Error(error.message || "Unable to retry Retail Check");
  return data as RetailCheckRecord;
}

export async function waitForRetailCheck(id: string | number, timeoutMs = 75000, intervalMs = 5000): Promise<RetailCheckRecord> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const record = await getRetailCheck(id);
    if (!record) throw new Error("Retail Check not found");
    if (["Checked", "Manual Review", "Failed", "Cancelled"].includes(String(record.Status))) return record;
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

import { OPPORTUNITY_STATUSES, type Opportunity, type OpportunityStatus } from "./types";

const managementFields = ["notes", "status", "favourite", "hidden", "updated_at"] as const;
const NEW_LISTING_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function isOpportunityStatus(value: unknown): value is OpportunityStatus {
  return typeof value === "string" && OPPORTUNITY_STATUSES.some((status) => status === value);
}

function dateString(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? value : null;
}

function integer(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function ukDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? 0),
    month: Number(parts.find((part) => part.type === "month")?.value ?? 1),
    day: Number(parts.find((part) => part.type === "day")?.value ?? 1),
  };
}

function daysLiveFromFirstSeen(firstSeenAt: string | null): number | null {
  if (!firstSeenAt) return null;
  const firstSeen = new Date(firstSeenAt);
  if (Number.isNaN(firstSeen.getTime())) return null;

  const first = ukDateParts(firstSeen);
  const today = ukDateParts(new Date());
  const firstUtc = Date.UTC(first.year, first.month - 1, first.day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);

  return Math.max(0, Math.floor((todayUtc - firstUtc) / NEW_LISTING_THRESHOLD_MS));
}

function isNewListing(firstSeenAt: string | null): boolean {
  if (!firstSeenAt) return false;
  const firstSeen = new Date(firstSeenAt).getTime();
  if (Number.isNaN(firstSeen)) return false;
  const age = Date.now() - firstSeen;
  return age >= 0 && age <= NEW_LISTING_THRESHOLD_MS;
}

export function normalizeOpportunity(row: Record<string, unknown>): Opportunity {
  const listingFirstSeenAt = dateString(row.listingFirstSeenAt ?? row["First Seen Date"]);
  const listingLastConfirmedAt = dateString(row.listingLastConfirmedAt);
  const calculatedDaysLive = daysLiveFromFirstSeen(listingFirstSeenAt);
  const listingDaysLive = calculatedDaysLive ?? integer(row.listingDaysLive ?? row["Days Live"]);

  return {
    ...(row as unknown as Opportunity),
    listingFirstSeenAt,
    listingLastConfirmedAt,
    listingDaysLive,
    isNewListing: isNewListing(listingFirstSeenAt),
    "First Seen Date": listingFirstSeenAt,
    "Days Live": listingDaysLive,
    notes: typeof row.notes === "string" ? row.notes : null,
    status: isOpportunityStatus(row.status) ? row.status : "New",
    favourite: row.favourite === true,
    hidden: row.hidden === true,
    seen: row.seen === true,
    last_seen: typeof row.last_seen === "string" ? row.last_seen : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    primary_image_url: typeof row.primary_image_url === "string" ? row.primary_image_url : null,
    "Advert URL": typeof row["Advert URL"] === "string" ? row["Advert URL"] : null,
  };
}

export function normalizeOpportunities(rows: unknown[]): Opportunity[] {
  return rows.map((row) => normalizeOpportunity(row as Record<string, unknown>));
}

export function opportunitySchemaError(rows: unknown[]): string | null {
  const firstRow = rows[0];
  if (!firstRow || typeof firstRow !== "object") return null;

  const missing = managementFields.filter((field) => !(field in firstRow));
  return missing.length
    ? `Opportunity Tracker fields are missing in Supabase: ${missing.join(", ")}. Apply the latest migration.`
    : null;
}

import { OPPORTUNITY_STATUSES, type Opportunity, type OpportunityStatus } from "./types";

const managementFields = ["notes", "status", "favourite", "hidden", "updated_at"] as const;

function isOpportunityStatus(value: unknown): value is OpportunityStatus {
  return typeof value === "string" && OPPORTUNITY_STATUSES.some((status) => status === value);
}

export function normalizeOpportunity(row: Record<string, unknown>): Opportunity {
  return {
    ...(row as unknown as Opportunity),
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

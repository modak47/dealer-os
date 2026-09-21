export const leadViews = ["all", "needs_review", "ready", "released", "active", "closed", "archived", "backlog"] as const;
export type LeadView = typeof leadViews[number];
export type LeadListRow = {
  id: number; public_id: string; received_at: string; received_date_basis: string;
  lead_source: string | null; reg: string | null; make: string | null; model: string | null;
  year: string | null; mileage: string | null; price: string | null; location_town: string | null;
  status: string; opportunity_mode: string; marketplace_status: string | null;
  portal_reviewed_at: string | null; portal_ready_at: string | null; archived_at: string | null;
  valuation_status: string | null; retail_estimate: number | null; suggested_offer: number | null;
  estimated_margin: number | null; vehicle_check_status: string | null; photo_count: number;
  thumbnail_url: string | null;
};
export type LeadListPage = { leads: LeadListRow[]; nextCursor: string | null; hasMore: boolean };
export type LeadCounts = { total: number; new: number; pendingValuations: number; receivedToday: number; receivedThisWeek: number; purchasedThisMonth: number; sourceCounts: Record<string, number>; sourceOptions?: string[]; ready: number; released: number; needsReview: number };

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
export function londonMidnight(day: string) {
  if (!dayPattern.test(day) || new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error("Invalid date range.");
  const candidate = new Date(`${day}T00:00:00Z`);
  const midnightHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(candidate));
  return new Date(candidate.getTime() - (midnightHour === 1 ? 1 : 0) * 3600000).toISOString();
}
export function shiftDay(day: string, amount: number) { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10); }
export function londonDay(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function listFilters(params: URLSearchParams, now = new Date()) {
  const q = (params.get("q") ?? "").trim().slice(0, 160);
  const period = q ? "all" : params.get("period") ?? "all";
  const today = londonDay(now);
  let from: string | null = null, to: string | null = null;
  if (["today", "7", "30"].includes(period)) {
    from = londonMidnight(shiftDay(today, period === "today" ? 0 : 1 - Number(period)));
    to = londonMidnight(shiftDay(today, 1));
  } else if (period === "custom") {
    const start = params.get("from") ?? "", end = params.get("to") ?? "";
    from = londonMidnight(start); to = londonMidnight(shiftDay(end, 1)); londonMidnight(end);
    if (start > end) throw new Error("Start date must be before end date.");
  } else if (period !== "all") throw new Error("Invalid date filter.");
  const view = params.get("view") ?? "all";
  if (!leadViews.includes(view as LeadView)) throw new Error("Invalid queue view.");
  const mode = params.get("mode") ?? "";
  if (mode && !["direct_claim", "marketplace_offer"].includes(mode)) throw new Error("Invalid opportunity mode.");
  return { q, from, to, view, mode, source: params.get("source") ?? "", status: params.get("status") ?? "", review: params.get("review") ?? "", include_archived: params.get("include_archived") === "true" || view === "archived", backlog_before: londonMidnight(shiftDay(today, -30)) };
}
export function encodeLeadCursor(row: Pick<LeadListRow, "received_at" | "id">, filters: ReturnType<typeof listFilters>) {
  return Buffer.from(JSON.stringify({ at: row.received_at, id: row.id, scope: JSON.stringify(filters) })).toString("base64url");
}
export function decodeLeadCursor(value: string | null, filters: ReturnType<typeof listFilters>) {
  if (!value) return null;
  try {
    if (value.length > 4000) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString());
    if (!Number.isSafeInteger(cursor.id) || cursor.id < 1 || typeof cursor.at !== "string" || !Number.isFinite(Date.parse(cursor.at)) || cursor.scope !== JSON.stringify(filters)) throw new Error();
    return { at: cursor.at as string, id: cursor.id as number };
  } catch { throw new Error("Invalid or outdated page cursor. Refresh the results."); }
}

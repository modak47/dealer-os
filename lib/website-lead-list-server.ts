import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { decodeLeadCursor, encodeLeadCursor, listFilters, type LeadListRow, type LeadListPage } from "@/lib/website-lead-list";
import { combineLeadImages } from "@/lib/website-leads";

const publicListKeys = ["id", "public_id", "received_at", "received_date_basis", "lead_source", "reg", "make", "model", "year", "mileage", "price", "location_town", "status", "opportunity_mode", "marketplace_status", "portal_reviewed_at", "portal_ready_at", "archived_at", "valuation_status", "retail_estimate", "suggested_offer", "estimated_margin", "vehicle_check_status", "photo_count"] as const;

export async function loadLeadList(params: URLSearchParams): Promise<LeadListPage> {
  const filters = listFilters(params);
  const cursor = decodeLeadCursor(params.get("cursor"), filters);
  const requested = Number(params.get("limit") ?? 50);
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 50) : 50;
  const db = getSupabaseAdminClient();
  const { data, error } = await db.rpc("staff_website_leads_list", { p_filters: filters, p_at: cursor?.at ?? null, p_id: cursor?.id ?? null, p_limit: limit + 1 });
  if (error) throw new Error(error.code === "PGRST202" || error.code === "42703" ? "Website Leads migration required. Ask an administrator to apply the reviewed SQL." : "Unable to load website leads.");
  type InternalRow = LeadListRow & { thumbnail_bucket: string | null; thumbnail_path: string | null };
  const rows = (data ?? []) as InternalRow[];
  const page = rows.slice(0, limit);
  const groups = new Map<string, string[]>();
  for (const row of page) if (row.thumbnail_bucket && row.thumbnail_path) groups.set(row.thumbnail_bucket, [...(groups.get(row.thumbnail_bucket) ?? []), row.thumbnail_path]);
  const signed = new Map<string, string>();
  await Promise.all([...groups].map(async ([bucket, paths]) => {
    const { data } = await db.storage.from(bucket).createSignedUrls([...new Set(paths)], 900);
    for (const photo of data ?? []) if (photo.path && photo.signedUrl) signed.set(`${bucket}/${photo.path}`, photo.signedUrl);
  }));
  const leads = page.map(({ thumbnail_bucket, thumbnail_path, ...row }) => {
    const legacy = row.thumbnail_url ? combineLeadImages({ images: [row.thumbnail_url], Images: null, image1: null, image2: null, image3: null, image4: null, image5: null, image6: null, image7: null, image8: null, image9: null, image10: null })[0] : null;
    // An explicit HTTP allowlist also protects against a future RPC adding a blob/customer field.
    return { ...Object.fromEntries(publicListKeys.map(key => [key, row[key]])), thumbnail_url: thumbnail_bucket ? signed.get(`${thumbnail_bucket}/${thumbnail_path}`) ?? null : legacy ?? null } as LeadListRow;
  });
  return { leads, hasMore: rows.length > limit, nextCursor: rows.length > limit && page.length ? encodeLeadCursor(page[page.length - 1], filters) : null };
}

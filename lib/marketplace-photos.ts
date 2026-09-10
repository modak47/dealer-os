import type { SupabaseClient } from "@supabase/supabase-js";

export type MarketplacePhotoRow = {
  website_lead_id: number | null;
  storage_bucket: string;
  storage_path: string;
  sort_order: number | null;
  status: string | null;
};

export async function signedMarketplacePhotoUrls(db: SupabaseClient, websiteLeadIds: number[], expiresIn = 60 * 15) {
  const ids = Array.from(new Set(websiteLeadIds.filter(id => Number.isInteger(id) && id > 0)));
  const urlsByLeadId = new Map<number, string[]>();
  if (!ids.length) return urlsByLeadId;
  const { data, error } = await db
    .from("lead_photos")
    .select("website_lead_id,storage_bucket,storage_path,sort_order,status")
    .in("website_lead_id", ids)
    .neq("status", "removed")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  for (const photo of (data ?? []) as MarketplacePhotoRow[]) {
    if (!photo.website_lead_id) continue;
    const signed = await db.storage.from(photo.storage_bucket).createSignedUrl(photo.storage_path, expiresIn);
    if (signed.error || !signed.data?.signedUrl) continue;
    urlsByLeadId.set(photo.website_lead_id, [...(urlsByLeadId.get(photo.website_lead_id) ?? []), signed.data.signedUrl]);
  }
  return urlsByLeadId;
}

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { StockAttachment } from "@/lib/stock-attachment-types";
export { isStockAttachmentType, stockAttachmentTypes, type StockAttachmentType, type StockAttachment } from "@/lib/stock-attachment-types";

export const stockDocumentsBucket = "stock-documents";

export function safeFileName(value: string) {
  const cleaned = value.replace(/[^\w.\-() ]+/g, "-").replace(/\s+/g, " ").trim();
  return cleaned || "document";
}

export function stockDocumentPath(stockBikeId: string, fileName: string) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return `${stockBikeId}/${suffix}-${safeFileName(fileName)}`;
}

export async function getStockAttachments(stockBikeId: string): Promise<{ attachments: StockAttachment[]; migrationReady: boolean; error?: string }> {
  const { data, error } = await getSupabaseAdmin().from("stock_attachments").select("*").eq("stock_bike_id", stockBikeId).order("created_at", { ascending: false });
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code)) return { attachments: [], migrationReady: false, error: "Run the stock attachments migration in Supabase." };
    console.error("Unable to load stock attachments", error);
    return { attachments: [], migrationReady: true, error: "Unable to load stock attachments." };
  }
  return { attachments: (data || []) as StockAttachment[], migrationReady: true };
}

export async function createSignedAttachmentUrl(filePath: string) {
  const { data, error } = await getSupabaseAdmin().storage.from(stockDocumentsBucket).createSignedUrl(filePath, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}

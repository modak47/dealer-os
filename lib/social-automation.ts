import "server-only";

import { getPublicStockBikes, type PublicStockBike } from "@/lib/stock";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type SocialChannel = {
  id: string;
  platform: string;
  display_name: string;
  status: "not_connected" | "connected" | "paused" | "error";
  posting_enabled: boolean;
  last_error: string | null;
};

export type SocialTemplate = {
  id: string;
  name: string;
  trigger_type: string;
  platform: string | null;
  caption_template: string;
  active: boolean;
  display_order: number;
};

export type SocialQueueItem = {
  id: string;
  stock_bike_id: number | null;
  platform: string;
  status: string;
  caption: string;
  image_url: string | null;
  target_url: string | null;
  scheduled_for: string | null;
  posted_at: string | null;
  error: string | null;
  created_at: string;
  bike?: { make?: string | null; model?: string | null; year?: number | null; registration?: string | null } | null;
};

export type SocialAutomationData = {
  channels: SocialChannel[];
  templates: SocialTemplate[];
  queue: SocialQueueItem[];
  eligibleStock: PublicStockBike[];
  migrationReady: boolean;
  error: string | null;
};

export async function getSocialAutomationData(): Promise<SocialAutomationData> {
  const db = getSupabaseAdmin();
  const [channels, templates, queue, stock] = await Promise.all([
    db.from("social_channels").select("id,platform,display_name,status,posting_enabled,last_error").order("platform"),
    db.from("social_post_templates").select("id,name,trigger_type,platform,caption_template,active,display_order").order("display_order"),
    db.from("social_post_queue").select("id,stock_bike_id,platform,status,caption,image_url,target_url,scheduled_for,posted_at,error,created_at,bike:stock_bikes(make,model,year,registration)").order("created_at", { ascending: false }).limit(20),
    getPublicStockBikes(),
  ]);
  const missing = [channels, templates, queue].find(result => ["42P01", "42703"].includes(result.error?.code ?? ""));
  if (missing?.error) return { channels: [], templates: [], queue: [], eligibleStock: stock.slice(0, 12), migrationReady: false, error: missing.error.message };
  const hardError = [channels, templates, queue].find(result => result.error);
  if (hardError?.error) throw hardError.error;
  return {
    channels: (channels.data ?? []) as SocialChannel[],
    templates: (templates.data ?? []) as SocialTemplate[],
    queue: (queue.data ?? []) as SocialQueueItem[],
    eligibleStock: stock.filter(bike => bike.photoReady && bike.reserveEnabled && bike.status === "In Stock").slice(0, 12),
    migrationReady: true,
    error: null,
  };
}

export function renderSocialCaption(template: string, bike: PublicStockBike, origin: string) {
  const url = `${origin.replace(/\/$/, "")}/used-bikes/${bike.slug}`;
  const values: Record<string, string> = {
    year: String(bike.year || ""),
    make: bike.make,
    model: bike.model,
    variant: bike.variant,
    price: new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(bike.price),
    mileage: bike.mileage,
    url,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");
}

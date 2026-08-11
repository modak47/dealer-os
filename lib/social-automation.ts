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
  visual_design?: Record<string, unknown> | null;
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
  external_url: string | null;
  error: string | null;
  created_at: string;
  bike?: { make?: string | null; model?: string | null; year?: number | null; registration?: string | null } | null;
};

export type SocialPublishingStatus = {
  platform: string;
  label: string;
  status: "live" | "posted" | "queued" | "draft" | "failed" | "not_started" | "not_connected" | "not_tracked";
  lastUpdated: string | null;
  url: string | null;
  error: string | null;
};

export type SocialPublishingBike = {
  stockBikeId: string;
  title: string;
  price: number;
  status: string;
  image: string;
  website: SocialPublishingStatus;
  channels: SocialPublishingStatus[];
  autotrader: SocialPublishingStatus;
};

export type SocialStockSetting = {
  id: string;
  stock_bike_id: number;
  include_in_rotation: boolean;
  priority: boolean;
  preferred_platform: string | null;
  preferred_template_id: string | null;
  preferred_post_time: string | null;
  max_posts_per_bike: number;
  last_queued_at: string | null;
  notes: string | null;
  updated_at: string;
};

export type SocialAutomationData = {
  channels: SocialChannel[];
  templates: SocialTemplate[];
  queue: SocialQueueItem[];
  eligibleStock: PublicStockBike[];
  publishingOverview: SocialPublishingBike[];
  stockSettings: SocialStockSetting[];
  migrationReady: boolean;
  error: string | null;
};

export async function getSocialAutomationData(): Promise<SocialAutomationData> {
  const db = getSupabaseAdmin();
  const queueColumns = "id,stock_bike_id,platform,status,caption,image_url,target_url,scheduled_for,posted_at,external_url,error,created_at";
  const [channels, templates, queue, queueHistory, stockSettings, stock] = await Promise.all([
    db.from("social_channels").select("id,platform,display_name,status,posting_enabled,last_error").order("platform"),
    db.from("social_post_templates").select("id,name,trigger_type,platform,caption_template,visual_design,active,display_order").order("display_order"),
    db.from("social_post_queue").select(`${queueColumns},bike:stock_bikes(make,model,year,registration)`).order("created_at", { ascending: false }).limit(20),
    db.from("social_post_queue").select(queueColumns).order("created_at", { ascending: false }).limit(500),
    db.from("social_stock_settings").select("id,stock_bike_id,include_in_rotation,priority,preferred_platform,preferred_template_id,preferred_post_time,max_posts_per_bike,last_queued_at,notes,updated_at"),
    getPublicStockBikes(),
  ]);
  const isMissingSchema = (error: { code?: string; message?: string } | null | undefined) =>
    ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(error?.code ?? "") ||
    /schema cache|does not exist|could not find/i.test(error?.message ?? "");
  const missing = [channels, templates, queue, queueHistory].find(result => isMissingSchema(result.error));
  const postReadyStock = stock.filter(bike => bike.photoReady);
  if (missing?.error) return { channels: [], templates: [], queue: [], eligibleStock: postReadyStock.slice(0, 12), publishingOverview: [], stockSettings: [], migrationReady: false, error: missing.error.message };
  const hardError = [channels, templates, queue, queueHistory].find(result => result.error);
  if (hardError?.error) throw hardError.error;
  if (stockSettings.error && !isMissingSchema(stockSettings.error)) throw stockSettings.error;
  const channelRows = (channels.data ?? []) as SocialChannel[];
  const queueRows = (queueHistory.data ?? []) as SocialQueueItem[];
  return {
    channels: channelRows,
    templates: (templates.data ?? []) as SocialTemplate[],
    queue: (queue.data ?? []) as SocialQueueItem[],
    eligibleStock: postReadyStock,
    publishingOverview: buildPublishingOverview(postReadyStock, channelRows, queueRows),
    stockSettings: stockSettings.error ? [] : (stockSettings.data ?? []) as SocialStockSetting[],
    migrationReady: true,
    error: null,
  };
}

function buildPublishingOverview(stock: PublicStockBike[], channels: SocialChannel[], queueRows: SocialQueueItem[]): SocialPublishingBike[] {
  return stock.slice(0, 80).map(bike => {
    const title = `${bike.year || ""} ${bike.make} ${bike.model}`.trim();
    return {
      stockBikeId: bike.id,
      title,
      price: bike.price,
      status: bike.status,
      image: bike.image,
      website: {
        platform: "website",
        label: "Live",
        status: "live",
        lastUpdated: bike.createdTime || null,
        url: `/used-bikes/${bike.slug}`,
        error: null,
      },
      channels: channels.map(channel => channelPublishingStatus(bike, channel, queueRows)),
      autotrader: {
        platform: "autotrader",
        label: "Not tracked",
        status: "not_tracked",
        lastUpdated: null,
        url: null,
        error: "Auto Trader publish status is not wired into Dealer OS yet.",
      },
    };
  });
}

function channelPublishingStatus(bike: PublicStockBike, channel: SocialChannel, queueRows: SocialQueueItem[]): SocialPublishingStatus {
  const rows = queueRows.filter(row => String(row.stock_bike_id ?? "") === bike.id && row.platform === channel.platform);
  const latest = rows.find(row => row.status !== "cancelled" && row.status !== "skipped");
  if (!latest) {
    return {
      platform: channel.platform,
      label: channel.status === "connected" || channel.posting_enabled ? "Not queued" : "Not connected",
      status: channel.status === "connected" || channel.posting_enabled ? "not_started" : "not_connected",
      lastUpdated: null,
      url: null,
      error: channel.last_error,
    };
  }
  const posted = latest.status === "posted";
  const failed = latest.status === "failed";
  const draft = latest.status === "draft";
  return {
    platform: channel.platform,
    label: posted ? "Posted" : failed ? "Failed" : draft ? "Draft" : "Queued",
    status: posted ? "posted" : failed ? "failed" : draft ? "draft" : "queued",
    lastUpdated: latest.posted_at || latest.scheduled_for || latest.created_at,
    url: latest.external_url || latest.target_url,
    error: latest.error,
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

export function getSocialPublicOrigin(fallbackOrigin = "https://yesmoto.co.uk") {
  return (
    process.env.SOCIAL_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_SOCIAL_SITE_URL ||
    fallbackOrigin ||
    "https://yesmoto.co.uk"
  ).replace(/\/$/, "");
}

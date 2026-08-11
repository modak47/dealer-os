import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { cleanText } from "@/lib/crm-validation";
import { getSocialPublicOrigin, renderSocialCaption } from "@/lib/social-automation";
import { getPublicStockBikes } from "@/lib/stock";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { stock_bike_id?: string | number; bike_id?: string | number; template_id?: string; platform?: string; scheduled_for?: string };
    const stockBikeId = cleanText(String(body.stock_bike_id ?? body.bike_id ?? ""), 40);
    const templateId = cleanText(body.template_id, 40);
    const platform = cleanText(body.platform, 40) || "facebook";
    if (!stockBikeId) return NextResponse.json({ error: "Choose a bike." }, { status: 400 });
    if (!templateId) return NextResponse.json({ error: "Choose a template." }, { status: 400 });
    const db = getSupabaseAdmin();
    const [{ data: template, error: templateError }, stock, userId] = await Promise.all([
      db.from("social_post_templates").select("*").eq("id", templateId).eq("active", true).single(),
      getPublicStockBikes(),
      getCurrentUserId(),
    ]);
    if (templateError) throw templateError;
    const bike = stock.find(item => String(item.id) === stockBikeId);
    if (!bike) return NextResponse.json({ error: "This bike is not currently eligible for public social posting." }, { status: 400 });
    if (!bike.photoReady) return NextResponse.json({ error: "This bike needs real photos before it can be queued for social posting." }, { status: 400 });
    const origin = getSocialPublicOrigin(new URL(request.url).origin);
    const caption = renderSocialCaption(String(template.caption_template), bike, origin);
    const templateImage = staticTemplateImage(template.visual_design, template.name);
    const { data, error } = await db.from("social_post_queue").insert({
      stock_bike_id: Number(bike.id),
      template_id: template.id,
      platform,
      status: "draft",
      caption,
      image_url: templateImage || bike.image,
      target_url: `${origin.replace(/\/$/, "")}/used-bikes/${bike.slug}`,
      scheduled_for: cleanText(body.scheduled_for) || null,
      created_by: userId,
      metadata: { source: "dealeros_manual_queue" },
    }).select("id").single();
    if (error) throw error;
    return NextResponse.json({ postId: data.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to queue social post." }, { status: 400 });
  }
}

function staticTemplateImage(value: unknown, name?: unknown) {
  const design = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const image = typeof design.staticImageUrl === "string" ? design.staticImageUrl.trim() : "";
  const cleanImage = cleanStaticImage(image);
  if (cleanImage) return cleanImage;
  return staticTemplateCreative(typeof name === "string" ? name : "");
}

function cleanStaticImage(image: string) {
  if (!image) return "";
  if (image.startsWith("/")) return image;
  if (/^https:\/\//i.test(image)) return image;
  return "";
}

function staticTemplateCreative(name: string) {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!key) return "";
  if (key.includes("finance options")) return "/images/social-templates/finance-options.png";
  if (key.includes("delivery available")) return "/images/social-templates/delivery-available.png";
  if (key.includes("part exchange upgrade")) return "/images/social-templates/part-exchange-upgrade.png";
  if (key.includes("we buy motorbikes")) return "/images/social-templates/we-buy-motorbikes.png";
  if (key === "awaiting preparation") return "/images/social-templates/awaiting-preparation-layout-a.png";
  if (key.includes("price top")) return "/images/social-templates/awaiting-preparation-layout-b.png";
  if (key.includes("price middle")) return "/images/social-templates/awaiting-preparation-layout-c.png";
  if (key.includes("clean")) return "/images/social-templates/awaiting-preparation-layout-d.png";
  if (key.includes("stock hero")) return "/images/social-templates/stock-hero-reviews.png";
  return "";
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { id?: string; status?: string };
    const id = cleanText(body.id, 80);
    const status = cleanText(body.status, 40);
    const allowed = new Set(["draft", "approved", "cancelled"]);
    if (!id) return NextResponse.json({ error: "Post ID is required." }, { status: 400 });
    if (!allowed.has(status)) return NextResponse.json({ error: "Choose a valid queue status." }, { status: 400 });
    const db = getSupabaseAdmin();
    const { error } = await db.from("social_post_queue").update({
      status,
      error: null,
      metadata: { source: "dealeros_manual_status_update" },
    }).eq("id", id).in("status", ["draft", "approved", "failed", "cancelled"]);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update social post." }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { cleanText } from "@/lib/crm-validation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const layouts = new Set(["single", "multi", "spotlight"]);
const backgrounds = new Set(["light", "dark"]);
const pricePositions = new Set(["top-right", "top-left", "bottom-right", "bottom-left", "under-title", "top", "middle", "bottom"]);
const presets = new Set(["finance", "delivery", "part_exchange", "we_buy", "awaiting_prep", "stock_hero", "default"]);

export async function PATCH(request: Request) {
  try {
    await getCurrentUserId();
    const body = await request.json() as { id?: string; name?: string; caption_template?: string; active?: boolean; platform?: string | null; visual_design?: Record<string, unknown> };
    const id = cleanText(body.id, 80);
    if (!id) return NextResponse.json({ error: "Template ID is required." }, { status: 400 });
    const caption = cleanText(body.caption_template, 2000);
    if (!caption) return NextResponse.json({ error: "Caption template is required." }, { status: 400 });
    const visual = cleanVisualDesign(body.visual_design ?? {});
    const payload = {
      name: cleanText(body.name, 120) || "Social template",
      caption_template: caption,
      active: body.active !== false,
      platform: cleanText(body.platform, 40) || null,
      visual_design: visual,
    };
    const { data, error } = await getSupabaseAdmin()
      .from("social_post_templates")
      .update(payload)
      .eq("id", id)
      .select("id,name,trigger_type,platform,caption_template,visual_design,active,display_order")
      .single();
    if (error) throw error;
    return NextResponse.json({ template: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save social template." }, { status: 400 });
  }
}

function cleanVisualDesign(input: Record<string, unknown>) {
  const preset = cleanText(input.preset, 40);
  const layout = cleanText(input.layout, 40);
  const background = cleanText(input.background, 40);
  const pricePosition = cleanText(input.pricePosition, 40);
  return {
    preset: presets.has(preset) ? preset : "default",
    layout: layouts.has(layout) ? layout : "single",
    accent: /^#[0-9a-f]{6}$/i.test(cleanText(input.accent, 20)) ? cleanText(input.accent, 20) : "#00e51d",
    background: backgrounds.has(background) ? background : "light",
    badge: cleanText(input.badge, 80),
    headline: cleanText(input.headline, 160),
    subline: cleanText(input.subline, 180),
    strapline: cleanText(input.strapline, 180),
    footer: cleanText(input.footer, 180),
    staticImageUrl: cleanStaticImageUrl(input.staticImageUrl),
    showPrice: input.showPrice !== false,
    pricePosition: pricePositions.has(pricePosition) ? pricePosition : "under-title",
    showBrand: input.showBrand !== false,
    showThumbs: input.showThumbs !== false,
  };
}

function cleanStaticImageUrl(value: unknown) {
  const url = cleanText(value, 300);
  if (!url) return "";
  if (url.startsWith("/images/social-templates/") && /\.(png|jpg|jpeg|webp)$/i.test(url)) return url;
  if (/^https:\/\/[^\s]+$/i.test(url)) return url;
  return "";
}

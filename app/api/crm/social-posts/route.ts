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
    const { data, error } = await db.from("social_post_queue").insert({
      stock_bike_id: Number(bike.id),
      template_id: template.id,
      platform,
      status: "draft",
      caption,
      image_url: bike.image,
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

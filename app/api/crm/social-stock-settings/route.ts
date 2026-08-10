import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { cleanText } from "@/lib/crm-validation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as {
      stock_bike_id?: string | number;
      include_in_rotation?: boolean;
      priority?: boolean;
      preferred_platform?: string | null;
      preferred_template_id?: string | null;
      preferred_post_time?: string | null;
      max_posts_per_bike?: number;
      notes?: string | null;
    };
    const stockBikeId = Number(body.stock_bike_id);
    if (!Number.isInteger(stockBikeId) || stockBikeId <= 0) return NextResponse.json({ error: "Choose a valid stock bike." }, { status: 400 });

    const payload: Record<string, unknown> = {
      stock_bike_id: stockBikeId,
      created_by: await getCurrentUserId(),
    };
    if (typeof body.include_in_rotation === "boolean") payload.include_in_rotation = body.include_in_rotation;
    if (typeof body.priority === "boolean") payload.priority = body.priority;
    if ("preferred_platform" in body) payload.preferred_platform = cleanText(body.preferred_platform, 40) || null;
    if ("preferred_template_id" in body) payload.preferred_template_id = cleanText(body.preferred_template_id, 80) || null;
    if ("preferred_post_time" in body) payload.preferred_post_time = cleanText(body.preferred_post_time, 20) || null;
    if (typeof body.max_posts_per_bike === "number" && Number.isFinite(body.max_posts_per_bike)) payload.max_posts_per_bike = Math.max(1, Math.round(body.max_posts_per_bike));
    if ("notes" in body) payload.notes = cleanText(body.notes, 1000) || null;

    const { data, error } = await getSupabaseAdmin()
      .from("social_stock_settings")
      .upsert(payload, { onConflict: "stock_bike_id" })
      .select("id,stock_bike_id,include_in_rotation,priority,preferred_platform,preferred_template_id,preferred_post_time,max_posts_per_bike,last_queued_at,notes,updated_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ setting: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update social stock settings." }, { status: 400 });
  }
}

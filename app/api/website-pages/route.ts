import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listWebsitePages, sanitiseWebsitePage } from "@/lib/website-pages";

export async function GET() {
  return NextResponse.json(await listWebsitePages());
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const page = sanitiseWebsitePage(body);
    const payload = { ...page, updated_by: await getCurrentUserId() };
    const { data, error } = await getSupabaseAdmin().from("website_pages").upsert(payload, { onConflict: "slug" }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ page: data });
  } catch (error) {
    console.error("Website page save failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save website page." }, { status: 500 });
  }
}

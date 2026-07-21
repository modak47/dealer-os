import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function portalCode() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getSupabaseAdmin();
    for (let attempt = 0; attempt < 5; attempt++) {
      const nextCode = portalCode();
      const { data, error } = await db
        .from("crm_customers")
        .update({ portal_access_code: nextCode })
        .eq("id", id)
        .select("id,portal_access_code")
        .maybeSingle();

      if (!error && data) return NextResponse.json({ customer: data });
      if (error?.code !== "23505") return NextResponse.json({ error: error?.message || "Customer not found." }, { status: data ? 500 : 404 });
    }
    return NextResponse.json({ error: "Unable to generate a unique portal code." }, { status: 500 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to regenerate portal code." }, { status: 500 });
  }
}

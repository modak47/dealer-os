import { NextResponse } from "next/server";
import { cleanDealerAccountPayload } from "@/lib/dealer-portal";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { DealerPortalAccount } from "@/types/dealer-portal";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    const { id } = await params;
    const userId = await getCurrentUserId();
    const body = await request.json() as Record<string, unknown>;
    const payload = cleanDealerAccountPayload(body, userId, false);
    const { data, error } = await getSupabaseAdminClient()
      .from("dealer_portal_accounts")
      .update(payload)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: `Unable to update dealer portal account: ${error.message}` }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Dealer portal account not found." }, { status: 404 });
    return NextResponse.json({ account: data as DealerPortalAccount });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update dealer portal account." }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { recordDealerPortalAuditEvent } from "@/lib/dealer-portal-audit";
import { cleanDealerAccountPayload, dealerStaffAccountChangeSummary, saveDealerPreferencePayloads, withDealerPreferences } from "@/lib/dealer-portal";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { DealerPortalAccount, DealerPortalAccountWithPreferences } from "@/types/dealer-portal";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    const { id } = await params;
    const userId = await getCurrentUserId();
    const body = await request.json() as Record<string, unknown>;
    const payload = cleanDealerAccountPayload(body, userId, false);
    const db = getSupabaseAdminClient();
    const previous = await db.from("dealer_portal_accounts").select("*").eq("id", id).maybeSingle();
    if (previous.error) return NextResponse.json({ error: "Unable to load dealer portal account." }, { status: 500 });
    const { data, error } = await getSupabaseAdminClient()
      .from("dealer_portal_accounts")
      .update(payload)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: `Unable to update dealer portal account: ${error.message}` }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Dealer portal account not found." }, { status: 404 });
    const changes = dealerStaffAccountChangeSummary(previous.data as Record<string, unknown> | null, payload);
    if (Object.keys(changes).length) {
      await recordDealerPortalAuditEvent({
        eventType: "dealer_account_staff_updated",
        dealerAccountId: id,
        dealerUserId: userId,
        eventData: { changed_fields: Object.keys(changes), changes },
      });
    }
    await saveDealerPreferencePayloads(id, body, userId);
    return NextResponse.json({ account: await withDealerPreferences(data as DealerPortalAccount) as DealerPortalAccountWithPreferences });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update dealer portal account." }, { status: 400 });
  }
}

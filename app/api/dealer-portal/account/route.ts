import { NextResponse } from "next/server";
import { recordDealerPortalAuditEvent } from "@/lib/dealer-portal-audit";
import { cleanDealerSelfAccountPayload, dealerSelfAccountChangeSummary, getCurrentDealerPortalAccount, isDealerPortalAdmin, saveDealerPreferencePayloads, withDealerPreferences } from "@/lib/dealer-portal";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { DealerPortalAccount, DealerPortalAccountWithPreferences } from "@/types/dealer-portal";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const session = await getCurrentDealerPortalAccount();
    if (!session) return NextResponse.json({ error: "Dealer portal access is not available for this user." }, { status: 401 });
    if (!isDealerPortalAdmin(session)) return NextResponse.json({ error: "Dealer Admin access is required to update account settings." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const accountPayload = cleanDealerSelfAccountPayload(body);
    const previous = session.dealer as unknown as Record<string, unknown>;
    const { data, error } = await getSupabaseAdminClient()
      .from("dealer_portal_accounts")
      .update(accountPayload)
      .eq("id", session.dealer.id)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: `Unable to update dealer account: ${error.message}` }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Dealer account not found." }, { status: 404 });
    const changes = dealerSelfAccountChangeSummary(previous, accountPayload);
    if (Object.keys(changes).length) {
      await recordDealerPortalAuditEvent({
        eventType: "dealer_account_self_updated",
        dealerAccountId: session.dealer.id,
        dealerUserId: session.userId,
        eventData: { changed_fields: Object.keys(changes), changes },
      });
    }
    await saveDealerPreferencePayloads(session.dealer.id, body, session.userId);
    return NextResponse.json({ dealer: await withDealerPreferences(data as DealerPortalAccount) as DealerPortalAccountWithPreferences });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update dealer account." }, { status: 400 });
  }
}

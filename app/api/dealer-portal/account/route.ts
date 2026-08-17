import { NextResponse } from "next/server";
import { cleanDealerSelfAccountPayload, getCurrentDealerPortalAccount, saveDealerPreferencePayloads, withDealerPreferences } from "@/lib/dealer-portal";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { DealerPortalAccount, DealerPortalAccountWithPreferences } from "@/types/dealer-portal";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const session = await getCurrentDealerPortalAccount();
    if (!session) return NextResponse.json({ error: "Dealer portal access is not available for this user." }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const accountPayload = cleanDealerSelfAccountPayload(body);
    const { data, error } = await getSupabaseAdminClient()
      .from("dealer_portal_accounts")
      .update(accountPayload)
      .eq("id", session.dealer.id)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: `Unable to update dealer account: ${error.message}` }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Dealer account not found." }, { status: 404 });
    await saveDealerPreferencePayloads(session.dealer.id, body);
    return NextResponse.json({ dealer: await withDealerPreferences(data as DealerPortalAccount) as DealerPortalAccountWithPreferences });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update dealer account." }, { status: 400 });
  }
}

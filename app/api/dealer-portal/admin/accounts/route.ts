import { NextResponse } from "next/server";
import { recordDealerPortalAuditEvent } from "@/lib/dealer-portal-audit";
import { cleanDealerAccountPayload, saveDealerPreferencePayloads, withDealerPreferences, withDealerPreferencesList } from "@/lib/dealer-portal";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { DealerPortalAccount, DealerPortalAccountWithPreferences } from "@/types/dealer-portal";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  const { data, error } = await getSupabaseAdminClient()
    .from("dealer_portal_accounts")
    .select("*")
    .order("trading_name", { ascending: true });
  if (error) return NextResponse.json({ error: "Unable to load dealer portal accounts." }, { status: 500 });
  return NextResponse.json({ accounts: await withDealerPreferencesList((data ?? []) as DealerPortalAccount[]) });
}

export async function POST(request: Request) {
  try {
    if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    const userId = await getCurrentUserId();
    const body = await request.json() as Record<string, unknown>;
    const payload = cleanDealerAccountPayload(body, userId, true);
    const { data, error } = await getSupabaseAdminClient()
      .from("dealer_portal_accounts")
      .insert(payload)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: `Unable to create dealer portal account: ${error.message}` }, { status: 500 });
    await recordDealerPortalAuditEvent({
      eventType: "dealer_account_created",
      dealerAccountId: data.id,
      dealerUserId: userId,
      eventData: { trading_name: data.trading_name, account_status: data.account_status },
    });
    await saveDealerPreferencePayloads(data.id, body, userId);
    return NextResponse.json({ account: await withDealerPreferences(data as DealerPortalAccount) as DealerPortalAccountWithPreferences }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create dealer portal account." }, { status: 400 });
  }
}

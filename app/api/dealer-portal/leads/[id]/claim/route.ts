import { NextResponse } from "next/server";
import { getCurrentDealerPortalAccount } from "@/lib/dealer-portal";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { DealerLeadClaim } from "@/types/dealer-portal";

export const dynamic = "force-dynamic";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentDealerPortalAccount();
  if (!session) return NextResponse.json({ error: "Dealer portal access is not available for this user." }, { status: 401 });
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: "Invalid lead ID." }, { status: 400 });
  const { data, error } = await getSupabaseAdminClient().rpc("dealer_claim_lead", {
    p_website_lead_id: id,
    p_dealer_account_id: session.dealer.id,
    p_dealer_user_id: session.userId,
  });
  if (error) return NextResponse.json({ error: `Unable to claim lead: ${error.message}` }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Sorry, this lead has just been claimed by another dealer." }, { status: 409 });
  return NextResponse.json({ claim: data as DealerLeadClaim });
}

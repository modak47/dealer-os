import { NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/auth/require-staff";
import { getCurrentUserId } from "@/lib/current-user";
import { assertSingleDealerAccountForUser, cleanDealerPortalUserEmail, cleanDealerPortalUserRole, findAuthUserByEmail } from "@/lib/dealer-portal-users";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type AuthUser = { id: string; email?: string };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await requireStaffUser()) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const email = cleanDealerPortalUserEmail(body.email);
    const role = cleanDealerPortalUserRole(body.role);
    if (!email) return NextResponse.json({ error: "Dealer login email is required." }, { status: 400 });
    const db = getSupabaseAdminClient();
    const account = await db.from("dealer_portal_accounts").select("id,trading_name").eq("id", id).maybeSingle();
    if (account.error) return NextResponse.json({ error: "Unable to load dealer account." }, { status: 500 });
    if (!account.data) return NextResponse.json({ error: "Dealer account not found." }, { status: 404 });

    let authUser = await findAuthUserByEmail(email);
    let invited = false;
    if (!authUser) {
      const invitedUser = await db.auth.admin.inviteUserByEmail(email, {
        data: { full_name: account.data.trading_name, role },
        redirectTo: new URL("/dealer-portal", request.url).toString(),
      });
      if (invitedUser.error) return NextResponse.json({ error: `Unable to invite dealer login: ${invitedUser.error.message}` }, { status: 500 });
      authUser = invitedUser.data.user as AuthUser;
      invited = true;
    }
    await assertSingleDealerAccountForUser(authUser.id, id);

    const staffUserId = await getCurrentUserId();
    const { data, error } = await db.from("dealer_portal_users").upsert({
      dealer_account_id: id,
      user_id: authUser.id,
      role,
      active: true,
      invited_at: new Date().toISOString(),
      created_by: staffUserId,
      updated_by: staffUserId,
    }, { onConflict: "dealer_account_id,user_id" }).select("*").single();
    if (error) return NextResponse.json({ error: `Unable to link dealer login: ${error.message}` }, { status: 500 });
    await db.from("dealer_portal_audit_events").insert({
      dealer_account_id: id,
      dealer_user_id: authUser.id,
      event_type: invited ? "dealer_login_invited" : "dealer_login_linked",
      event_data: { email, role, linked_by: staffUserId },
    });
    return NextResponse.json({ portalUser: data, authUser: { id: authUser.id, email }, invited });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to invite dealer login." }, { status: 400 });
  }
}

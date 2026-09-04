import { NextResponse } from "next/server";
import { getCurrentDealerPortalAccount, isDealerPortalAdmin } from "@/lib/dealer-portal";
import { cleanDealerPortalUserEmail, cleanDealerPortalUserRole, inviteOrLinkDealerPortalUser, listDealerPortalUsersForSession } from "@/lib/dealer-portal-users";
import { isVisualTestRequest } from "@/lib/visual-test-mode";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    if (isVisualTestRequest(request.headers)) {
      return NextResponse.json({ users: [
        { id: "visual-admin", dealer_account_id: "visual-dealer", user_id: "visual-admin-user", role: "dealer_admin", active: true, invited_at: "2026-08-01T09:00:00.000Z", last_seen_at: null, created_at: "2026-08-01T09:00:00.000Z", updated_at: "2026-08-01T09:00:00.000Z", created_by: null, updated_by: null, email: "admin@dwb.example" },
        { id: "visual-user", dealer_account_id: "visual-dealer", user_id: "visual-dealer-user", role: "dealer_user", active: true, invited_at: "2026-08-02T09:00:00.000Z", last_seen_at: null, created_at: "2026-08-02T09:00:00.000Z", updated_at: "2026-08-02T09:00:00.000Z", created_by: null, updated_by: null, email: "sales@dwb.example" },
      ] });
    }
    const session = await getCurrentDealerPortalAccount();
    if (!session) return NextResponse.json({ error: "Dealer portal access is not available for this user." }, { status: 401 });
    if (!isDealerPortalAdmin(session)) return NextResponse.json({ error: "Dealer Admin access is required to manage dealership users." }, { status: 403 });
    return NextResponse.json({ users: await listDealerPortalUsersForSession(session) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load dealership users." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentDealerPortalAccount();
    if (!session) return NextResponse.json({ error: "Dealer portal access is not available for this user." }, { status: 401 });
    if (!isDealerPortalAdmin(session)) return NextResponse.json({ error: "Dealer Admin access is required to manage dealership users." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const email = cleanDealerPortalUserEmail(body.email);
    if (!email) return NextResponse.json({ error: "Dealer user email is required." }, { status: 400 });
    const role = cleanDealerPortalUserRole(body.role);
    const result = await inviteOrLinkDealerPortalUser(session, email, role, request.url);
    return NextResponse.json(result, { status: result.invited ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to invite dealership user." }, { status: 400 });
  }
}
